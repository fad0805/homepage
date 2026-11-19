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


def _first_count_window_start(
    frequency: str,
    tracking_mode: str,
    schedule: dict[str, Any],
    today: date,
) -> date:
    """Return today, or the next window start when it is still in the future."""
    if tracking_mode != "count":
        return today
    if frequency == "weekly":
        week_start = _week_start(today)
        start = week_start + timedelta(
            days=schedule.get("window_start") or 0
        )
        end = week_start + timedelta(
            days=(
                schedule.get("window_end")
                if schedule.get("window_end") is not None
                else 6
            )
        )
        if start > today:
            return start
        return start + timedelta(days=7) if today > end else today
    if frequency == "monthly":
        month = _month_start(today)
        end = _month_end(month)
        day = min(schedule.get("window_start") or 1, end.day)
        start = date(month.year, month.month, day)
        last = date(
            month.year,
            month.month,
            min(
                schedule.get("window_end")
                if schedule.get("window_end") is not None
                else end.day,
                end.day,
            ),
        )
        if start > today:
            return start
        if today > last:
            next_month = _shift_months(month, 1)
            next_end = _month_end(next_month)
            return date(
                next_month.year,
                next_month.month,
                min(schedule.get("window_start") or 1, next_end.day),
            )
        return today
    if frequency == "yearly":
        first = schedule.get("window_start") or 1
        last = (
            schedule.get("window_end")
            if schedule.get("window_end") is not None
            else 12
        )
        start = date(today.year, first, 1)
        end = _month_end(date(today.year, last, 1))
        if start > today:
            return start
        return date(today.year + 1, first, 1) if today > end else today
    return today


def _next_routine_date(
    routine: BookmarkRoutine,
    today: date,
) -> date | None:
    """Return the next date-mode occurrence on or after ``today``."""
    if routine.tracking_mode != "date":
        return None

    start = max(today, routine.start_date)
    if routine.end_date is not None and start > routine.end_date:
        return None

    if routine.frequency == "quarterly":
        quarter = _quarter_start(start)
        for _ in range(9):
            if (
                quarter >= routine.start_date
                and (routine.end_date is None or quarter <= routine.end_date)
                and (
                    routine.month is None
                    or quarter.month == routine.month
                )
            ):
                return quarter
            quarter = _shift_months(quarter, 3)
        return None

    for offset in range(0, 371):
        day = start + timedelta(days=offset)
        if routine.end_date is not None and day > routine.end_date:
            return None
        if not _in_routine_lifespan(routine, day):
            continue
        if _routine_due_on_day(routine, day):
            return day
    return None


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
    window_start: int | None = None,
    window_end: int | None = None,
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
        if frequency == "weekly":
            first = 0 if window_start is None else int(window_start)
            last = 6 if window_end is None else int(window_end)
            if not (0 <= first <= last <= 6):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="주간 시작·종료 요일을 확인해주세요.",
                )
        elif frequency == "monthly":
            first = 1 if window_start is None else int(window_start)
            last = 31 if window_end is None else int(window_end)
            if not (1 <= first <= last <= 31):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="월간 시작·종료 일을 확인해주세요.",
                )
        elif frequency == "yearly":
            first = 1 if window_start is None else int(window_start)
            last = 12 if window_end is None else int(window_end)
            if not (1 <= first <= last <= 12):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="연간 시작·종료 월을 확인해주세요.",
                )
        else:
            first = last = None
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
            "window_start": first,
            "window_end": last,
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
