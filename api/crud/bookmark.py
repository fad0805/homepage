import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.bookmark import (
    BookmarkGoal,
    BookmarkRating,
    BookmarkReview,
    BookmarkRoutine,
    BookmarkRoutineCheck,
    BookmarkRoutineMonthlyStat,
)
from schemas.bookmark import (
    BookmarkGoalUpdate,
    BookmarkRatingUpdate,
    BookmarkReviewUpdate,
    BookmarkRoutineCheckUpdate,
    BookmarkRoutineCreate,
    BookmarkRoutineUpdate,
)

PERIOD_TYPES = {"year", "quarter", "month", "week", "day"}
PERIOD_FREQUENCIES = {
    "day": {"daily", "weekly"},
    "week": {"weekly"},
    "month": {"monthly"},
    "quarter": {"quarterly"},
    "year": {"yearly"},
}
FREQUENCY_CHECK_PERIOD = {
    "daily": "day",
    "weekly": "day",
    "monthly": "month",
    "quarterly": "quarter",
    "yearly": "year",
}
FREQUENCIES = set(FREQUENCY_CHECK_PERIOD)

KST = ZoneInfo("Asia/Seoul")
SHORT_RETENTION_MONTHS = 3
LONG_RETENTION_MONTHS = 36


def _utc_naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _clean_title(value: str | None) -> str:
    title = (value or "").strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="제목을 입력해주세요.",
        )
    return title


def _clean_notes(value: str | None) -> str | None:
    notes = (value or "").strip()
    return notes or None


def _validate_period(period_type: str, period_start: date) -> None:
    if period_type not in PERIOD_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="지원하지 않는 기간 단위입니다.",
        )
    if period_type == "year" and (
        period_start.month != 1 or period_start.day != 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="연간 기간은 1월 1일부터 시작해야 합니다.",
        )
    if period_type == "quarter" and (
        period_start.month not in (1, 4, 7, 10)
        or period_start.day != 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="분기 기간은 1·4·7·10월 1일부터 시작해야 합니다.",
        )
    if period_type == "month" and period_start.day != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="월간 기간은 1일부터 시작해야 합니다.",
        )
    if period_type == "week" and period_start.weekday() != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="주간 기간은 월요일부터 시작해야 합니다.",
        )


def _month_has_day(year: int, month: int, day: int) -> bool:
    return 1 <= day <= calendar.monthrange(year, month)[1]


def _nth_weekday_day(
    year: int,
    month: int,
    nth_week: int,
    weekday: int,
) -> int | None:
    first_weekday = date(year, month, 1).weekday()
    day = 1 + (weekday - first_weekday) % 7 + (nth_week - 1) * 7
    return day if day <= calendar.monthrange(year, month)[1] else None


def _validate_schedule(
    frequency: str,
    *,
    weekday: int | None,
    weekdays: list[int] | None,
    day_of_month: int | None,
    nth_week: int | None,
    month: int | None,
) -> dict[str, Any]:
    if frequency not in FREQUENCIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="지원하지 않는 반복 주기입니다.",
        )
    if frequency == "daily":
        return {
            "weekday": None,
            "weekdays": None,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if frequency == "weekly":
        cleaned = sorted({value for value in (weekdays or [])})
        if not cleaned or any(value < 0 or value > 6 for value in cleaned):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="매주 반복할 요일을 하나 이상 선택해주세요.",
            )
        return {
            "weekday": None,
            "weekdays": cleaned,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if frequency == "monthly":
        if day_of_month is not None:
            return {
                "weekday": None,
                "weekdays": None,
                "day_of_month": day_of_month,
                "nth_week": None,
                "month": None,
            }
        if nth_week is None or weekday is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="매월 날짜 또는 몇 번째 요일을 선택해주세요.",
            )
        return {
            "weekday": weekday,
            "weekdays": None,
            "day_of_month": None,
            "nth_week": nth_week,
            "month": None,
        }
    if frequency == "quarterly":
        return {
            "weekday": None,
            "weekdays": None,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if month is None or day_of_month is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="매년 반복할 월과 날짜를 선택해주세요.",
        )
    if not _month_has_day(2000, month, day_of_month):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="매년 반복할 날짜가 올바르지 않습니다.",
        )
    return {
        "weekday": None,
        "weekdays": None,
        "day_of_month": day_of_month,
        "nth_week": None,
        "month": month,
    }


