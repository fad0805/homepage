"""Bookmark routines."""

from .common import *  # noqa: F401,F403
from .schedule import _routine_due_on_day, _validate_schedule
from .statistics import _upsert_routine_monthly_stat


def create_routine(
    db: Session,
    payload: BookmarkRoutineCreate,
    user_id: int,
) -> BookmarkRoutine:
    mode, target_count, schedule = _validate_schedule(
        frequency=payload.frequency,
        tracking_mode=payload.tracking_mode,
        target_count=payload.target_count,
        weekday=payload.weekday,
        weekdays=payload.weekdays,
        day_of_month=payload.day_of_month,
        nth_week=payload.nth_week,
        month=payload.month,
    )
    max_position = (
        db.query(func.max(BookmarkRoutine.position))
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.frequency == payload.frequency,
        )
        .scalar()
    )
    routine = BookmarkRoutine(
        user_id=user_id,
        category_id=_resolve_category_id(
            db,
            user_id,
            payload.category_id,
        ),
        title=_clean_title(payload.title),
        notes=_clean_notes(payload.notes),
        frequency=payload.frequency,
        start_date=_kst_today(),
        end_date=None,
        tracking_mode=mode,
        target_count=target_count,
        active=True,
        position=(max_position or -1) + 1,
        **schedule,
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return routine


def update_routine(
    db: Session,
    routine_id: int,
    payload: BookmarkRoutineUpdate,
    user_id: int,
) -> BookmarkRoutine:
    routine = _get_routine_or_404(db, routine_id, user_id)
    data = payload.model_dump(exclude_unset=True)

    if "title" in data:
        routine.title = _clean_title(data["title"])
        db.query(BookmarkRoutineMonthlyStat).filter(
            BookmarkRoutineMonthlyStat.routine_id == routine.id
        ).update(
            {BookmarkRoutineMonthlyStat.routine_title: routine.title},
            synchronize_session=False,
        )
    if "notes" in data:
        routine.notes = _clean_notes(data["notes"])
    if "category_id" in data:
        routine.category_id = _resolve_category_id(
            db,
            user_id,
            data["category_id"],
        )
    if "active" in data:
        routine.active = bool(data["active"])

    mode, target_count, schedule = _validate_schedule(
        frequency=routine.frequency,
        tracking_mode=data.get("tracking_mode", routine.tracking_mode),
        target_count=data.get("target_count", routine.target_count),
        weekday=data.get("weekday", routine.weekday),
        weekdays=data.get("weekdays", routine.weekdays),
        day_of_month=data.get("day_of_month", routine.day_of_month),
        nth_week=data.get("nth_week", routine.nth_week),
        month=data.get("month", routine.month),
    )
    routine.tracking_mode = mode
    routine.target_count = target_count
    routine.weekday = schedule["weekday"]
    routine.weekdays = schedule["weekdays"]
    routine.day_of_month = schedule["day_of_month"]
    routine.nth_week = schedule["nth_week"]
    routine.month = schedule["month"]

    # Settings such as target_count and weekdays change the expected values of
    # every stored month, not only the current one. Recompute all months that
    # already have an aggregate so history and the statistics page agree.
    stat_months = {
        month_start
        for (month_start,) in db.query(
            BookmarkRoutineMonthlyStat.month_start
        )
        .filter(BookmarkRoutineMonthlyStat.routine_id == routine.id)
        .all()
    }
    stat_months.add(_month_start(_kst_today()))
    for month_start in sorted(stat_months):
        _upsert_routine_monthly_stat(db, routine, month_start)

    db.commit()
    db.refresh(routine)
    return routine


def stop_routine(
    db: Session,
    routine_id: int,
    user_id: int,
) -> BookmarkRoutine:
    routine = _get_routine_or_404(db, routine_id, user_id)
    if routine.end_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 중단된 루틴입니다.",
        )
    routine.end_date = _kst_today() - timedelta(days=1)
    routine.active = False
    db.commit()
    db.refresh(routine)
    return routine


