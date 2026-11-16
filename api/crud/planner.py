import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import Text, cast, or_
from sqlalchemy.orm import Session, selectinload

from core.audit import get_audit_actor
from core.html_sanitizer import sanitize_index_html
from core.search import like_pattern, search_tokens
from models.books import Book, BookCategory, Chapter
from models.characters import Character, Location
from models.index_page import IndexPage
from models.illustrations import Illustration
from models.links import Category as LinkCategory
from models.links import Link
from models.planner import PlannerColor, PlannerEvent, PlannerTask
from models.profiles import Profile
from models.users import AuthorSettings
from schemas.planner import (
    PlannerColorUpdate,
    PlannerCompletedCreate,
    PlannerEventPreview,
    PlannerTaskCreate,
    PlannerTaskUpdate,
)

KST = ZoneInfo("Asia/Seoul")
TRASH_RETENTION_DAYS = 30
INACTIVE_RETENTION_DAYS = 30
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def kst_now() -> datetime:
    return datetime.now(KST)


def kst_today() -> date:
    return kst_now().date()


def _utc_naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _clean_title(value: str | None) -> str:
    title = (value or "").strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="일정 제목을 입력해주세요.",
        )
    return title


def _clean_notes(value: str | None) -> str | None:
    notes = (value or "").strip()
    return notes or None


def _clean_color(value: str | None) -> str | None:
    if value is None:
        return None
    color = value.strip()
    if not color:
        return None
    if not COLOR_RE.fullmatch(color):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="색상은 #RRGGBB 형식으로 입력해주세요.",
        )
    return color.lower()


def _validate_color_id(
    db: Session,
    user_id: int,
    color_id: int | None,
) -> int | None:
    if color_id is None:
        return None
    saved = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.id == color_id,
            PlannerColor.user_id == user_id,
        )
        .first()
    )
    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="색상 칩을 찾을 수 없습니다.",
        )
    return saved.id


def _validate_deadline_days(value: int | None) -> int:
    days = 7 if value is None else value
    if days < 1 or days > 365:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="마감 기간은 1일 이상 365일 이하로 입력해주세요.",
        )
    return days


def _validate_start_date(
    value: date | None,
    *,
    current: date | None = None,
) -> date:
    start = value or kst_today()
    if start < kst_today() and start != current:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="시작일은 오늘 이후로 지정해주세요.",
        )
    return start


def _single_dates(
    start_date: date,
    deadline_days: int,
    *,
    now: datetime | None = None,
) -> tuple[date, date, date]:
    """Return (display start, deadline base, inclusive end).

    A task registered today before noon starts its deadline today. After noon
    it still appears today, but the deadline starts tomorrow. A future start
    date is not shifted by the noon cutoff.
    """
    current = now or kst_now()
    today = current.date()
    if start_date > today:
        base = start_date
    elif start_date < today:
        # An existing task that began on a past day keeps its display start
        # date, but a newly configured deadline starts from today.
        base = today + timedelta(days=1 if current.hour >= 12 else 0)
    elif current.hour >= 12:
        base = today + timedelta(days=1)
    else:
        base = start_date
    end = base + timedelta(days=deadline_days - 1)
    return start_date, base, end


def _range_dates(
    start_date: date | None,
    end_date: date | None,
    *,
    current_start: date | None = None,
) -> tuple[date, date]:
    if start_date is None or end_date is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="범위 일정은 시작일과 종료일을 모두 입력해주세요.",
        )
    if start_date < kst_today() and start_date != current_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="시작일은 오늘 이후로 지정해주세요.",
        )
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="종료일은 시작일보다 빠를 수 없습니다.",
        )
    return start_date, end_date


def _serialize_task(task: PlannerTask) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "notes": task.notes,
        "color_id": task.color_id,
        "color": (
            task.color_relation.color
            if task.color_relation
            else None
        ),
        "schedule_type": task.schedule_type,
        "start_date": task.start_date,
        "end_date": task.end_date,
        "deadline_days": task.deadline_days,
        "status": task.status,
        "pinned": bool(task.pinned),
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "inactive_at": task.inactive_at,
        "trashed_at": task.trashed_at,
    }