def _routine_due(routine: BookmarkRoutine, period_start: date) -> bool:
    if routine.frequency == "monthly":
        if routine.day_of_month is not None:
            return _month_has_day(
                period_start.year,
                period_start.month,
                routine.day_of_month,
            )
        if routine.nth_week is not None and routine.weekday is not None:
            return (
                _nth_weekday_day(
                    period_start.year,
                    period_start.month,
                    routine.nth_week,
                    routine.weekday,
                )
                is not None
            )
        return False
    if routine.frequency == "yearly":
        if routine.month is None or routine.day_of_month is None:
            return False
        return _month_has_day(
            period_start.year,
            routine.month,
            routine.day_of_month,
        )
    return True


def _routine_actionable_on(
    routine: BookmarkRoutine,
    day: date,
) -> bool:
    if routine.frequency == "daily":
        return True
    if routine.frequency == "weekly":
        return day.weekday() in _routine_weekdays(routine)
    if routine.frequency == "monthly":
        if routine.day_of_month is not None:
            return day.day == routine.day_of_month
        if routine.nth_week is not None and routine.weekday is not None:
            return (
                _nth_weekday_day(
                    day.year,
                    day.month,
                    routine.nth_week,
                    routine.weekday,
                )
                == day.day
            )
        return False
    if routine.frequency == "yearly":
        return (
            routine.month == day.month
            and routine.day_of_month == day.day
        )
    return False


def _routine_weekdays(routine: BookmarkRoutine) -> list[int]:
    values = routine.weekdays
    if not values and routine.weekday is not None:
        values = [routine.weekday]
    return sorted(
        {int(value) for value in (values or []) if 0 <= int(value) <= 6}
    )


def _routine_occurrences(
    routine: BookmarkRoutine,
    period_type: str,
    period_start: date,
) -> list[date]:
    if period_type == "day":
        if routine.frequency == "daily":
            return [period_start]
        if routine.frequency == "weekly":
            return (
                [period_start]
                if period_start.weekday() in _routine_weekdays(routine)
                else []
            )
        return []
    if period_type == "week":
        if routine.frequency != "weekly":
            return []
        return [
            period_start + timedelta(days=offset)
            for offset in range(7)
            if (period_start + timedelta(days=offset)).weekday()
            in _routine_weekdays(routine)
        ]
    if period_type == "month":
        return (
            [period_start]
            if routine.frequency == "monthly"
            and _routine_due(routine, period_start)
            else []
        )
    if period_type == "quarter":
        return [period_start] if routine.frequency == "quarterly" else []
    if period_type == "year":
        return (
            [period_start]
            if routine.frequency == "yearly"
            and _routine_due(routine, period_start)
            else []
        )
    return []


def _kst_today() -> date:
    return datetime.now(KST).date()


def _shift_months(value: date, months: int) -> date:
    total = value.year * 12 + value.month - 1 + months
    year, month_index = divmod(total, 12)
    month = month_index + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _month_end(value: date) -> date:
    first = _month_start(value)
    return date(
        first.year,
        first.month,
        calendar.monthrange(first.year, first.month)[1],
    )


