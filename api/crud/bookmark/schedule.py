"""Bookmark schedule."""

from .common import *  # noqa: F401,F403


def _quarter_start_month(value: int | None) -> int | None:
    if value is None:
        return None
    if value not in QUARTER_START_MONTHS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="분기를 선택해주세요.",
        )
    return value


def _quarter_matches(routine: BookmarkRoutine, day: date) -> bool:
    if routine.frequency != "quarterly" or routine.month is None:
        return True
    return _quarter_start(day).month == routine.month


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
            "month": (
                _quarter_start_month(month)
                if frequency == "quarterly"
                else None
            ),
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
            "month": _quarter_start_month(month),
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