def _serialize_event(event: PlannerEvent) -> dict:
    return {
        "id": event.id,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "action": event.action,
        "title": event.title,
        "notes": event.notes,
        "changes": event.changes,
        "occurred_at": event.occurred_at,
    }


def _serialize_color(saved: PlannerColor) -> dict:
    return {
        "id": saved.id,
        "color": saved.color,
        "name": saved.name,
        "created_at": saved.created_at,
    }


def _clean_color_name(value: str | None) -> str | None:
    name = (value or "").strip()
    return name or None


def get_colors(db: Session, user_id: int) -> dict:
    colors = (
        db.query(PlannerColor)
        .filter(PlannerColor.user_id == user_id)
        .order_by(PlannerColor.created_at.asc(), PlannerColor.id.asc())
        .all()
    )
    return {"colors": [_serialize_color(color) for color in colors]}


def save_color(
    db: Session,
    color: str,
    user_id: int,
    name: str | None = None,
) -> dict:
    normalized = _clean_color(color)
    if normalized is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="색상을 입력해주세요.",
        )
    clean_name = _clean_color_name(name)
    existing = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.user_id == user_id,
            PlannerColor.color == normalized,
        )
        .first()
    )
    if existing is not None:
        if clean_name is not None and existing.name != clean_name:
            existing.name = clean_name
            db.commit()
            db.refresh(existing)
        return _serialize_color(existing)

    saved = PlannerColor(
        user_id=user_id,
        color=normalized,
        name=clean_name,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return _serialize_color(saved)


def update_color(
    db: Session,
    color_id: int,
    payload: PlannerColorUpdate,
    user_id: int,
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 내용이 없습니다.",
        )

    saved = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.id == color_id,
            PlannerColor.user_id == user_id,
        )
        .first()
    )
    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="색상 칩을 찾을 수 없습니다.",
        )

    if "color" in data:
        normalized = _clean_color(data["color"])
        if normalized is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="색상을 입력해주세요.",
            )
        if normalized != saved.color:
            duplicate = (
                db.query(PlannerColor)
                .filter(
                    PlannerColor.user_id == user_id,
                    PlannerColor.color == normalized,
                    PlannerColor.id != saved.id,
                )
                .first()
            )
            if duplicate is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="이미 사용 중인 색상입니다.",
                )
            saved.color = normalized

    if "name" in data:
        saved.name = _clean_color_name(data["name"])

    db.commit()
    db.refresh(saved)
    return _serialize_color(saved)


def delete_color(
    db: Session,
    color_id: int,
    user_id: int,
) -> dict:
    saved = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.id == color_id,
            PlannerColor.user_id == user_id,
        )
        .first()
    )
    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="색상 칩을 찾을 수 없습니다.",
        )

    deleted_tasks = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.color_id == color_id,
            PlannerTask.status == "trashed",
        )
        .delete(synchronize_session=False)
    )
    unassigned_tasks = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.color_id == color_id,
        )
        .update(
            {PlannerTask.color_id: None},
            synchronize_session=False,
        )
    )
    db.delete(saved)
    db.commit()
    return {
        "success": True,
        "unassigned_tasks": unassigned_tasks,
        "deleted_tasks": deleted_tasks,
    }


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

    if payload.schedule_type == "single":
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
        changes=None,
        occurred_at=_utc_naive_now(),
    )
    db.delete(task)
    db.add(event)
    db.commit()
    return {"success": True}


