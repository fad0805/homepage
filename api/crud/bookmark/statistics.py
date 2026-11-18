"""Bookmark statistics."""

from collections import defaultdict

from .common import *  # noqa: F401,F403
from .categories import list_routine_categories
from .schedule import _quarter_matches, _routine_monthly_due_date


class _StatsChecks:
    """Check rows prefetched once for all statistics buckets."""

    def __init__(self, rows: list[BookmarkRoutineCheck]) -> None:
        self._rows: dict[
            tuple[int, str, date], BookmarkRoutineCheck
        ] = {}
        self._days: dict[int, dict[date, int]] = defaultdict(dict)
        for row in rows:
            self._rows[
                (row.routine_id, row.period_type, row.period_start)
            ] = row
            if row.period_type == "day":
                counts = self._days[row.routine_id]
                counts[row.period_start] = counts.get(
                    row.period_start, 0
                ) + int(row.count or 0)

    def row(
        self,
        routine: BookmarkRoutine,
        period_type: str,
        period_start: date,
    ) -> BookmarkRoutineCheck | None:
        return self._rows.get(
            (routine.id, period_type, period_start)
        )

    def count(
        self,
        routine: BookmarkRoutine,
        period_type: str,
        period_start: date,
    ) -> int:
        row = self.row(routine, period_type, period_start)
        return int(row.count or 0) if row is not None else 0

    def completed(
        self,
        routine: BookmarkRoutine,
        period_type: str,
        period_start: date,
    ) -> int:
        row = self.row(routine, period_type, period_start)
        if row is None:
            return 0
        if row.manual_done:
            return max(1, int(routine.target_count or 1))
        return int(row.count or 0)

    def day_sum(
        self,
        routine: BookmarkRoutine,
        start: date,
        end: date,
    ) -> int:
        return sum(
            count
            for day, count in self._days.get(routine.id, {}).items()
            if start <= day <= end
        )

    def done_dates(
        self,
        routine: BookmarkRoutine,
        start: date,
        end: date,
    ) -> set[date]:
        return {
            day
            for day, count in self._days.get(routine.id, {}).items()
            if count > 0 and start <= day <= end
        }

    def week_rows(
        self,
        routine: BookmarkRoutine,
        starts: list[date],
    ) -> list[tuple[date, int | None, bool]]:
        rows: list[tuple[date, int | None, bool]] = []
        for start in starts:
            row = self.row(routine, "week", start)
            if row is not None:
                rows.append((start, row.count, bool(row.manual_done)))
        return rows


def _check_count(
    db: Session,
    routine: BookmarkRoutine,
    period_type: str,
    period_start: date,
    checks: _StatsChecks | None = None,
) -> int:
    if checks is not None:
        return checks.count(routine, period_type, period_start)
    return _period_check_count(db, routine, period_type, period_start)


def _check_completed(
    db: Session,
    routine: BookmarkRoutine,
    period_type: str,
    period_start: date,
    checks: _StatsChecks | None = None,
) -> int:
    if checks is not None:
        return checks.completed(routine, period_type, period_start)
    return _period_check_completed(
        db, routine, period_type, period_start
    )


def _check_day_sum(
    db: Session,
    routine: BookmarkRoutine,
    start: date,
    end: date,
    checks: _StatsChecks | None = None,
) -> int:
    if checks is not None:
        return checks.day_sum(routine, start, end)
    completed = (
        db.query(func.coalesce(func.sum(BookmarkRoutineCheck.count), 0))
        .filter(
            BookmarkRoutineCheck.user_id == routine.user_id,
            BookmarkRoutineCheck.routine_id == routine.id,
            BookmarkRoutineCheck.period_type == "day",
            BookmarkRoutineCheck.period_start >= start,
            BookmarkRoutineCheck.period_start <= end,
        )
        .scalar()
    )
    return int(completed or 0)


def _check_done_dates(
    db: Session,
    routine: BookmarkRoutine,
    start: date,
    end: date,
    checks: _StatsChecks | None = None,
) -> set[date]:
    if checks is not None:
        return checks.done_dates(routine, start, end)
    return _done_dates(db, routine, start, end)


def _period_check_completed(
    db: Session,
    routine: BookmarkRoutine,
    period_type: str,
    period_start: date,
    checks: _StatsChecks | None = None,
) -> int:
    if checks is not None:
        return checks.completed(routine, period_type, period_start)
    if routine.tracking_mode != "count":
        return _period_check_count(db, routine, period_type, period_start)
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
    if row is None:
        return 0
    count, manual_done = row
    if manual_done:
        return max(1, int(routine.target_count or 1))
    return int(count or 0)


