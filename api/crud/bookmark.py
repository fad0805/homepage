import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from models.bookmark import (
    BookmarkGoal,
    BookmarkRating,
    BookmarkReview,
    BookmarkRoutine,
    BookmarkRoutineCategory,
    BookmarkRoutineCheck,
    BookmarkRoutineMonthlyStat,
)
from schemas.bookmark import (
    BookmarkGoalUpdate,
    BookmarkRoutineCategoryCreate,
    BookmarkRoutineCategoryUpdate,
    BookmarkRatingUpdate,
    BookmarkReviewUpdate,
    BookmarkRoutineCheckUpdate,
    BookmarkRoutineCreate,
    BookmarkRoutineUpdate,
)

PERIOD_TYPES = {"year", "quarter", "month", "week", "day"}
PERIOD_FREQUENCY = {
    "day": "daily",
    "week": "weekly",
    "month": "monthly",
    "quarter": "quarterly",
    "year": "yearly",
}
CHECK_PERIOD_BY_FREQUENCY = {
    "daily": "day",
    "weekly": "week",
    "monthly": "month",
    "quarterly": "quarter",
    "yearly": "year",
}
FREQUENCY_ORDER = {
    "daily": 0,
    "weekly": 1,
    "monthly": 2,
    "quarterly": 3,
    "yearly": 4,
}
KST = ZoneInfo("Asia/Seoul")
SHORT_RETENTION_MONTHS = 3
LONG_RETENTION_MONTHS = 36


def _utc_naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _kst_today() -> date:
    return datetime.now(KST).date()


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