def create_completed_record(
    db: Session,
    payload: PlannerCompletedCreate,
    user_id: int,
) -> dict:
    """Backfill a past schedule directly as a completion history entry."""
    title = _clean_title(payload.title)
    notes = _clean_notes(payload.notes)
    if payload.completed_on >= kst_today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="완료 기록은 과거 날짜로만 만들 수 있습니다.",
        )

    actor_id = get_audit_actor() or user_id
    # Noon KST keeps the entry safely on the intended calendar date.
    occurred_at = (
        _kst_day_start_utc(payload.completed_on) + timedelta(hours=12)
    )
    event = PlannerEvent(
        owner_user_id=user_id,
        actor_user_id=actor_id,
        entity_type="task",
        entity_id=None,
        action="completed",
        title=title,
        notes=notes,
        changes=None,
        occurred_at=occurred_at,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _serialize_event(event)


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


def _kst_day_start_utc(value: date) -> datetime:
    return (
        datetime.combine(value, time.min, tzinfo=KST)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


def get_events(
    db: Session,
    user_id: int,
    *,
    start_date: date,
    end_date: date,
) -> dict:
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
    start_utc = _kst_day_start_utc(start_date)
    end_utc = _kst_day_start_utc(end_date + timedelta(days=1))
    events = (
        db.query(PlannerEvent)
        .filter(
            PlannerEvent.owner_user_id == user_id,
            PlannerEvent.occurred_at >= start_utc,
            PlannerEvent.occurred_at < end_utc,
        )
        .order_by(PlannerEvent.occurred_at.desc(), PlannerEvent.id.desc())
        .all()
    )
    return {"events": [_serialize_event(event) for event in events]}


def search_planner(
    db: Session,
    user_id: int,
    *,
    start_date: date,
    end_date: date,
    query: str | None = None,
) -> dict:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="검색 종료일은 시작일보다 빠를 수 없습니다.",
        )
    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="한 번에 1년 범위까지만 검색할 수 있습니다.",
        )

    maintain_tasks(db, user_id)
    tokens = search_tokens(query)

    tasks_query = (
        db.query(PlannerTask)
        .options(selectinload(PlannerTask.color_relation))
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.start_date <= end_date,
            PlannerTask.end_date >= start_date,
        )
    )
    if tokens:
        tasks_query = tasks_query.outerjoin(
            PlannerColor,
            PlannerTask.color_id == PlannerColor.id,
        )
        for token in tokens:
            pattern = like_pattern(token)
            tasks_query = tasks_query.filter(
                or_(
                    PlannerTask.title.ilike(pattern, escape="\\"),
                    PlannerTask.notes.ilike(pattern, escape="\\"),
                    PlannerColor.name.ilike(pattern, escape="\\"),
                    PlannerColor.color.ilike(pattern, escape="\\"),
                )
            )

    status_order = {"active": 0, "inactive": 1, "trashed": 2}
    tasks = tasks_query.all()
    tasks.sort(
        key=lambda task: (
            status_order.get(task.status, 9),
            task.start_date,
            task.id,
        )
    )

    start_utc = _kst_day_start_utc(start_date)
    end_utc = _kst_day_start_utc(end_date + timedelta(days=1))
    events_query = db.query(PlannerEvent).filter(
        PlannerEvent.owner_user_id == user_id,
        PlannerEvent.occurred_at >= start_utc,
        PlannerEvent.occurred_at < end_utc,
    )
    for token in tokens:
        pattern = like_pattern(token)
        events_query = events_query.filter(
            or_(
                PlannerEvent.title.ilike(pattern, escape="\\"),
                PlannerEvent.notes.ilike(pattern, escape="\\"),
                cast(PlannerEvent.changes, Text).ilike(
                    pattern,
                    escape="\\",
                ),
                PlannerEvent.entity_type.ilike(pattern, escape="\\"),
                PlannerEvent.action.ilike(pattern, escape="\\"),
            )
        )

    events = events_query.order_by(
        PlannerEvent.occurred_at.desc(),
        PlannerEvent.id.desc(),
    ).all()
    return {
        "tasks": [_serialize_task(task) for task in tasks],
        "events": [_serialize_event(event) for event in events],
    }


def _preview(
    *,
    entity_type: str,
    title: str | None,
    summary: str | None = None,
    content_html: str | None = None,
    detail_url: str | None = None,
    fields: dict | None = None,
) -> dict:
    return {
        "available": True,
        "entity_type": entity_type,
        "title": title,
        "summary": summary,
        "content_html": content_html,
        "detail_url": detail_url,
        "fields": fields or {},
    }