def _done_day_dates(
    db: Session,
    routine: BookmarkRoutine,
    start: date,
    end: date,
) -> set[date]:
    rows = (
        db.query(BookmarkRoutineCheck.period_start)
        .filter(
            BookmarkRoutineCheck.user_id == routine.user_id,
            BookmarkRoutineCheck.routine_id == routine.id,
            BookmarkRoutineCheck.period_type == "day",
            BookmarkRoutineCheck.done.is_(True),
            BookmarkRoutineCheck.period_start >= start,
            BookmarkRoutineCheck.period_start <= end,
        )
        .all()
    )
    return {row[0] for row in rows}


def _has_done_period_check(
    db: Session,
    routine: BookmarkRoutine,
    period_type: str,
    period_start: date,
) -> bool:
    return (
        db.query(BookmarkRoutineCheck.id)
        .filter(
            BookmarkRoutineCheck.user_id == routine.user_id,
            BookmarkRoutineCheck.routine_id == routine.id,
            BookmarkRoutineCheck.period_type == period_type,
            BookmarkRoutineCheck.period_start == period_start,
            BookmarkRoutineCheck.done.is_(True),
        )
        .first()
        is not None
    )


def _routine_month_values(
    db: Session,
    routine: BookmarkRoutine,
    month_start: date,
) -> tuple[int, int] | None:
    first = _month_start(month_start)
    last = _month_end(first)

    if routine.frequency == "daily":
        completed = len(_done_day_dates(db, routine, first, last))
        return completed, last.day

    if routine.frequency == "weekly":
        weekdays = set(_routine_weekdays(routine))
        if not weekdays:
            return None
        expected_dates = {
            first + timedelta(days=offset)
            for offset in range(last.day)
            if (first + timedelta(days=offset)).weekday() in weekdays
        }
        if not expected_dates:
            return None
        completed = len(
            _done_day_dates(db, routine, first, last) & expected_dates
        )
        return completed, len(expected_dates)

    if routine.frequency == "monthly":
        if not _routine_due(routine, first):
            return None
        return (
            1
            if _has_done_period_check(db, routine, "month", first)
            else 0,
            1,
        )

    if routine.frequency == "quarterly":
        quarter_month = ((first.month - 1) // 3) * 3 + 1
        if first.month != quarter_month:
            return None
        quarter_start = date(first.year, quarter_month, 1)
        return (
            1
            if _has_done_period_check(
                db,
                routine,
                "quarter",
                quarter_start,
            )
            else 0,
            1,
        )

    if routine.frequency == "yearly":
        if first.month != 1:
            return None
        year_start = date(first.year, 1, 1)
        return (
            1
            if _has_done_period_check(db, routine, "year", year_start)
            else 0,
            1,
        )

    return None


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


def prune_old_routine_checks(
    db: Session,
    *,
    today: date | None = None,
) -> int:
    """Keep detailed checks for the recent graph; preserve monthly stats."""
    current = today or _kst_today()
    short_cutoff = _shift_months(current, -SHORT_RETENTION_MONTHS)
    long_cutoff = _shift_months(current, -LONG_RETENTION_MONTHS)
    # Backfill any monthly aggregates that are missing, including checks
    # created before the monthly stats table existed. This also rolls up
    # checks that are about to be pruned.
    check_pairs = (
        db.query(
            BookmarkRoutineCheck.user_id,
            BookmarkRoutineCheck.routine_id,
            BookmarkRoutineCheck.period_start,
        )
        .filter(BookmarkRoutineCheck.routine_id.isnot(None))
        .all()
    )
    existing_stats = {
        (row.user_id, row.routine_id, row.month_start)
        for row in db.query(
            BookmarkRoutineMonthlyStat.user_id,
            BookmarkRoutineMonthlyStat.routine_id,
            BookmarkRoutineMonthlyStat.month_start,
        ).all()
    }
    missing_pairs = {
        (user_id, routine_id, _month_start(period_start))
        for user_id, routine_id, period_start in check_pairs
        if (user_id, routine_id, _month_start(period_start))
        not in existing_stats
    }
    for _user_id, routine_id, month_start in missing_pairs:
        routine = db.get(BookmarkRoutine, routine_id)
        if routine is not None:
            _upsert_routine_monthly_stat(db, routine, month_start)
    if missing_pairs:
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
    if routine.frequency in {"daily", "weekly"}:
        start = _shift_months(current, -SHORT_RETENTION_MONTHS)
        done_dates = _done_day_dates(db, routine, start, current)
        weekdays = (
            set(_routine_weekdays(routine))
            if routine.frequency == "weekly"
            else set(range(7))
        )
        day = start
        while day <= current:
            daily.append(
                {
                    "date": day,
                    "scheduled": day.weekday() in weekdays,
                    "done": day in done_dates,
                }
            )
            day += timedelta(days=1)

    monthly = (
        db.query(BookmarkRoutineMonthlyStat)
        .filter(
            BookmarkRoutineMonthlyStat.user_id == user_id,
            BookmarkRoutineMonthlyStat.routine_id == routine.id,
            BookmarkRoutineMonthlyStat.month_start
            <= _month_start(current),
        )
        .order_by(BookmarkRoutineMonthlyStat.month_start)
        .all()
    )
    return {"daily": daily, "monthly": monthly}


def _routine_period_dict(
    routine: BookmarkRoutine,
    *,
    period_type: str,
    period_start: date,
    occurrences: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": routine.id,
        "title": routine.title,
        "notes": routine.notes,
        "frequency": routine.frequency,
        "weekday": routine.weekday,
        "weekdays": _routine_weekdays(routine) or None,
        "day_of_month": routine.day_of_month,
        "nth_week": routine.nth_week,
        "month": routine.month,
        "active": bool(routine.active),
        "position": routine.position,
        "created_at": routine.created_at,
        "updated_at": routine.updated_at,
        "period_type": period_type,
        "period_start": period_start,
        "occurrences": occurrences,
    }


def _get_routine_or_404(
    db: Session,
    routine_id: int,
    user_id: int,
) -> BookmarkRoutine:
    routine = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.id == routine_id,
            BookmarkRoutine.user_id == user_id,
        )
        .first()
    )
    if routine is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="책갈피 루틴을 찾을 수 없습니다.",
        )
    return routine


