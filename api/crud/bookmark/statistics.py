"""Bookmark statistics."""

from .common import *  # noqa: F401,F403
from .categories import list_routine_categories
from .schedule import _quarter_matches, _routine_monthly_due_date


def _routine_month_values(
    db: Session,
    routine: BookmarkRoutine,
    month_start: date,
) -> tuple[int, int] | None:
    first = _month_start(month_start)
    last = _month_end(first)
    if first < _month_start(routine.start_date):
        return None
    if (
        routine.end_date is not None
        and first > _month_start(routine.end_date)
    ):
        return None
    active_start = max(first, routine.start_date)
    active_end = min(last, routine.end_date or last)
    if active_start > active_end:
        return None
    target = max(1, int(routine.target_count or 1))

    if routine.frequency == "daily":
        completed = (
            db.query(func.coalesce(func.sum(BookmarkRoutineCheck.count), 0))
            .filter(
                BookmarkRoutineCheck.user_id == routine.user_id,
                BookmarkRoutineCheck.routine_id == routine.id,
                BookmarkRoutineCheck.period_type == "day",
                BookmarkRoutineCheck.period_start >= active_start,
                BookmarkRoutineCheck.period_start <= active_end,
            )
            .scalar()
        )
        return int(completed or 0), (active_end - active_start).days + 1

    if routine.frequency == "weekly":
        if routine.tracking_mode == "count":
            expected_dates = [
                first + timedelta(days=offset)
                for offset in range(last.day)
                if (first + timedelta(days=offset)).weekday() == 0
                and active_start
                <= first + timedelta(days=offset)
                <= active_end
            ]
            expected = target * len(expected_dates)
            completed = (
                db.query(
                    func.coalesce(func.sum(BookmarkRoutineCheck.count), 0)
                )
                .filter(
                    BookmarkRoutineCheck.user_id == routine.user_id,
                    BookmarkRoutineCheck.routine_id == routine.id,
                    BookmarkRoutineCheck.period_type == "week",
                    BookmarkRoutineCheck.period_start >= active_start,
                    BookmarkRoutineCheck.period_start <= active_end,
                )
                .scalar()
            )
            if expected <= 0:
                return None
            return int(completed or 0), expected
        weekdays = set(_routine_weekdays(routine))
        if not weekdays:
            return None
        expected_dates = {
            first + timedelta(days=offset)
            for offset in range(last.day)
            if (first + timedelta(days=offset)).weekday() in weekdays
            and active_start <= first + timedelta(days=offset) <= active_end
        }
        if not expected_dates:
            return None
        completed = len(
            _done_dates(db, routine, active_start, active_end)
            & expected_dates
        )
        return completed, len(expected_dates)

    if routine.frequency == "monthly":
        if routine.tracking_mode == "date":
            due_date = _routine_monthly_due_date(routine, first)
            if (
                due_date is None
                or due_date < active_start
                or due_date > active_end
            ):
                return None
            return _period_check_count(db, routine, "month", first), 1
        return _period_check_count(db, routine, "month", first), target

    if routine.frequency == "quarterly":
        if first.month not in QUARTER_START_MONTHS:
            return None
        if not _quarter_matches(routine, first):
            return None
        quarter = date(first.year, first.month, 1)
        completed = _period_check_count(db, routine, "quarter", quarter)
        return completed, 1 if routine.tracking_mode == "date" else target

    if first.month != 1:
        return None
    completed = _period_check_count(db, routine, "year", first)
    return completed, 1 if routine.tracking_mode == "date" else target


def _upsert_routine_monthly_stat(
    db: Session,
    routine: BookmarkRoutine,
    month_start: date,
) -> None:
    db.flush()
    values = _routine_month_values(db, routine, month_start)
    if values is None:
        return
    first = _month_start(month_start)
    completed, expected = values
    stat = (
        db.query(BookmarkRoutineMonthlyStat)
        .filter(
            BookmarkRoutineMonthlyStat.user_id == routine.user_id,
            BookmarkRoutineMonthlyStat.routine_id == routine.id,
            BookmarkRoutineMonthlyStat.month_start == first,
        )
        .first()
    )
    if stat is None:
        stat = BookmarkRoutineMonthlyStat(
            user_id=routine.user_id,
            routine_id=routine.id,
            routine_title=routine.title,
            frequency=routine.frequency,
            month_start=first,
            completed_count=completed,
            expected_count=expected,
        )
        db.add(stat)
        return
    stat.routine_title = routine.title
    stat.frequency = routine.frequency
    stat.completed_count = completed
    stat.expected_count = expected


def _stat_active_range(
    routine: BookmarkRoutine,
    start: date,
    end: date,
) -> tuple[date, date] | None:
    active_start = max(start, routine.start_date)
    active_end = min(end, routine.end_date or end)
    if active_start > active_end:
        return None
    return active_start, active_end


def _stat_bucket(
    period_start: date,
    completed: int,
    expected: int,
) -> dict[str, Any]:
    return {
        "period_start": period_start,
        "completed_count": completed,
        "expected_count": expected,
    }


