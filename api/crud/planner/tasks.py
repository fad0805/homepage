"""Planner tasks."""

from .common import *  # noqa: F401,F403


def maintain_tasks(db: Session, user_id: int) -> None:
    """Apply lazy, KST-based lifecycle transitions for one account.

    All transitions are pushed into SQL so only rows that actually change are
    touched. The inactive->trashed pass runs last to preserve the old behavior
    where an already-expired active task is trashed in the same call.
    """
    now = _utc_naive_now()
    today = kst_today()

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

    no_period = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.status == "active",
            or_(
                PlannerTask.schedule_type == "undated",
                PlannerTask.start_date.is_(None),
                PlannerTask.end_date.is_(None),
            ),
        )
        .update(
            {
                "status": "inactive",
                "inactive_at": func.coalesce(
                    PlannerTask.inactive_at, now
                ),
            },
            synchronize_session=False,
        )
    )

    expired = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.status == "active",
            PlannerTask.schedule_type != "undated",
            PlannerTask.start_date.isnot(None),
            PlannerTask.end_date.isnot(None),
            PlannerTask.end_date < today,
        )
        .update(
            {"status": "inactive", "inactive_at": now},
            synchronize_session=False,
        )
    )

    stale_cutoff = today - timedelta(days=INACTIVE_RETENTION_DAYS)
    stale = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.status == "inactive",
            PlannerTask.pinned.is_(False),
            PlannerTask.schedule_type != "undated",
            PlannerTask.start_date.isnot(None),
            PlannerTask.end_date.isnot(None),
            PlannerTask.end_date <= stale_cutoff,
        )
        .update(
            {"status": "trashed", "trashed_at": now},
            synchronize_session=False,
        )
    )

    if purged or no_period or expired or stale:
        db.commit()


def get_tasks(
    db: Session,
    user_id: int,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    if (start_date is None) != (end_date is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="조회 시작일과 종료일을 함께 지정해주세요.",
        )
    if start_date is not None and end_date is not None:
        if end_date < start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="조회 종료일은 시작일보다 빠를 수 없습니다.",
            )
        if (end_date - start_date).days > 366:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="한 번에 1년까지만 조회할 수 있습니다.",
            )

    maintain_tasks(db, user_id)
    query = (
        db.query(PlannerTask)
        .options(selectinload(PlannerTask.color_relation))
        .filter(PlannerTask.user_id == user_id)
    )
    if start_date is not None and end_date is not None:
        # Inactive/trashed rows have no calendar period and are always kept
        # for their dedicated tabs. Active rows only need to overlap the
        # requested window, so ranges crossing a month boundary still show.
        query = query.filter(
            or_(
                PlannerTask.status.in_(("inactive", "trashed")),
                and_(
                    PlannerTask.status == "active",
                    PlannerTask.start_date <= end_date,
                    PlannerTask.end_date >= start_date,
                ),
            )
        )
    tasks = query.order_by(
        PlannerTask.status.asc(),
        PlannerTask.end_date.asc(),
        PlannerTask.id.asc(),
    ).all()
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
        color_id=task.color_id,
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