def get_event_preview(
    db: Session,
    event_id: int,
    user_id: int,
) -> dict:
    event = (
        db.query(PlannerEvent)
        .filter(
            PlannerEvent.id == event_id,
            PlannerEvent.owner_user_id == user_id,
        )
        .first()
    )
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="이력을 찾을 수 없습니다.",
        )

    unavailable = PlannerEventPreview(
        available=False,
        entity_type=event.entity_type,
        title=event.title,
    )
    if event.action in ("deleted", "completed") or event.entity_id is None:
        return unavailable.model_dump()

    entity_id = event.entity_id
    owner_id = event.owner_user_id

    if event.entity_type == "book":
        obj = (
            db.query(Book)
            .filter(Book.id == entity_id, Book.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="book",
                title=obj.title,
                summary=obj.description,
                detail_url=f"/books?book={obj.id}",
                fields={
                    "tags": ", ".join(obj.tags or []),
                    "category": (
                        obj.category_relation.name
                        if obj.category_relation
                        else None
                    ),
                },
            )
    elif event.entity_type == "chapter":
        obj = (
            db.query(Chapter)
            .filter(Chapter.id == entity_id, Chapter.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="chapter",
                title=obj.title,
                summary=obj.subtitle,
                content_html=sanitize_index_html(obj.body),
                detail_url=(
                    f"/books?book={obj.book_id}&chapter={obj.id}"
                ),
                fields={
                    "book": obj.book.title if obj.book else None,
                    "tags": ", ".join(obj.tags or []),
                },
            )
    elif event.entity_type == "illustration":
        obj = (
            db.query(Illustration)
            .filter(
                Illustration.id == entity_id,
                Illustration.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="illustration",
                title=obj.title,
                summary=obj.description,
                detail_url=f"/illustrations/{obj.id}",
                fields={
                    "tags": ", ".join(obj.tags or []),
                    "images": f"{len(obj.images)}장",
                },
            )
    elif event.entity_type == "character":
        obj = (
            db.query(Character)
            .filter(
                Character.id == entity_id,
                Character.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="character",
                title=obj.name,
                summary=obj.description,
                detail_url=f"/characters/profile?character={obj.id}",
                fields={
                    "nickname": obj.nickname,
                    "age": obj.age,
                    "location": (
                        obj.location_relationship.name
                        if obj.location_relationship
                        else None
                    ),
                },
            )
    elif event.entity_type == "character_location":
        obj = (
            db.query(Location)
            .filter(
                Location.id == entity_id,
                Location.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="character_location",
                title=obj.name,
                summary=obj.description,
            )
    elif event.entity_type == "link":
        obj = (
            db.query(Link)
            .filter(Link.id == entity_id, Link.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="link",
                title=obj.name,
                summary=obj.description,
                fields={
                    "url": obj.url,
                    "category": (
                        obj.category_relation.name
                        if obj.category_relation
                        else None
                    ),
                },
            )
    elif event.entity_type == "link_category":
        obj = (
            db.query(LinkCategory)
            .filter(
                LinkCategory.id == entity_id,
                LinkCategory.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="link_category",
                title=obj.name,
            )
    elif event.entity_type == "book_category":
        obj = (
            db.query(BookCategory)
            .filter(
                BookCategory.id == entity_id,
                BookCategory.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="book_category",
                title=obj.name,
            )
    elif event.entity_type == "profile":
        obj = (
            db.query(Profile)
            .filter(Profile.id == entity_id, Profile.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="profile",
                title=obj.title,
                summary=obj.subtitle,
                content_html=sanitize_index_html(obj.profile),
            )
    elif event.entity_type == "index":
        obj = db.query(IndexPage).filter(IndexPage.id == entity_id).first()
        if obj and (obj.user_id is None or obj.user_id == owner_id):
            return _preview(
                entity_type="index",
                title=("통합 인덱스" if obj.scope == "integrated" else "작가 인덱스"),
                content_html=sanitize_index_html(obj.content_html),
            )
    elif event.entity_type == "account":
        settings = (
            db.query(AuthorSettings)
            .filter(AuthorSettings.user_id == owner_id)
            .first()
        )
        if settings:
            return _preview(
                entity_type="account",
                title=settings.nickname,
                fields={
                    "nickname": settings.nickname,
                    "slug": settings.slug,
                },
            )

    return unavailable.model_dump()
