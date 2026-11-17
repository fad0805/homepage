"""Bookmark special dates."""

from .common import *  # noqa: F401,F403


SPECIAL_DATE_START = date(1900, 1, 1)


def _special_date_kind(routine: BookmarkRoutine) -> str:
    return "dday" if routine.frequency == "once" else "yearly"


def _special_date_dict(routine: BookmarkRoutine) -> dict[str, Any]:
    kind = _special_date_kind(routine)
    return {
        "id": routine.id,
        "title": routine.title,
        "kind": kind,
        "event_date": routine.start_date if kind == "dday" else None,
        "month": routine.month if kind == "yearly" else None,
        "day": routine.day_of_month if kind == "yearly" else None,
        "pinned": bool(routine.calendar_pinned)
        if kind == "dday"
        else False,
        "created_at": routine.created_at,
        "updated_at": routine.updated_at,
    }


def _validate_special_date(
    kind: str,
    event_date: date | None,
    month: int | None,
    day: int | None,
) -> tuple[date | None, int | None, int | None]:
    if kind == "yearly":
        if month is None or day is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="매년 반복할 월과 날짜를 입력해주세요.",
            )
        if not _month_has_day(2000, month, day):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="반복 날짜가 올바르지 않습니다.",
            )
        return None, month, day
    if kind == "dday":
        if event_date is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="디데이 날짜를 입력해주세요.",
            )
        return event_date, None, None
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="기념일 종류를 확인해주세요.",
    )


def _apply_special_date_schedule(
    routine: BookmarkRoutine,
    *,
    kind: str,
    event_date: date | None,
    month: int | None,
    day: int | None,
) -> None:
    routine.frequency = "yearly" if kind == "yearly" else "once"
    routine.tracking_mode = "date"
    routine.target_count = 1
    routine.weekday = None
    routine.weekdays = None
    routine.nth_week = None
    if kind == "yearly":
        routine.start_date = SPECIAL_DATE_START
        routine.end_date = None
        routine.month = month
        routine.day_of_month = day
        return
    routine.start_date = event_date or SPECIAL_DATE_START
    routine.end_date = event_date
    routine.month = None
    routine.day_of_month = None


def _clear_special_date_stats(
    db: Session,
    routine_id: int,
) -> None:
    """Calendar-only entries must never keep check or monthly stat rows."""
    db.query(BookmarkRoutineCheck).filter(
        BookmarkRoutineCheck.routine_id == routine_id
    ).delete(synchronize_session=False)
    db.query(BookmarkRoutineMonthlyStat).filter(
        BookmarkRoutineMonthlyStat.routine_id == routine_id
    ).delete(synchronize_session=False)


def list_special_dates(db: Session, user_id: int) -> dict[str, Any]:
    routines = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(True),
        )
        .all()
    )
    entries = [_special_date_dict(routine) for routine in routines]
    entries.sort(
        key=lambda item: (
            0 if item["kind"] == "yearly" else 1,
            item["month"] or 0,
            item["day"] or 0,
            item["event_date"] or date.max,
            item["id"],
        )
    )
    return {"special_dates": entries}


def create_special_date(
    db: Session,
    payload: BookmarkSpecialDateCreate,
    user_id: int,
) -> dict[str, Any]:
    event_date, month, day = _validate_special_date(
        payload.kind,
        payload.event_date,
        payload.month,
        payload.day,
    )
    max_position = (
        db.query(func.max(BookmarkRoutine.position))
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(True),
        )
        .scalar()
    )
    pinned = bool(payload.pinned) if payload.kind == "dday" else False
    routine = BookmarkRoutine(
        user_id=user_id,
        title=_clean_title(payload.title),
        notes=None,
        category_id=None,
        frequency="yearly",
        start_date=SPECIAL_DATE_START,
        end_date=None,
        tracking_mode="date",
        target_count=1,
        active=True,
        calendar_only=True,
        calendar_pinned=pinned,
        position=(max_position or -1) + 1,
    )
    _apply_special_date_schedule(
        routine,
        kind=payload.kind,
        event_date=event_date,
        month=month,
        day=day,
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return _special_date_dict(routine)


def update_special_date(
    db: Session,
    routine_id: int,
    payload: BookmarkSpecialDateUpdate,
    user_id: int,
) -> dict[str, Any]:
    routine = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.id == routine_id,
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(True),
        )
        .first()
    )
    if routine is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기념일을 찾을 수 없습니다.",
        )
    data = payload.model_dump(exclude_unset=True)
    kind = data.get("kind", _special_date_kind(routine))
    if kind == "dday":
        event_date = data.get(
            "event_date",
            routine.start_date
            if _special_date_kind(routine) == "dday"
            else None,
        )
        month = None
        day = None
    else:
        event_date = None
        month = data.get(
            "month",
            routine.month
            if _special_date_kind(routine) == "yearly"
            else None,
        )
        day = data.get(
            "day",
            routine.day_of_month
            if _special_date_kind(routine) == "yearly"
            else None,
        )
    event_date, month, day = _validate_special_date(
        kind,
        event_date,
        month,
        day,
    )
    if "title" in data:
        routine.title = _clean_title(data["title"])
    _apply_special_date_schedule(
        routine,
        kind=kind,
        event_date=event_date,
        month=month,
        day=day,
    )
    if kind == "dday":
        routine.calendar_pinned = bool(
            data.get("pinned", routine.calendar_pinned)
        )
    else:
        routine.calendar_pinned = False
    _clear_special_date_stats(db, routine.id)
    db.commit()
    db.refresh(routine)
    return _special_date_dict(routine)


def delete_special_date(
    db: Session,
    routine_id: int,
    user_id: int,
) -> dict[str, Any]:
    routine = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.id == routine_id,
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(True),
        )
        .first()
    )
    if routine is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기념일을 찾을 수 없습니다.",
        )
    _clear_special_date_stats(db, routine.id)
    db.delete(routine)
    db.commit()
    return {"success": True}
