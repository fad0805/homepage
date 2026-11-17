"""Bookmark periods."""

from .common import *  # noqa: F401,F403
from .schedule import (
    _next_routine_date,
    _quarter_matches,
    _routine_due_on_day,
    _routine_monthly_due_date,
)


def _date_period_entry(
    db: Session,
    routine: BookmarkRoutine,
    *,
    period_type: str,
    period_start: date,
    today: date | None = None,
    require_month_due: bool = True,
) -> dict[str, Any] | None:
    if routine.frequency == "daily":
        if not _in_routine_lifespan(routine, period_start):
            return None
        done = _period_check_count(db, routine, "day", period_start) > 0
        return _routine_period_dict(
            routine,
            period_type="day",
            period_start=period_start,
            completed_count=1 if done else 0,
            occurrences=[{"date": period_start, "done": done}],
        )
    if routine.frequency == "weekly":
        week_start = _week_start(period_start)
        dates = (
            [today]
            if today is not None
            else [
                week_start + timedelta(days=offset)
                for offset in range(7)
                if (week_start + timedelta(days=offset)).weekday()
                in _routine_weekdays(routine)
            ]
        )
        dates = [day for day in dates if _in_routine_lifespan(routine, day)]
        if not dates:
            return None
        done_dates = _done_dates(
            db,
            routine,
            week_start,
            week_start + timedelta(days=6),
        )
        occurrences = [
            {"date": day, "done": day in done_dates}
            for day in dates
        ]
        selected_dates = {
            week_start + timedelta(days=offset)
            for offset in range(7)
            if (week_start + timedelta(days=offset)).weekday()
            in _routine_weekdays(routine)
            and _in_routine_lifespan(
                routine,
                week_start + timedelta(days=offset),
            )
        }
        completed = len(done_dates & selected_dates)
        return _routine_period_dict(
            routine,
            period_type="day",
            period_start=week_start,
            completed_count=completed,
            occurrences=occurrences,
        )
    if routine.frequency == "monthly":
        month = _month_start(period_start)
        due_date = _routine_monthly_due_date(routine, month)
        if require_month_due and due_date is None:
            return None
        if due_date is not None and not _in_routine_lifespan(
            routine,
            due_date,
        ):
            return None
        completed = _period_check_count(db, routine, "month", month)
        return _routine_period_dict(
            routine,
            period_type="month",
            period_start=month,
            completed_count=completed,
            occurrences=[{"date": month, "done": completed > 0}],
        )
    if routine.frequency == "quarterly":
        if not _quarter_matches(routine, period_start):
            return None
        quarter = _quarter_start(period_start)
        completed = _period_check_count(db, routine, "quarter", quarter)
        return _routine_period_dict(
            routine,
            period_type="quarter",
            period_start=quarter,
            completed_count=completed,
            occurrences=[{"date": quarter, "done": completed > 0}],
        )
    year = _year_start(period_start)
    if routine.month is None or routine.day_of_month is None:
        return None
    if not _month_has_day(
        year.year,
        routine.month,
        routine.day_of_month,
    ):
        return None
    due_date = date(year.year, routine.month, routine.day_of_month)
    if not _in_routine_lifespan(routine, due_date):
        return None
    completed = _period_check_count(db, routine, "year", year)
    return _routine_period_dict(
        routine,
        period_type="year",
        period_start=year,
        completed_count=completed,
        occurrences=[{"date": year, "done": completed > 0}],
    )


def _count_period_entry(
    db: Session,
    routine: BookmarkRoutine,
    *,
    period_type: str,
    period_start: date,
) -> dict[str, Any]:
    completed = _period_check_count(
        db,
        routine,
        period_type,
        period_start,
    )
    return _routine_period_dict(
        routine,
        period_type=period_type,
        period_start=period_start,
        completed_count=completed,
    )