def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _quarter_start(value: date) -> date:
    month = ((value.month - 1) // 3) * 3 + 1
    return date(value.year, month, 1)


def _year_start(value: date) -> date:
    return date(value.year, 1, 1)


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


def _routine_weekdays(routine: BookmarkRoutine) -> list[int]:
    values = routine.weekdays
    if not values and routine.weekday is not None:
        values = [routine.weekday]
    return sorted(
        {int(value) for value in (values or []) if 0 <= int(value) <= 6}
    )


def _routine_monthly_due(routine: BookmarkRoutine, month: date) -> bool:
    if routine.day_of_month is not None:
        return _month_has_day(
            month.year,
            month.month,
            routine.day_of_month,
        )
    if routine.nth_week is not None and routine.weekday is not None:
        return (
            _nth_weekday_day(
                month.year,
                month.month,
                routine.nth_week,
                routine.weekday,
            )
            is not None
        )
    return False


def _routine_due_on_day(routine: BookmarkRoutine, day: date) -> bool:
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
    return True


def _validate_schedule(
    *,
    frequency: str,
    tracking_mode: str,
    target_count: int | None,
    weekday: int | None,
    weekdays: list[int] | None,
    day_of_month: int | None,
    nth_week: int | None,
    month: int | None,
) -> tuple[str, int, dict[str, Any]]:
    if frequency == "daily":
        return "date", 1, {
            "weekday": None,
            "weekdays": None,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if tracking_mode == "count":
        return "count", max(1, int(target_count or 1)), {
            "weekday": None,
            "weekdays": None,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if tracking_mode != "date":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기록 방식을 확인해주세요.",
        )
    if frequency == "weekly":
        cleaned = sorted({int(value) for value in (weekdays or [])})
        if not cleaned or any(value < 0 or value > 6 for value in cleaned):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="매주 반복할 요일을 하나 이상 선택해주세요.",
            )
        return "date", len(cleaned), {
            "weekday": None,
            "weekdays": cleaned,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if frequency == "monthly":
        if day_of_month is not None:
            return "date", 1, {
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
        return "date", 1, {
            "weekday": weekday,
            "weekdays": None,
            "day_of_month": None,
            "nth_week": nth_week,
            "month": None,
        }
    if frequency == "quarterly":
        return "date", 1, {
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
    return "date", 1, {
        "weekday": None,
        "weekdays": None,
        "day_of_month": day_of_month,
        "nth_week": None,
        "month": month,
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


def _resolve_category_id(
    db: Session,
    user_id: int,
    category_id: int | None,
) -> int | None:
    if category_id is None or category_id <= 0:
        return None
    category = (
        db.query(BookmarkRoutineCategory)
        .filter(
            BookmarkRoutineCategory.id == category_id,
            BookmarkRoutineCategory.user_id == user_id,
        )
        .first()
    )
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="루틴 카테고리를 찾을 수 없습니다.",
        )
    return category.id


def _period_check_count(
    db: Session,
    routine: BookmarkRoutine,
    period_type: str,
    period_start: date,
) -> int:
    count = (
        db.query(BookmarkRoutineCheck.count)
        .filter(
            BookmarkRoutineCheck.user_id == routine.user_id,
            BookmarkRoutineCheck.routine_id == routine.id,
            BookmarkRoutineCheck.period_type == period_type,
            BookmarkRoutineCheck.period_start == period_start,
        )
        .scalar()
    )
    return int(count or 0)


def _done_dates(
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
            BookmarkRoutineCheck.count > 0,
            BookmarkRoutineCheck.period_start >= start,
            BookmarkRoutineCheck.period_start <= end,
        )
        .all()
    )
    return {row[0] for row in rows}


def _routine_period_dict(
    routine: BookmarkRoutine,
    *,
    period_type: str,
    period_start: date,
    completed_count: int,
    occurrences: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": routine.id,
        "title": routine.title,
        "notes": routine.notes,
        "category_id": routine.category_id,
        "category_name": routine.category.name if routine.category else None,
        "frequency": routine.frequency,
        "tracking_mode": routine.tracking_mode,
        "target_count": routine.target_count,
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
        "completed_count": completed_count,
        "occurrences": occurrences
        if occurrences is not None
        else [{"date": period_start, "done": completed_count > 0}],
    }


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
        done_dates = _done_dates(db, routine, week_start, week_start + timedelta(days=6))
        occurrences = [
            {"date": day, "done": day in done_dates}
            for day in dates
        ]
        selected_dates = {
            week_start + timedelta(days=offset)
            for offset in range(7)
            if (week_start + timedelta(days=offset)).weekday()
            in _routine_weekdays(routine)
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
        if require_month_due and not _routine_monthly_due(routine, month):
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


def _check_period_type(routine: BookmarkRoutine) -> str:
    if routine.frequency == "daily":
        return "day"
    if routine.tracking_mode == "count":
        return CHECK_PERIOD_BY_FREQUENCY[routine.frequency]
    if routine.frequency == "weekly":
        return "day"
    return CHECK_PERIOD_BY_FREQUENCY[routine.frequency]


def _check_period_start(routine: BookmarkRoutine, day: date) -> date:
    if routine.frequency == "daily":
        return day
    if routine.tracking_mode == "count":
        if routine.frequency == "weekly":
            return _week_start(day)
        if routine.frequency == "monthly":
            return _month_start(day)
        if routine.frequency == "quarterly":
            return _quarter_start(day)
        return _year_start(day)
    if routine.frequency == "weekly":
        return day
    if routine.frequency == "monthly":
        return _month_start(day)
    if routine.frequency == "quarterly":
        return _quarter_start(day)
    return _year_start(day)


def _routine_month_values(
    db: Session,
    routine: BookmarkRoutine,
    month_start: date,
) -> tuple[int, int] | None:
    first = _month_start(month_start)
    last = _month_end(first)
    target = max(1, int(routine.target_count or 1))

    if routine.frequency == "daily":
        completed = (
            db.query(func.coalesce(func.sum(BookmarkRoutineCheck.count), 0))
            .filter(
                BookmarkRoutineCheck.user_id == routine.user_id,
                BookmarkRoutineCheck.routine_id == routine.id,
                BookmarkRoutineCheck.period_type == "day",
                BookmarkRoutineCheck.period_start >= first,
                BookmarkRoutineCheck.period_start <= last,
            )
            .scalar()
        )
        return int(completed or 0), last.day

    if routine.frequency == "weekly":
        if routine.tracking_mode == "count":
            expected_dates = [
                first + timedelta(days=offset)
                for offset in range(last.day)
                if (first + timedelta(days=offset)).weekday() == 0
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
                    BookmarkRoutineCheck.period_start >= first,
                    BookmarkRoutineCheck.period_start <= last,
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
        }
        if not expected_dates:
            return None
        completed = len(
            _done_dates(db, routine, first, last) & expected_dates
        )
        return completed, len(expected_dates)

    if routine.frequency == "monthly":
        if routine.tracking_mode == "date":
            if not _routine_monthly_due(routine, first):
                return None
            return _period_check_count(db, routine, "month", first), 1
        return _period_check_count(db, routine, "month", first), target

    if routine.frequency == "quarterly":
        if first.month not in (1, 4, 7, 10):
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
            BookmarkRoutine.active.is_(True),
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
            BookmarkRoutine.frequency == frequency,
            BookmarkRoutine.active.is_(True),
        )
        .order_by(BookmarkRoutine.position, BookmarkRoutine.id)
        .all()
    )
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
        if entry is not None:
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
    _upsert_routine_monthly_stat(db, routine, _month_start(_kst_today()))

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
    expected_period = _check_period_type(routine)
    if payload.period_type != expected_period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="루틴 기록 방식과 기간 단위가 맞지 않습니다.",
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
        start = _shift_months(current, -SHORT_RETENTION_MONTHS)
        done_dates = _done_dates(db, routine, start, current)
        day = start
        while day <= current:
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
        if routine is not None:
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


def list_routine_categories(
    db: Session,
    user_id: int,
) -> list[BookmarkRoutineCategory]:
    return (
        db.query(BookmarkRoutineCategory)
        .filter(BookmarkRoutineCategory.user_id == user_id)
        .order_by(
            BookmarkRoutineCategory.position,
            BookmarkRoutineCategory.id,
        )
        .all()
    )


def create_routine_category(
    db: Session,
    payload: BookmarkRoutineCategoryCreate,
    user_id: int,
) -> BookmarkRoutineCategory:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="카테고리 이름을 입력해주세요.",
        )
    exists = (
        db.query(BookmarkRoutineCategory.id)
        .filter(
            BookmarkRoutineCategory.user_id == user_id,
            BookmarkRoutineCategory.name == name,
        )
        .first()
    )
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 같은 이름의 카테고리가 있습니다.",
        )
    max_position = (
        db.query(func.max(BookmarkRoutineCategory.position))
        .filter(BookmarkRoutineCategory.user_id == user_id)
        .scalar()
    )
    category = BookmarkRoutineCategory(
        user_id=user_id,
        name=name,
        position=(max_position or -1) + 1,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_routine_category(
    db: Session,
    category_id: int,
    payload: BookmarkRoutineCategoryUpdate,
    user_id: int,
) -> BookmarkRoutineCategory:
    category = (
        db.query(BookmarkRoutineCategory)
        .filter(
            BookmarkRoutineCategory.id == category_id,
            BookmarkRoutineCategory.user_id == user_id,
        )
        .first()
    )
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="루틴 카테고리를 찾을 수 없습니다.",
        )
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="카테고리 이름을 입력해주세요.",
        )
    duplicate = (
        db.query(BookmarkRoutineCategory.id)
        .filter(
            BookmarkRoutineCategory.user_id == user_id,
            BookmarkRoutineCategory.name == name,
            BookmarkRoutineCategory.id != category.id,
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 같은 이름의 카테고리가 있습니다.",
        )
    category.name = name
    db.commit()
    db.refresh(category)
    return category


def delete_routine_category(
    db: Session,
    category_id: int,
    user_id: int,
) -> dict:
    category = (
        db.query(BookmarkRoutineCategory)
        .filter(
            BookmarkRoutineCategory.id == category_id,
            BookmarkRoutineCategory.user_id == user_id,
        )
        .first()
    )
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="루틴 카테고리를 찾을 수 없습니다.",
        )
    db.query(BookmarkRoutine).filter(
        BookmarkRoutine.user_id == user_id,
        BookmarkRoutine.category_id == category.id,
    ).update(
        {BookmarkRoutine.category_id: None},
        synchronize_session=False,
    )
    db.delete(category)
    db.commit()
    return {"success": True}


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
