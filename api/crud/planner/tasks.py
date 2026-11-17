"""Planner tasks."""

from .common import *  # noqa: F401,F403


def maintain_tasks(db: Session, user_id: int) -> None:
    """Apply lazy, KST-based lifecycle transitions for one account."""
    now = _utc_naive_now()
    today = kst_today()
    changed = False

    purged = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.status == "trashed",
            PlannerTask.trashed_at.isnot(None),
            PlannerTask.trashed_at
            <= now - timedelta(days=TRASH_RETENTION_DAYS),
        )
        .delete(synchronize_session=False)
    )
    if purged:
        changed = True

    tasks = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.status.in_(("active", "inactive")),
        )
        .all()
    )
    for task in tasks:
        if task.schedule_type == "undated":
            if task.status != "inactive":
                task.status = "inactive"
                task.inactive_at = task.inactive_at or now
                changed = True
            continue
        if task.start_date is None or task.end_date is None:
            # Undated tasks stay inactive until the user assigns a date.
            if task.status == "active":
                task.status = "inactive"
                task.inactive_at = task.inactive_at or now
                changed = True
            continue
        if task.status == "active" and today > task.end_date:
            task.status = "inactive"
            task.inactive_at = now
            changed = True
        if (
            task.status == "inactive"
            and not task.pinned
            and today
            >= task.end_date + timedelta(days=INACTIVE_RETENTION_DAYS)
        ):
            task.status = "trashed"
            task.trashed_at = now
            changed = True

    if changed:
        db.commit()


def get_tasks(db: Session, user_id: int) -> dict:
    maintain_tasks(db, user_id)
    tasks = (
        db.query(PlannerTask)
        .options(selectinload(PlannerTask.color_relation))
        .filter(PlannerTask.user_id == user_id)
        .order_by(
            PlannerTask.status.asc(),
            PlannerTask.end_date.asc(),
            PlannerTask.id.asc(),
        )
        .all()
    )
    return {
        "today": kst_today(),
        "tasks": [_serialize_task(task) for task in tasks],
    }


def create_task(
    db: Session,
    payload: PlannerTaskCreate,
    user_id: int,
) -> dict:
    title = _clean_title(payload.title)
    notes = _clean_notes(payload.notes)
    color_id = _validate_color_id(db, user_id, payload.color_id)
    pinned = bool(payload.pinned)

    if payload.schedule_type == "undated":
        task = PlannerTask(
            user_id=user_id,
            title=title,
            notes=notes,
            color_id=color_id,
            schedule_type="undated",
            start_date=None,
            deadline_base_date=None,
            end_date=None,
            deadline_days=None,
            status="inactive",
            pinned=pinned,
            inactive_at=_utc_naive_now(),
        )
    elif payload.schedule_type == "single":
        start = _validate_start_date(payload.start_date)
        deadline_days = _validate_deadline_days(payload.deadline_days)
        start, base, end = _single_dates(start, deadline_days)
        task = PlannerTask(
            user_id=user_id,
            title=title,
            notes=notes,
            color_id=color_id,
            schedule_type="single",
            start_date=start,
            deadline_base_date=base,
            end_date=end,
            deadline_days=deadline_days,
            status="active",
            pinned=pinned,
        )
    else:
        start, end = _range_dates(payload.start_date, payload.end_date)
        task = PlannerTask(
            user_id=user_id,
            title=title,
            notes=notes,
            color_id=color_id,
            schedule_type="range",
            start_date=start,
            deadline_base_date=None,
            end_date=end,
            deadline_days=None,
            status="active",
            pinned=pinned,
        )

    if payload.inactive and task.status != "inactive":
        task.status = "inactive"
        task.inactive_at = _utc_naive_now()

    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize_task(task)


def _get_task_or_404(
    db: Session,
    task_id: int,
    user_id: int,
) -> PlannerTask:
    task = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.id == task_id,
            PlannerTask.user_id == user_id,
        )
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="일정을 찾을 수 없습니다.",
        )
    return task