def _weekly_stat_buckets(
    db: Session,
    routine: BookmarkRoutine,
    today: date,
) -> list[dict[str, Any]]:
    current_week = _week_start(today)
    starts = [
        current_week - timedelta(weeks=offset)
        for offset in range(12, -1, -1)
    ]
    buckets: list[dict[str, Any]] = []
    for week_start in starts:
        week_end = week_start + timedelta(days=6)
        active = _stat_active_range(
            routine,
            week_start,
            min(week_end, today) if week_start == current_week else week_end,
        )
        if active is None:
            buckets.append(_stat_bucket(week_start, 0, 0))
            continue
        active_start, active_end = active
        if routine.frequency == "daily":
            expected = (active_end - active_start).days + 1
            completed = (
                db.query(func.coalesce(func.sum(BookmarkRoutineCheck.count), 0))
                .filter(
                    BookmarkRoutineCheck.user_id == routine.user_id,
                    BookmarkRoutineCheck.routine_id == routine.id,
                    BookmarkRoutineCheck.period_type == "day",
                    BookmarkRoutineCheck.period_start >= active_start,
                    BookmarkRoutineCheck.period_start <= active_end,
                )
                .scalar()
            )
            buckets.append(
                _stat_bucket(week_start, int(completed or 0), expected)
            )
            continue
        if routine.tracking_mode == "count":
            completed = _period_check_count(
                db,
                routine,
                "week",
                week_start,
            )
            buckets.append(
                _stat_bucket(week_start, completed, routine.target_count)
            )
            continue
        weekdays = set(_routine_weekdays(routine))
        expected_dates = {
            active_start + timedelta(days=offset)
            for offset in range((active_end - active_start).days + 1)
            if (active_start + timedelta(days=offset)).weekday()
            in weekdays
        }
        completed = len(
            _done_dates(db, routine, active_start, active_end)
            & expected_dates
        )
        buckets.append(
            _stat_bucket(
                week_start,
                completed,
                len(expected_dates),
            )
        )
    return buckets


def _monthly_stat_buckets(
    db: Session,
    routine: BookmarkRoutine,
    today: date,
) -> list[dict[str, Any]]:
    current_month = _month_start(today)
    starts = [
        _shift_months(current_month, -offset)
        for offset in range(35, -1, -1)
    ]
    buckets: list[dict[str, Any]] = []
    for month_start in starts:
        values = _routine_month_values(db, routine, month_start)
        if values is None:
            buckets.append(_stat_bucket(month_start, 0, 0))
        else:
            buckets.append(
                _stat_bucket(month_start, values[0], values[1])
            )
    return buckets


def _quarterly_stat_buckets(
    db: Session,
    routine: BookmarkRoutine,
    today: date,
) -> list[dict[str, Any]]:
    current_quarter = _quarter_start(today)
    starts = [
        _shift_months(current_quarter, -offset * 3)
        for offset in range(11, -1, -1)
    ]
    buckets: list[dict[str, Any]] = []
    for quarter_start in starts:
        if not _quarter_matches(routine, quarter_start):
            buckets.append(_stat_bucket(quarter_start, 0, 0))
            continue
        active = _stat_active_range(
            routine,
            quarter_start,
            _period_end("quarter", quarter_start),
        )
        if active is None:
            buckets.append(_stat_bucket(quarter_start, 0, 0))
            continue
        completed = _period_check_count(
            db,
            routine,
            "quarter",
            quarter_start,
        )
        expected = (
            1
            if routine.tracking_mode == "date"
            else routine.target_count
        )
        buckets.append(
            _stat_bucket(quarter_start, completed, expected)
        )
    return buckets


def _yearly_stat_buckets(
    db: Session,
    routine: BookmarkRoutine,
    today: date,
) -> list[dict[str, Any]]:
    current_year = today.year
    starts = [
        date(year, 1, 1)
        for year in range(current_year - 2, current_year + 1)
    ]
    buckets: list[dict[str, Any]] = []
    for year_start in starts:
        active = _stat_active_range(
            routine,
            year_start,
            _period_end("year", year_start),
        )
        if active is None:
            buckets.append(_stat_bucket(year_start, 0, 0))
            continue
        completed = _period_check_count(
            db,
            routine,
            "year",
            year_start,
        )
        expected = (
            1
            if routine.tracking_mode == "date"
            else routine.target_count
        )
        buckets.append(
            _stat_bucket(year_start, completed, expected)
        )
    return buckets


def get_statistics(
    db: Session,
    user_id: int,
) -> dict[str, Any]:
    categories = list_routine_categories(db, user_id)
    routines = (
        db.query(BookmarkRoutine)
        .options(selectinload(BookmarkRoutine.category))
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.calendar_only.is_(False),
        )
        .order_by(BookmarkRoutine.position, BookmarkRoutine.id)
        .all()
    )
    today = _kst_today()
    entries: list[dict[str, Any]] = []
    for routine in routines:
        if routine.frequency in {"daily", "weekly"}:
            aggregation = "week"
            retention_label = "최근 3개월"
            buckets = _weekly_stat_buckets(db, routine, today)
        elif routine.frequency == "monthly":
            aggregation = "month"
            retention_label = "최근 3년"
            buckets = _monthly_stat_buckets(db, routine, today)
        elif routine.frequency == "quarterly":
            aggregation = "quarter"
            retention_label = "최근 3년"
            buckets = _quarterly_stat_buckets(db, routine, today)
        else:
            aggregation = "year"
            retention_label = "최근 3년"
            buckets = _yearly_stat_buckets(db, routine, today)
        entries.append(
            {
                "id": routine.id,
                "title": routine.title,
                "frequency": routine.frequency,
                "tracking_mode": routine.tracking_mode,
                "category_id": routine.category_id,
                "category_name": (
                    routine.category.name if routine.category else None
                ),
                "start_date": routine.start_date,
                "end_date": routine.end_date,
                "target_count": routine.target_count,
                "active": bool(routine.active),
                "aggregation": aggregation,
                "retention_label": retention_label,
                "buckets": buckets,
            }
        )
    return {"categories": categories, "routines": entries}