def get_today(
    db: Session,
    user_id: int,
    *,
    day: date | None = None,
) -> dict[str, Any]:
    target = day or _kst_today()
    routines = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.active.is_(True),
        )
        .order_by(BookmarkRoutine.position, BookmarkRoutine.id)
        .all()
    )
    routines = [
        routine for routine in routines if _routine_actionable_on(routine, target)
    ]
    frequency_order = {
        "daily": 0,
        "weekly": 1,
        "monthly": 2,
        "yearly": 3,
    }
    routines.sort(
        key=lambda routine: (
            frequency_order.get(routine.frequency, 9),
            routine.position,
            routine.id,
        )
    )
    month_start = _month_start(target)
    year_start = date(target.year, 1, 1)
    day_ids = [
        routine.id
        for routine in routines
        if routine.frequency in {"daily", "weekly"}
    ]
    month_ids = [
        routine.id
        for routine in routines
        if routine.frequency == "monthly"
    ]
    year_ids = [
        routine.id
        for routine in routines
        if routine.frequency == "yearly"
    ]

    def done_ids(
        routine_ids: list[int],
        period_type: str,
        period_start: date,
    ) -> set[int]:
        if not routine_ids:
            return set()
        rows = (
            db.query(BookmarkRoutineCheck.routine_id)
            .filter(
                BookmarkRoutineCheck.user_id == user_id,
                BookmarkRoutineCheck.routine_id.in_(routine_ids),
                BookmarkRoutineCheck.period_type == period_type,
                BookmarkRoutineCheck.period_start == period_start,
                BookmarkRoutineCheck.done.is_(True),
            )
            .all()
        )
        return {row[0] for row in rows}

    day_done = done_ids(day_ids, "day", target)
    month_done = done_ids(month_ids, "month", month_start)
    year_done = done_ids(year_ids, "year", year_start)

    def routine_entry(routine: BookmarkRoutine) -> dict[str, Any]:
        if routine.frequency in {"daily", "weekly"}:
            period_type = "day"
            occurrence_date = target
            done = routine.id in day_done
        elif routine.frequency == "monthly":
            period_type = "month"
            occurrence_date = month_start
            done = routine.id in month_done
        else:
            period_type = "year"
            occurrence_date = year_start
            done = routine.id in year_done
        return _routine_period_dict(
            routine,
            period_type=period_type,
            period_start=occurrence_date,
            occurrences=[{"date": occurrence_date, "done": done}],
        )

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
        "routines": [routine_entry(routine) for routine in routines],
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
    routines = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.frequency.in_(PERIOD_FREQUENCIES[period_type]),
            BookmarkRoutine.active.is_(True),
        )
        .order_by(BookmarkRoutine.position, BookmarkRoutine.id)
        .all()
    )

    occurrence_dates: dict[int, list[date]] = {}
    for routine in routines:
        dates = _routine_occurrences(routine, period_type, period_start)
        if dates:
            occurrence_dates[routine.id] = dates
    routines = [routine for routine in routines if routine.id in occurrence_dates]
    routine_ids = [routine.id for routine in routines]

    checks: dict[tuple[int, date], bool] = {}
    if routine_ids:
        if period_type in {"day", "week"}:
            check_period_type = "day"
            start = period_start
            end = (
                period_start
                if period_type == "day"
                else period_start + timedelta(days=6)
            )
            check_rows = (
                db.query(BookmarkRoutineCheck)
                .filter(
                    BookmarkRoutineCheck.user_id == user_id,
                    BookmarkRoutineCheck.routine_id.in_(routine_ids),
                    BookmarkRoutineCheck.period_type == check_period_type,
                    BookmarkRoutineCheck.period_start >= start,
                    BookmarkRoutineCheck.period_start <= end,
                )
                .all()
            )
        else:
            check_period_type = period_type
            check_rows = (
                db.query(BookmarkRoutineCheck)
                .filter(
                    BookmarkRoutineCheck.user_id == user_id,
                    BookmarkRoutineCheck.routine_id.in_(routine_ids),
                    BookmarkRoutineCheck.period_type == check_period_type,
                    BookmarkRoutineCheck.period_start == period_start,
                )
                .all()
            )
        checks = {
            (row.routine_id, row.period_start): bool(row.done)
            for row in check_rows
        }

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
        "routines": [
            _routine_period_dict(
                routine,
                period_type=period_type,
                period_start=period_start,
                occurrences=[
                    {
                        "date": occurrence_date,
                        "done": checks.get((routine.id, occurrence_date), False),
                    }
                    for occurrence_date in occurrence_dates[routine.id]
                ],
            )
            for routine in routines
        ],
        "goal": goal,
        "rating": rating,
        "review": review,
    }