def get_today(
    db: Session,
    user_id: int,
    *,
    day: date | None = None,
) -> dict[str, Any]:
    target = day or _kst_today()
    routines = (
        db.query(BookmarkRoutine)
        .options(selectinload(BookmarkRoutine.category))
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(False),
            BookmarkRoutine.start_date <= target,
            or_(
                BookmarkRoutine.end_date.is_(None),
                BookmarkRoutine.end_date >= target,
            ),
        )
        .all()
    )
    routines.sort(
        key=lambda routine: (
            FREQUENCY_ORDER.get(routine.frequency, 9),
            routine.position,
            routine.id,
        )
    )
    entries: list[dict[str, Any]] = []
    for routine in routines:
        if not _quarter_matches(routine, target):
            continue
        if routine.frequency == "daily":
            entry = _date_period_entry(
                db,
                routine,
                period_type="day",
                period_start=target,
            )
        elif routine.tracking_mode == "count":
            entry = _count_period_entry(
                db,
                routine,
                period_type=_check_period_type(routine),
                period_start=_check_period_start(routine, target),
            )
        elif not _routine_due_on_day(routine, target):
            continue
        elif routine.frequency == "weekly":
            entry = _date_period_entry(
                db,
                routine,
                period_type="day",
                period_start=target,
                today=target,
            )
        else:
            entry = _date_period_entry(
                db,
                routine,
                period_type=_check_period_type(routine),
                period_start=target,
            )
        if entry is not None:
            entries.append(entry)

    goal = (
        db.query(BookmarkGoal)
        .filter(
            BookmarkGoal.user_id == user_id,
            BookmarkGoal.period_type == "day",
            BookmarkGoal.period_start == target,
        )
        .first()
    )
    rating = (
        db.query(BookmarkRating)
        .filter(
            BookmarkRating.user_id == user_id,
            BookmarkRating.period_type == "day",
            BookmarkRating.period_start == target,
        )
        .first()
    )
    review = (
        db.query(BookmarkReview)
        .filter(
            BookmarkReview.user_id == user_id,
            BookmarkReview.period_type == "day",
            BookmarkReview.period_start == target,
        )
        .first()
    )
    return {
        "period_type": "day",
        "period_start": target,
        "routines": entries,
        "goal": goal,
        "rating": rating,
        "review": review,
    }


def get_period(
    db: Session,
    user_id: int,
    *,
    period_type: str,
    period_start: date,
) -> dict[str, Any]:
    _validate_period(period_type, period_start)
    frequency = PERIOD_FREQUENCY[period_type]
    routines = (
        db.query(BookmarkRoutine)
        .options(selectinload(BookmarkRoutine.category))
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(False),
            BookmarkRoutine.frequency == frequency,
        )
        .order_by(BookmarkRoutine.position, BookmarkRoutine.id)
        .all()
    )
    today = _kst_today()
    entries: list[dict[str, Any]] = []
    for routine in routines:
        if routine.frequency == "daily":
            entry = _date_period_entry(
                db,
                routine,
                period_type="day",
                period_start=period_start,
            )
        elif routine.tracking_mode == "count":
            entry = _count_period_entry(
                db,
                routine,
                period_type=period_type,
                period_start=period_start,
            )
        else:
            entry = _date_period_entry(
                db,
                routine,
                period_type=period_type,
                period_start=period_start,
            )
        if entry is None:
            entry = _routine_period_dict(
                routine,
                period_type=period_type,
                period_start=period_start,
                completed_count=0,
                occurrences=[],
            )
        entry["next_date"] = _next_routine_date(routine, today)
        entries.append(entry)
    goal = (
        db.query(BookmarkGoal)
        .filter(
            BookmarkGoal.user_id == user_id,
            BookmarkGoal.period_type == period_type,
            BookmarkGoal.period_start == period_start,
        )
        .first()
    )
    rating = (
        db.query(BookmarkRating)
        .filter(
            BookmarkRating.user_id == user_id,
            BookmarkRating.period_type == period_type,
            BookmarkRating.period_start == period_start,
        )
        .first()
    )
    review = (
        db.query(BookmarkReview)
        .filter(
            BookmarkReview.user_id == user_id,
            BookmarkReview.period_type == period_type,
            BookmarkReview.period_start == period_start,
        )
        .first()
    )
    return {
        "period_type": period_type,
        "period_start": period_start,
        "routines": entries,
        "goal": goal,
        "rating": rating,
        "review": review,
    }
