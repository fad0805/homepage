import calendar
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.bookmark import (
    BookmarkGoal,
    BookmarkReview,
    BookmarkRoutine,
    BookmarkRoutineCheck,
)
from schemas.bookmark import (
    BookmarkGoalCreate,
    BookmarkGoalUpdate,
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
FREQUENCIES = set(PERIOD_FREQUENCY.values())


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
    day_of_month: int | None,
    nth_week: int | None,
    month: int | None,
) -> dict[str, int | None]:
    if frequency not in FREQUENCIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="지원하지 않는 반복 주기입니다.",
        )
    if frequency == "daily":
        return {
            "weekday": None,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if frequency == "weekly":
        if weekday is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="매주 반복할 요일을 선택해주세요.",
            )
        return {
            "weekday": weekday,
            "day_of_month": None,
            "nth_week": None,
            "month": None,
        }
    if frequency == "monthly":
        if day_of_month is not None:
            return {
                "weekday": None,
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
            "day_of_month": None,
            "nth_week": nth_week,
            "month": None,
        }
    if frequency == "quarterly":
        return {
            "weekday": None,
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
        "day_of_month": day_of_month,
        "nth_week": None,
        "month": month,
    }


def _routine_due(routine: BookmarkRoutine, period_start: date) -> bool:
    year = period_start.year
    month = period_start.month
    if routine.frequency == "monthly":
        if routine.day_of_month is not None:
            return _month_has_day(year, month, routine.day_of_month)
        if routine.nth_week is not None and routine.weekday is not None:
            return (
                _nth_weekday_day(
                    year,
                    month,
                    routine.nth_week,
                    routine.weekday,
                )
                is not None
            )
        return False
    if routine.frequency == "yearly":
        if routine.month is None or routine.day_of_month is None:
            return False
        return _month_has_day(year, routine.month, routine.day_of_month)
    return True


def _routine_period_dict(
    routine: BookmarkRoutine,
    *,
    done: bool,
    period_type: str,
    period_start: date,
) -> dict:
    return {
        "id": routine.id,
        "title": routine.title,
        "notes": routine.notes,
        "frequency": routine.frequency,
        "weekday": routine.weekday,
        "day_of_month": routine.day_of_month,
        "nth_week": routine.nth_week,
        "month": routine.month,
        "active": bool(routine.active),
        "position": routine.position,
        "created_at": routine.created_at,
        "updated_at": routine.updated_at,
        "done": done,
        "period_type": period_type,
        "period_start": period_start,
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


def _get_goal_or_404(
    db: Session,
    goal_id: int,
    user_id: int,
) -> BookmarkGoal:
    goal = (
        db.query(BookmarkGoal)
        .filter(
            BookmarkGoal.id == goal_id,
            BookmarkGoal.user_id == user_id,
        )
        .first()
    )
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="책갈피 목표를 찾을 수 없습니다.",
        )
    return goal


def get_period(
    db: Session,
    user_id: int,
    *,
    period_type: str,
    period_start: date,
) -> dict:
    _validate_period(period_type, period_start)
    frequency = PERIOD_FREQUENCY[period_type]
    routines = (
        db.query(BookmarkRoutine)
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.frequency == frequency,
            BookmarkRoutine.active.is_(True),
        )
        .order_by(BookmarkRoutine.position, BookmarkRoutine.id)
        .all()
    )
    routines = [
        routine
        for routine in routines
        if _routine_due(routine, period_start)
    ]
    routine_ids = [routine.id for routine in routines]
    checks = {}
    if routine_ids:
        checks = {
            check.routine_id: bool(check.done)
            for check in db.query(BookmarkRoutineCheck)
            .filter(
                BookmarkRoutineCheck.user_id == user_id,
                BookmarkRoutineCheck.routine_id.in_(routine_ids),
                BookmarkRoutineCheck.period_type == period_type,
                BookmarkRoutineCheck.period_start == period_start,
            )
            .all()
        }
    goals = (
        db.query(BookmarkGoal)
        .filter(
            BookmarkGoal.user_id == user_id,
            BookmarkGoal.period_type == period_type,
            BookmarkGoal.period_start == period_start,
        )
        .order_by(BookmarkGoal.position, BookmarkGoal.id)
        .all()
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
                done=checks.get(routine.id, False),
                period_type=period_type,
                period_start=period_start,
            )
            for routine in routines
        ],
        "goals": goals,
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
    if "notes" in data:
        routine.notes = _clean_notes(data["notes"])
    if "active" in data:
        routine.active = bool(data["active"])

    schedule_fields = {"weekday", "day_of_month", "nth_week", "month"}
    if schedule_fields.intersection(data):
        schedule = _validate_schedule(
            routine.frequency,
            weekday=data.get("weekday", routine.weekday),
            day_of_month=data.get(
                "day_of_month",
                routine.day_of_month,
            ),
            nth_week=data.get("nth_week", routine.nth_week),
            month=data.get("month", routine.month),
        )
        routine.weekday = schedule["weekday"]
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
) -> dict:
    routine = _get_routine_or_404(db, routine_id, user_id)
    _validate_period(payload.period_type, payload.period_start)
    if PERIOD_FREQUENCY[payload.period_type] != routine.frequency:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="루틴 주기와 기간 단위가 맞지 않습니다.",
        )
    if not _routine_due(routine, payload.period_start):
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
    db.commit()
    db.refresh(check)
    return _routine_period_dict(
        routine,
        done=check.done,
        period_type=payload.period_type,
        period_start=payload.period_start,
    )


def create_goal(
    db: Session,
    payload: BookmarkGoalCreate,
    user_id: int,
) -> BookmarkGoal:
    _validate_period(payload.period_type, payload.period_start)
    max_position = (
        db.query(func.max(BookmarkGoal.position))
        .filter(
            BookmarkGoal.user_id == user_id,
            BookmarkGoal.period_type == payload.period_type,
            BookmarkGoal.period_start == payload.period_start,
        )
        .scalar()
    )
    goal = BookmarkGoal(
        user_id=user_id,
        period_type=payload.period_type,
        period_start=payload.period_start,
        title=_clean_title(payload.title),
        notes=_clean_notes(payload.notes),
        done=bool(payload.done),
        position=(max_position or -1) + 1,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def update_goal(
    db: Session,
    goal_id: int,
    payload: BookmarkGoalUpdate,
    user_id: int,
) -> BookmarkGoal:
    goal = _get_goal_or_404(db, goal_id, user_id)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        goal.title = _clean_title(data["title"])
    if "notes" in data:
        goal.notes = _clean_notes(data["notes"])
    if "done" in data:
        goal.done = bool(data["done"])
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, goal_id: int, user_id: int) -> dict:
    goal = _get_goal_or_404(db, goal_id, user_id)
    db.delete(goal)
    db.commit()
    return {"success": True}


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