def create_routine(
    db: Session,
    payload: BookmarkRoutineCreate,
    user_id: int,
) -> BookmarkRoutine:
    schedule = _validate_schedule(
        payload.frequency,
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
        title=_clean_title(payload.title),
        notes=_clean_notes(payload.notes),
        frequency=payload.frequency,
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
    if "active" in data:
        routine.active = bool(data["active"])

    schedule_fields = {
        "weekday",
        "weekdays",
        "day_of_month",
        "nth_week",
        "month",
    }
    if schedule_fields.intersection(data):
        schedule = _validate_schedule(
            routine.frequency,
            weekday=data.get("weekday", routine.weekday),
            weekdays=data.get("weekdays", routine.weekdays),
            day_of_month=data.get(
                "day_of_month",
                routine.day_of_month,
            ),
            nth_week=data.get("nth_week", routine.nth_week),
            month=data.get("month", routine.month),
        )
        routine.weekday = schedule["weekday"]
        routine.weekdays = schedule["weekdays"]
        routine.day_of_month = schedule["day_of_month"]
        routine.nth_week = schedule["nth_week"]
        routine.month = schedule["month"]

    db.commit()
    db.refresh(routine)
    return routine


def delete_routine(db: Session, routine_id: int, user_id: int) -> dict:
    routine = _get_routine_or_404(db, routine_id, user_id)
    db.delete(routine)
    db.commit()
    return {"success": True}


def set_routine_check(
    db: Session,
    routine_id: int,
    payload: BookmarkRoutineCheckUpdate,
    user_id: int,
) -> dict[str, Any]:
    routine = _get_routine_or_404(db, routine_id, user_id)
    _validate_period(payload.period_type, payload.period_start)

    expected_period = FREQUENCY_CHECK_PERIOD[routine.frequency]
    if payload.period_type != expected_period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="루틴 주기와 기간 단위가 맞지 않습니다.",
        )

    if routine.frequency == "weekly":
        if payload.period_start.weekday() not in _routine_weekdays(routine):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이 요일에는 해당 루틴이 예정되어 있지 않습니다.",
            )
    elif not _routine_due(routine, payload.period_start):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이 기간에는 해당 루틴이 예정되어 있지 않습니다.",
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
        )
        db.add(check)
    check.done = bool(payload.done)
    check.completed_at = _utc_naive_now() if payload.done else None
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
        occurrences=[
            {
                "date": payload.period_start,
                "done": bool(check.done),
            }
        ],
    )