def update_task(
    db: Session,
    task_id: int,
    payload: PlannerTaskUpdate,
    user_id: int,
) -> dict:
    task = _get_task_or_404(db, task_id, user_id)
    data = payload.model_dump(exclude_unset=True)

    if "title" in data:
        task.title = _clean_title(data["title"])
    if "notes" in data:
        task.notes = _clean_notes(data["notes"])
    if "color_id" in data:
        task.color_id = _validate_color_id(
            db,
            user_id,
            data["color_id"],
        )
    if "pinned" in data:
        task.pinned = bool(data["pinned"])

    next_schedule = data.get("schedule_type", task.schedule_type)
    was_undated = task.schedule_type == "undated"

    if next_schedule == "undated":
        task.schedule_type = "undated"
        task.start_date = None
        task.end_date = None
        task.deadline_base_date = None
        task.deadline_days = None
        if task.status not in ("inactive", "trashed"):
            task.status = "inactive"
            task.inactive_at = _utc_naive_now()
        db.commit()
        db.refresh(task)
        return _serialize_task(task)

    start_changed = (
        "start_date" in data
        and data["start_date"] != task.start_date
    )
    end_changed = (
        next_schedule == "range"
        and "end_date" in data
        and data["end_date"] != task.end_date
    )
    deadline_changed = (
        next_schedule == "single"
        and "deadline_days" in data
        and data["deadline_days"] != task.deadline_days
    )
    dates_changed = (
        next_schedule != task.schedule_type
        or start_changed
        or end_changed
        or deadline_changed
    )

    if next_schedule == "single":
        start = data.get("start_date", task.start_date)
        deadline_days = data.get(
            "deadline_days",
            task.deadline_days or 7,
        )
        deadline_days = _validate_deadline_days(deadline_days)
        recompute_dates = (
            next_schedule != task.schedule_type
            or start_changed
            or task.deadline_base_date is None
        )
        if recompute_dates:
            start = _validate_start_date(start, current=task.start_date)
            start, base, end = _single_dates(start, deadline_days)
            task.start_date = start
            task.deadline_base_date = base
            task.end_date = end
        elif deadline_changed:
            task.end_date = task.deadline_base_date + timedelta(
                days=deadline_days - 1
            )
        task.schedule_type = "single"
        task.deadline_days = deadline_days
    else:
        start = data.get("start_date", task.start_date)
        end = data.get("end_date", task.end_date)
        if task.schedule_type != "range" and "end_date" not in data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="범위 일정은 시작일과 종료일을 모두 입력해주세요.",
            )
        if dates_changed:
            start, end = _range_dates(
                start,
                end,
                current_start=task.start_date,
            )
        task.schedule_type = "range"
        task.start_date = start
        task.end_date = end
        task.deadline_base_date = None
        task.deadline_days = None

    if was_undated and task.status == "inactive":
        task.status = "active"
        task.inactive_at = None

    db.commit()
    db.refresh(task)
    return _serialize_task(task)


def complete_task(db: Session, task_id: int, user_id: int) -> dict:
    task = _get_task_or_404(db, task_id, user_id)
    if task.status == "trashed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="휴지통에 있는 일정은 완료할 수 없습니다.",
        )

    actor_id = get_audit_actor() or user_id
    event = PlannerEvent(
        owner_user_id=user_id,
        actor_user_id=actor_id,
        entity_type="task",
        entity_id=task.id,
        action="completed",
        title=task.title,
        notes=task.notes,
        color=(
            task.color_relation.color
            if task.color_relation is not None
            else None
        ),
        changes=None,
        occurred_at=_utc_naive_now(),
    )
    db.delete(task)
    db.add(event)
    db.commit()
    return {"success": True}


def deactivate_task(db: Session, task_id: int, user_id: int) -> dict:
    task = _get_task_or_404(db, task_id, user_id)
    if task.status == "trashed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="휴지통에 있는 일정은 비활성화할 수 없습니다.",
        )
    if task.status != "inactive":
        task.status = "inactive"
        task.inactive_at = _utc_naive_now()
        db.commit()
        db.refresh(task)
    return _serialize_task(task)


def trash_task(db: Session, task_id: int, user_id: int) -> dict:
    task = _get_task_or_404(db, task_id, user_id)
    if task.status != "trashed":
        task.status = "trashed"
        task.trashed_at = _utc_naive_now()
        db.commit()
        db.refresh(task)
    return _serialize_task(task)


def restore_task(db: Session, task_id: int, user_id: int) -> dict:
    task = _get_task_or_404(db, task_id, user_id)

    if task.schedule_type == "undated":
        task.status = "inactive"
        if task.inactive_at is None:
            task.inactive_at = _utc_naive_now()
        task.trashed_at = None
        db.commit()
        db.refresh(task)
        return _serialize_task(task)

    if task.status == "active":
        return _serialize_task(task)

    today = kst_today()
    if task.schedule_type == "single":
        deadline_days = task.deadline_days or 7
        start, base, end = _single_dates(today, deadline_days)
        task.start_date = start
        task.deadline_base_date = base
        task.end_date = end
        task.deadline_days = deadline_days
    else:
        duration = task.end_date - task.start_date
        task.start_date = today
        task.end_date = today + duration
        task.deadline_base_date = None
        task.deadline_days = None

    task.status = "active"
    task.inactive_at = None
    task.trashed_at = None
    db.commit()
    db.refresh(task)
    return _serialize_task(task)


def delete_task_permanently(db: Session, task_id: int, user_id: int) -> dict:
    task = _get_task_or_404(db, task_id, user_id)
    if task.status != "trashed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="휴지통에 있는 일정만 영구 삭제할 수 있습니다.",
        )
    db.delete(task)
    db.commit()
    return {"success": True}