def _routine_month_values(
    db: Session,
    routine: BookmarkRoutine,
    month_start: date,
    checks: _StatsChecks | None = None,
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
        completed = _check_day_sum(
            db, routine, active_start, active_end, checks
        )
        return completed, (active_end - active_start).days + 1

    if routine.frequency == "weekly":
        if routine.tracking_mode == "count":
            # Weekly checks are stored with Monday as period_start. The first
            # week can begin before a mid-week routine start, but it is still
            # a count-bearing week when its end overlaps the active range.
            # A week starting before the month belongs to this month only when
            # the routine itself starts in this month; otherwise that Monday
            # was already counted by the previous month.
            expected_weeks: list[date] = []
            week_start = first - timedelta(days=first.weekday())
            while week_start <= active_end:
                if (
                    week_start + timedelta(days=6) >= active_start
                    and (week_start >= first or routine.start_date >= first)
                ):
                    expected_weeks.append(week_start)
                week_start += timedelta(weeks=1)
            expected = target * len(expected_weeks)
            if expected <= 0:
                return None
            if checks is not None:
                rows = checks.week_rows(routine, expected_weeks)
            else:
                rows = (
                    db.query(
                        BookmarkRoutineCheck.period_start,
                        BookmarkRoutineCheck.count,
                        BookmarkRoutineCheck.manual_done,
                    )
                    .filter(
                        BookmarkRoutineCheck.user_id == routine.user_id,
                        BookmarkRoutineCheck.routine_id == routine.id,
                        BookmarkRoutineCheck.period_type == "week",
                        BookmarkRoutineCheck.period_start.in_(
                            expected_weeks
                        ),
                    )
                    .all()
                )
            completed = sum(
                target if manual_done else int(count or 0)
                for _period_start, count, manual_done in rows
            )
            return completed, expected
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
            _check_done_dates(
                db, routine, active_start, active_end, checks
            )
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
            return _check_count(db, routine, "month", first, checks), 1
        return _check_completed(db, routine, "month", first, checks), target

    if routine.frequency == "quarterly":
        if first.month not in QUARTER_START_MONTHS:
            return None
        if not _quarter_matches(routine, first):
            return None
        quarter = date(first.year, first.month, 1)
        completed = _check_completed(
            db, routine, "quarter", quarter, checks
        )
        return completed, 1 if routine.tracking_mode == "date" else target

    if first.month != 1:
        return None
    completed = _check_completed(db, routine, "year", first, checks)
    return completed, 1 if routine.tracking_mode == "date" else target


def _upsert_routine_monthly_stat(
    db: Session,
    routine: BookmarkRoutine,
    month_start: date,
) -> None:
    db.flush()
    values = _routine_month_values(db, routine, month_start)
    first = _month_start(month_start)
    stat = (
        db.query(BookmarkRoutineMonthlyStat)
        .filter(
            BookmarkRoutineMonthlyStat.user_id == routine.user_id,
            BookmarkRoutineMonthlyStat.routine_id == routine.id,
            BookmarkRoutineMonthlyStat.month_start == first,
        )
        .first()
    )
    if values is None:
        if stat is not None:
            db.delete(stat)
        return
    completed, expected = values
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
    checks: _StatsChecks,
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
            completed = checks.day_sum(routine, active_start, active_end)
            buckets.append(_stat_bucket(week_start, completed, expected))
            continue
        if routine.tracking_mode == "count":
            completed = checks.completed(routine, "week", week_start)
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
            checks.done_dates(routine, active_start, active_end)
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
    checks: _StatsChecks,
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
        values = _routine_month_values(
            db, routine, month_start, checks
        )
        if values is None:
            buckets.append(_stat_bucket(month_start, 0, 0))
        else:
            buckets.append(
                _stat_bucket(month_start, values[0], values[1])
            )
    return buckets


def _quarterly_stat_buckets(
    checks: _StatsChecks,
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
        completed = checks.count(routine, "quarter", quarter_start)
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
    checks: _StatsChecks,
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
        completed = checks.count(routine, "year", year_start)
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
    min_stat_date = _shift_months(_month_start(today), -35)
    check_rows = (
        db.query(BookmarkRoutineCheck)
        .filter(
            BookmarkRoutineCheck.user_id == user_id,
            BookmarkRoutineCheck.period_start >= min_stat_date,
        )
        .all()
    )
    checks = _StatsChecks(check_rows)
    entries: list[dict[str, Any]] = []
    for routine in routines:
        if routine.frequency in {"daily", "weekly"}:
            aggregation = "week"
            retention_label = "최근 3개월"
            buckets = _weekly_stat_buckets(checks, routine, today)
        elif routine.frequency == "monthly":
            aggregation = "month"
            retention_label = "최근 3년"
            buckets = _monthly_stat_buckets(
                db, checks, routine, today
            )
        elif routine.frequency == "quarterly":
            aggregation = "quarter"
            retention_label = "최근 3년"
            buckets = _quarterly_stat_buckets(checks, routine, today)
        else:
            aggregation = "year"
            retention_label = "최근 3년"
            buckets = _yearly_stat_buckets(checks, routine, today)
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