def delete_routine(db: Session, routine_id: int, user_id: int) -> dict:
    routine = _get_routine_or_404(db, routine_id, user_id)
    db.query(BookmarkRoutineMonthlyStat).filter(
        BookmarkRoutineMonthlyStat.routine_id == routine.id
    ).delete(synchronize_session=False)
    db.query(BookmarkRoutineCheck).filter(
        BookmarkRoutineCheck.routine_id == routine.id
    ).delete(synchronize_session=False)
    db.delete(routine)
    db.commit()
    return {"success": True}


def reorder_routines(
    db: Session,
    payload: BookmarkRoutineReorder,
    user_id: int,
) -> dict:
    ids = list(dict.fromkeys(payload.ids))
    if len(ids) != len(payload.ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="루틴 순서가 올바르지 않습니다.",
        )

    routines = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(False),
            BookmarkRoutine.id.in_(ids),
        )
        .all()
    )
    if len(routines) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="루틴을 찾을 수 없습니다.",
        )

    # Reuse the position slots the visible routines already occupy. Positions
    # are tracked per frequency, so keep each frequency's slots separate.
    positions_by_frequency: dict[str, list[int]] = {}
    for routine in routines:
        positions_by_frequency.setdefault(
            routine.frequency, []
        ).append(routine.position)
    for positions in positions_by_frequency.values():
        positions.sort()

    by_id = {routine.id: routine for routine in routines}
    next_slot = {frequency: 0 for frequency in positions_by_frequency}
    for routine_id in ids:
        routine = by_id[routine_id]
        frequency = routine.frequency
        routine.position = positions_by_frequency[frequency][
            next_slot[frequency]
        ]
        next_slot[frequency] += 1

    db.commit()
    return {"success": True}


def set_routine_check(
    db: Session,
    routine_id: int,
    payload: BookmarkRoutineCheckUpdate,
    user_id: int,
) -> dict[str, Any]:
    routine = _get_routine_or_404(db, routine_id, user_id)
    if routine.end_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="중단된 루틴은 기록을 변경할 수 없습니다.",
        )
    _validate_period(payload.period_type, payload.period_start)
    expected_period = _check_period_type(routine)
    if payload.period_type != expected_period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="루틴 기록 방식과 기간 단위가 맞지 않습니다.",
        )
    period_end = _period_end(payload.period_type, payload.period_start)
    if period_end < routine.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="루틴 시작일 이전 기간은 기록할 수 없습니다.",
        )
    if routine.end_date is not None and payload.period_start > routine.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="중단된 이후 기간은 기록할 수 없습니다.",
        )
    if routine.tracking_mode == "date":
        if payload.count > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="일자 기록은 1회만 체크할 수 있습니다.",
            )
        if routine.frequency == "weekly" and not _routine_due_on_day(
            routine,
            payload.period_start,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이 요일에는 해당 루틴이 예정되어 있지 않습니다.",
            )
    elif payload.count > max(1, int(routine.target_count or 1)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="목표 횟수보다 많이 기록할 수 없습니다.",
        )

    check = (
        db.query(BookmarkRoutineCheck)
        .filter(
            BookmarkRoutineCheck.routine_id == routine.id,
            BookmarkRoutineCheck.period_type == payload.period_type,
            BookmarkRoutineCheck.period_start == payload.period_start,
        )
        .first()
    )
    if check is None:
        check = BookmarkRoutineCheck(
            user_id=user_id,
            routine_id=routine.id,
            period_type=payload.period_type,
            period_start=payload.period_start,
            done=False,
            count=0,
        )
        db.add(check)
    check.count = payload.count
    check.done = payload.count > 0
    check.completed_at = _utc_naive_now() if payload.count > 0 else None
    _upsert_routine_monthly_stat(
        db,
        routine,
        _month_start(payload.period_start),
    )
    db.commit()
    db.refresh(check)
    return _routine_period_dict(
        routine,
        period_type=payload.period_type,
        period_start=payload.period_start,
        completed_count=payload.count,
    )
