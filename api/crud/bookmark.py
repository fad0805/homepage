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


def _routine_monthly_due_date(
    routine: BookmarkRoutine,
    month: date,
) -> date | None:
    if routine.day_of_month is not None:
        if _month_has_day(
            month.year,
            month.month,
            routine.day_of_month,
        ):
            return date(
                month.year,
                month.month,
                routine.day_of_month,
            )
        return None
    if routine.nth_week is not None and routine.weekday is not None:
        day = _nth_weekday_day(
            month.year,
            month.month,
            routine.nth_week,
            routine.weekday,
        )
        if day is not None:
            return date(month.year, month.month, day)
    return None


def _routine_monthly_due(routine: BookmarkRoutine, month: date) -> bool:
    return _routine_monthly_due_date(routine, month) is not None


def _routine_due_on_day(routine: BookmarkRoutine, day: date) -> bool:
    if routine.frequency == "once":
        return routine.start_date == day
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
    _upsert_routine_monthly_stat(db, routine, _month_start(_kst_today()))

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


def reorder_routine_categories(
    db: Session,
    payload: BookmarkRoutineCategoryReorder,
    user_id: int,
) -> list[BookmarkRoutineCategory]:
    ids = list(dict.fromkeys(payload.ids))
    if len(ids) != len(payload.ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="카테고리 순서가 올바르지 않습니다.",
        )

    categories = (
        db.query(BookmarkRoutineCategory)
        .filter(
            BookmarkRoutineCategory.user_id == user_id,
            BookmarkRoutineCategory.id.in_(ids),
        )
        .all()
    )
    if len(categories) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="루틴 카테고리를 찾을 수 없습니다.",
        )

    positions = {category_id: index for index, category_id in enumerate(ids)}
    for category in categories:
        category.position = positions[category.id]
    db.commit()
    return list_routine_categories(db, user_id)


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


def list_mood_tags(
    db: Session,
    user_id: int,
) -> list[BookmarkMoodTag]:
    return (
        db.query(BookmarkMoodTag)
        .filter(BookmarkMoodTag.user_id == user_id)
        .order_by(BookmarkMoodTag.position, BookmarkMoodTag.id)
        .all()
    )


def create_mood_tag(
    db: Session,
    payload: BookmarkMoodTagCreate,
    user_id: int,
) -> BookmarkMoodTag:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기분 태그 이름을 입력해주세요.",
        )
    exists = (
        db.query(BookmarkMoodTag.id)
        .filter(
            BookmarkMoodTag.user_id == user_id,
            BookmarkMoodTag.name == name,
        )
        .first()
    )
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 같은 이름의 기분 태그가 있습니다.",
        )
    max_position = (
        db.query(func.max(BookmarkMoodTag.position))
        .filter(BookmarkMoodTag.user_id == user_id)
        .scalar()
    )
    tag = BookmarkMoodTag(
        user_id=user_id,
        name=name,
        position=(max_position or -1) + 1,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def update_mood_tag(
    db: Session,
    tag_id: int,
    payload: BookmarkMoodTagUpdate,
    user_id: int,
) -> BookmarkMoodTag:
    tag = (
        db.query(BookmarkMoodTag)
        .filter(
            BookmarkMoodTag.id == tag_id,
            BookmarkMoodTag.user_id == user_id,
        )
        .first()
    )
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기분 태그를 찾을 수 없습니다.",
        )
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기분 태그 이름을 입력해주세요.",
        )
    duplicate = (
        db.query(BookmarkMoodTag.id)
        .filter(
            BookmarkMoodTag.user_id == user_id,
            BookmarkMoodTag.name == name,
            BookmarkMoodTag.id != tag.id,
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 같은 이름의 기분 태그가 있습니다.",
        )
    tag.name = name
    db.commit()
    db.refresh(tag)
    return tag


def reorder_mood_tags(
    db: Session,
    payload: BookmarkMoodTagReorder,
    user_id: int,
) -> list[BookmarkMoodTag]:
    ids = list(dict.fromkeys(payload.ids))
    if len(ids) != len(payload.ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기분 태그 순서가 올바르지 않습니다.",
        )
    tags = (
        db.query(BookmarkMoodTag)
        .filter(
            BookmarkMoodTag.user_id == user_id,
            BookmarkMoodTag.id.in_(ids),
        )
        .all()
    )
    if len(tags) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기분 태그를 찾을 수 없습니다.",
        )
    positions = {tag_id: index for index, tag_id in enumerate(ids)}
    for tag in tags:
        tag.position = positions[tag.id]
    db.commit()
    return list_mood_tags(db, user_id)


def delete_mood_tag(
    db: Session,
    tag_id: int,
    user_id: int,
) -> dict:
    tag = (
        db.query(BookmarkMoodTag)
        .filter(
            BookmarkMoodTag.id == tag_id,
            BookmarkMoodTag.user_id == user_id,
        )
        .first()
    )
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기분 태그를 찾을 수 없습니다.",
        )
    db.query(BookmarkGoal).filter(
        BookmarkGoal.user_id == user_id,
        BookmarkGoal.mood_tag_id == tag.id,
    ).update(
        {BookmarkGoal.mood_tag_id: None},
        synchronize_session=False,
    )
    db.delete(tag)
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


def save_day_meta(
    db: Session,
    payload: BookmarkDayMetaUpdate,
    user_id: int,
) -> BookmarkGoal:
    goal = (
        db.query(BookmarkGoal)
        .filter(
            BookmarkGoal.user_id == user_id,
            BookmarkGoal.period_type == "day",
            BookmarkGoal.period_start == payload.period_start,
        )
        .first()
    )
    mood_tag_id = _resolve_mood_tag_id(
        db,
        user_id,
        payload.mood_tag_id,
    )
    if goal is None:
        goal = BookmarkGoal(
            user_id=user_id,
            period_type="day",
            period_start=payload.period_start,
            content="",
            wake_time=payload.wake_time,
            mood_tag_id=mood_tag_id,
        )
        db.add(goal)
    else:
        goal.wake_time = payload.wake_time
        goal.mood_tag_id = mood_tag_id
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