def save_goal(
    db: Session,
    payload: BookmarkGoalUpdate,
    user_id: int,
) -> BookmarkGoal:
    _validate_period(payload.period_type, payload.period_start)
    goal = (
        db.query(BookmarkGoal)
        .filter(
            BookmarkGoal.user_id == user_id,
            BookmarkGoal.period_type == payload.period_type,
            BookmarkGoal.period_start == payload.period_start,
        )
        .first()
    )
    if goal is None:
        goal = BookmarkGoal(
            user_id=user_id,
            period_type=payload.period_type,
            period_start=payload.period_start,
            content=payload.content,
        )
        db.add(goal)
    else:
        goal.content = payload.content
    db.commit()
    db.refresh(goal)
    return goal


def save_rating(
    db: Session,
    payload: BookmarkRatingUpdate,
    user_id: int,
) -> BookmarkRating | None:
    _validate_period(payload.period_type, payload.period_start)
    rating = (
        db.query(BookmarkRating)
        .filter(
            BookmarkRating.user_id == user_id,
            BookmarkRating.period_type == payload.period_type,
            BookmarkRating.period_start == payload.period_start,
        )
        .first()
    )
    if payload.rating <= 0:
        if rating is not None:
            db.delete(rating)
            db.commit()
        return None
    if rating is None:
        rating = BookmarkRating(
            user_id=user_id,
            period_type=payload.period_type,
            period_start=payload.period_start,
            rating=payload.rating,
        )
        db.add(rating)
    else:
        rating.rating = payload.rating
    db.commit()
    db.refresh(rating)
    return rating


def save_review(
    db: Session,
    payload: BookmarkReviewUpdate,
    user_id: int,
) -> BookmarkReview:
    _validate_period(payload.period_type, payload.period_start)
    review = (
        db.query(BookmarkReview)
        .filter(
            BookmarkReview.user_id == user_id,
            BookmarkReview.period_type == payload.period_type,
            BookmarkReview.period_start == payload.period_start,
        )
        .first()
    )
    if review is None:
        review = BookmarkReview(
            user_id=user_id,
            period_type=payload.period_type,
            period_start=payload.period_start,
            content=payload.content,
        )
        db.add(review)
    else:
        review.content = payload.content
    db.commit()
    db.refresh(review)
    return review
