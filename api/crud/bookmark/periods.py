"""Bookmark periods."""

from .common import *  # noqa: F401,F403
from .schedule import (
    _next_routine_date,
    _quarter_matches,
    _routine_due_on_day,
    _routine_monthly_due_date,
)
from .statistics import _StatsChecks as RoutineCheckIndex


def _load_checks(
    db: Session,
    user_id: int,
    start: date,
) -> RoutineCheckIndex:
    rows = (
        db.query(BookmarkRoutineCheck)
        .filter(
            BookmarkRoutineCheck.user_id == user_id,
            BookmarkRoutineCheck.period_start >= start,
        )
        .all()
    )
    return RoutineCheckIndex(rows)


def _period_count(
    db: Session,
    routine: BookmarkRoutine,
    period_type: str,
    period_start: date,
    checks: RoutineCheckIndex | None,
) -> int:
    if checks is not None:
        return checks.count(routine, period_type, period_start)
    return _period_check_count(db, routine, period_type, period_start)


def _period_done_dates(
    db: Session,
    routine: BookmarkRoutine,
    start: date,
    end: date,
    checks: RoutineCheckIndex | None,
) -> set[date]:
    if checks is not None:
        return checks.done_dates(routine, start, end)
    return _done_dates(db, routine, start, end)


def _date_period_entry(
    db: Session,
    routine: BookmarkRoutine,
    *,
    period_type: str,
    period_start: date,
    today: date | None = None,
    require_month_due: bool = True,
    checks: RoutineCheckIndex | None = None,
) -> dict[str, Any] | None:
    if routine.frequency == "daily":
        if not _in_routine_lifespan(routine, period_start):
            return None
        done = (
            _period_count(
                db, routine, "day", period_start, checks
            )
            > 0
        )
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
        done_dates = _period_done_dates(
            db,
            routine,
            week_start,
            week_start + timedelta(days=6),
            checks,
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
        completed = _period_count(
            db, routine, "month", month, checks
        )
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
        completed = _period_count(
            db, routine, "quarter", quarter, checks
        )
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
    completed = _period_count(db, routine, "year", year, checks)
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
    checks: RoutineCheckIndex | None = None,
) -> dict[str, Any]:
    if checks is not None:
        check = checks.row(routine, period_type, period_start)
        completed = int(check.count or 0) if check else 0
        manual_done = bool(check.manual_done) if check else False
    else:
        row = (
            db.query(
                BookmarkRoutineCheck.count,
                BookmarkRoutineCheck.manual_done,
            )
            .filter(
                BookmarkRoutineCheck.user_id == routine.user_id,
                BookmarkRoutineCheck.routine_id == routine.id,
                BookmarkRoutineCheck.period_type == period_type,
                BookmarkRoutineCheck.period_start == period_start,
            )
            .first()
        )
        completed = int(row[0] or 0) if row else 0
        manual_done = bool(row[1]) if row else False
    return _routine_period_dict(
        routine,
        period_type=period_type,
        period_start=period_start,
        completed_count=completed,
        manual_done=manual_done,
    )


def get_today(
    db: Session,
    user_id: int,
    *,
    day: date | None = None,
) -> dict[str, Any]:
    target = day or _kst_today()
    check_start = min(_week_start(target), date(target.year, 1, 1))
    checks = _load_checks(db, user_id, check_start)
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
                checks=checks,
            )
        elif routine.tracking_mode == "count":
            entry = _count_period_entry(
                db,
                routine,
                period_type=_check_period_type(routine),
                period_start=_check_period_start(routine, target),
                checks=checks,
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
                checks=checks,
            )
        else:
            entry = _date_period_entry(
                db,
                routine,
                period_type=_check_period_type(routine),
                period_start=target,
                checks=checks,
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
    period_end = _period_end(period_type, period_start)
    checks = _load_checks(db, user_id, period_start)
    routines = (
        db.query(BookmarkRoutine)
        .options(selectinload(BookmarkRoutine.category))
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(False),
            BookmarkRoutine.frequency == frequency,
            BookmarkRoutine.start_date <= period_end,
            or_(
                BookmarkRoutine.end_date.is_(None),
                BookmarkRoutine.end_date >= period_start,
            ),
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
                checks=checks,
            )
        elif routine.tracking_mode == "count":
            entry = _count_period_entry(
                db,
                routine,
                period_type=period_type,
                period_start=period_start,
                checks=checks,
            )
        else:
            entry = _date_period_entry(
                db,
                routine,
                period_type=period_type,
                period_start=period_start,
                checks=checks,
            )
        if entry is None:
            continue
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
