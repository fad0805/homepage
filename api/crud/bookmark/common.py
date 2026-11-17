"""Shared imports, constants and helpers for bookmark CRUD."""

import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from models.bookmark import (
    BookmarkGoal,
    BookmarkMoodTag,
    BookmarkRating,
    BookmarkReview,
    BookmarkRoutine,
    BookmarkRoutineCategory,
    BookmarkRoutineCheck,
    BookmarkRoutineMonthlyStat,
)
from schemas.bookmark import (
    BookmarkDayMetaUpdate,
    BookmarkGoalUpdate,
    BookmarkMoodTagCreate,
    BookmarkMoodTagReorder,
    BookmarkMoodTagUpdate,
    BookmarkRoutineCategoryCreate,
    BookmarkRoutineCategoryReorder,
    BookmarkRoutineCategoryUpdate,
    BookmarkRatingUpdate,
    BookmarkReviewUpdate,
    BookmarkRoutineCheckUpdate,
    BookmarkRoutineCreate,
    BookmarkRoutineReorder,
    BookmarkRoutineUpdate,
    BookmarkSpecialDateCreate,
    BookmarkSpecialDateUpdate,
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
QUARTER_START_MONTHS = {1, 4, 7, 10}
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
            BookmarkRoutine.calendar_only.is_(False),
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


def _resolve_mood_tag_id(
    db: Session,
    user_id: int,
    mood_tag_id: int | None,
) -> int | None:
    if mood_tag_id is None or mood_tag_id <= 0:
        return None
    tag = (
        db.query(BookmarkMoodTag)
        .filter(
            BookmarkMoodTag.id == mood_tag_id,
            BookmarkMoodTag.user_id == user_id,
        )
        .first()
    )
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기분 태그를 찾을 수 없습니다.",
        )
    return tag.id


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
    manual_done: bool = False,
    occurrences: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": routine.id,
        "title": routine.title,
        "notes": routine.notes,
        "category_id": routine.category_id,
        "category_name": routine.category.name if routine.category else None,
        "start_date": routine.start_date,
        "end_date": routine.end_date,
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
        "manual_done": manual_done,
        "occurrences": occurrences
        if occurrences is not None
        else [{"date": period_start, "done": completed_count > 0}],
    }


def _check_period_type(routine: BookmarkRoutine) -> str:
    if routine.frequency == "daily":
        return "day"
    if routine.tracking_mode == "count":
        return CHECK_PERIOD_BY_FREQUENCY[routine.frequency]
    if routine.frequency == "weekly":
        return "day"
    return CHECK_PERIOD_BY_FREQUENCY[routine.frequency]


def _period_end(period_type: str, period_start: date) -> date:
    if period_type == "day":
        return period_start
    if period_type == "week":
        return period_start + timedelta(days=6)
    if period_type == "month":
        return _month_end(period_start)
    if period_type == "quarter":
        return _shift_months(period_start, 3) - timedelta(days=1)
    return date(period_start.year, 12, 31)


def _in_routine_lifespan(routine: BookmarkRoutine, day: date) -> bool:
    return routine.start_date <= day and (
        routine.end_date is None or day <= routine.end_date
    )


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


# Re-export shared imports, constants and helpers to the other bookmark modules.
__all__ = [name for name in globals() if not name.startswith("__")]
