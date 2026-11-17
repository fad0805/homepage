"""Bookmark history."""

from .common import *  # noqa: F401,F403
from .statistics import (
    _routine_month_values,
    _upsert_routine_monthly_stat,
)


def get_routine_history(
    db: Session,
    routine_id: int,
    user_id: int,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    routine = _get_routine_or_404(db, routine_id, user_id)
    current = today or _kst_today()
    daily: list[dict[str, Any]] = []
    if routine.frequency == "daily" or (
        routine.frequency == "weekly" and routine.tracking_mode == "date"
    ):
        start = max(
            _shift_months(current, -SHORT_RETENTION_MONTHS),
            routine.start_date,
        )
        end = current
        if routine.end_date is not None:
            end = min(end, routine.end_date)
        done_dates = _done_dates(db, routine, start, end)
        day = start
        while day <= end:
            scheduled = (
                routine.frequency == "daily"
                or day.weekday() in _routine_weekdays(routine)
            )
            daily.append(
                {
                    "date": day,
                    "scheduled": scheduled,
                    "done": day in done_dates,
                }
            )
            day += timedelta(days=1)

    if routine.frequency == "monthly":
        first_month = max(
            _month_start(routine.start_date),
            _shift_months(_month_start(current), -35),
        )
        current_quarter_end = _period_end(
            "quarter",
            _quarter_start(current),
        )
        end = routine.end_date or current_quarter_end
        if end > current_quarter_end:
            end = current_quarter_end
        last_month = _month_start(end)
        monthly: list[dict[str, Any]] = []
        month = first_month
        while month <= last_month:
            values = _routine_month_values(db, routine, month)
            if values is not None:
                monthly.append(
                    {
                        "month_start": month,
                        "completed_count": values[0],
                        "expected_count": values[1],
                    }
                )
            month = _shift_months(month, 1)
    else:
        monthly = (
            db.query(BookmarkRoutineMonthlyStat)
            .filter(
                BookmarkRoutineMonthlyStat.user_id == user_id,
                BookmarkRoutineMonthlyStat.routine_id == routine.id,
                BookmarkRoutineMonthlyStat.month_start
                >= _month_start(routine.start_date),
                BookmarkRoutineMonthlyStat.month_start
                <= _month_start(routine.end_date or current),
            )
            .order_by(BookmarkRoutineMonthlyStat.month_start)
            .all()
        )
    return {"daily": daily, "monthly": monthly}


def prune_old_routine_checks(
    db: Session,
    *,
    today: date | None = None,
) -> int:
    current = today or _kst_today()
    short_cutoff = _shift_months(current, -SHORT_RETENTION_MONTHS)
    long_cutoff = _shift_months(current, -LONG_RETENTION_MONTHS)
    check_pairs = (
        db.query(
            BookmarkRoutineCheck.user_id,
            BookmarkRoutineCheck.routine_id,
            BookmarkRoutineCheck.period_start,
        )
        .filter(BookmarkRoutineCheck.routine_id.isnot(None))
        .all()
    )
    pairs = {
        (user_id, routine_id, _month_start(period_start))
        for user_id, routine_id, period_start in check_pairs
    }
    for _user_id, routine_id, month_start in pairs:
        routine = db.get(BookmarkRoutine, routine_id)
        if routine is not None and not routine.calendar_only:
            _upsert_routine_monthly_stat(db, routine, month_start)
    if pairs:
        db.flush()
    deleted_short = (
        db.query(BookmarkRoutineCheck)
        .filter(
            BookmarkRoutineCheck.period_type.in_(["day", "week"]),
            BookmarkRoutineCheck.period_start < short_cutoff,
        )
        .delete(synchronize_session=False)
    )
    deleted_long = (
        db.query(BookmarkRoutineCheck)
        .filter(
            BookmarkRoutineCheck.period_type.in_(
                ["month", "quarter", "year"]
            ),
            BookmarkRoutineCheck.period_start < long_cutoff,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted_short + deleted_long
