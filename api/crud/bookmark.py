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


def _check_period_start(frequency: str, day: date) -> date:
    if frequency == "daily":
        return day
    if frequency == "weekly":
        return _week_start(day)
    if frequency == "monthly":
        return _month_start(day)
    if frequency == "quarterly":
        return _quarter_start(day)
    return _year_start(day)


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


def _routine_period_dict(
    routine: BookmarkRoutine,
    *,
    period_type: str,
    period_start: date,
    completed_count: int,
) -> dict[str, Any]:
    return {
        "id": routine.id,
        "title": routine.title,
        "notes": routine.notes,
        "frequency": routine.frequency,
        "target_count": routine.target_count,
        "active": bool(routine.active),
        "position": routine.position,
        "created_at": routine.created_at,
        "updated_at": routine.updated_at,
        "period_type": period_type,
        "period_start": period_start,
        "completed_count": completed_count,
        "occurrences": [
            {
                "date": period_start,
                "done": completed_count > 0,
            }
        ],
    }


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
        expected_dates = [
            first + timedelta(days=offset)
            for offset in range(last.day)
            if (first + timedelta(days=offset)).weekday() == 0
        ]
        expected = target * len(expected_dates)
        completed = (
            db.query(func.coalesce(func.sum(BookmarkRoutineCheck.count), 0))
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

    if routine.frequency == "monthly":
        completed = _period_check_count(db, routine, "month", first)
        return completed, target

    if routine.frequency == "quarterly":
        if first.month not in (1, 4, 7, 10):
            return None
        quarter_start = date(first.year, first.month, 1)
        completed = _period_check_count(
            db,
            routine,
            "quarter",
            quarter_start,
        )
        return completed, target

    if first.month != 1:
        return None
    completed = _period_check_count(
        db,
        routine,
        "year",
        date(first.year, 1, 1),
    )
    return completed, target


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
        period_type = CHECK_PERIOD_BY_FREQUENCY[routine.frequency]
        period_start = _check_period_start(routine.frequency, target)
        entries.append(
            _routine_period_dict(
                routine,
                period_type=period_type,
                period_start=period_start,
                completed_count=_period_check_count(
                    db,
                    routine,
                    period_type,
                    period_start,
                ),
            )
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
        .filter(
            BookmarkRoutine.user_id == user_id,
            BookmarkRoutine.frequency == frequency,
            BookmarkRoutine.active.is_(True),
        )
        .order_by(BookmarkRoutine.position, BookmarkRoutine.id)
        .all()
    )
    entries = [
        _routine_period_dict(
            routine,
            period_type=period_type,
            period_start=period_start,
            completed_count=_period_check_count(
                db,
                routine,
                period_type,
                period_start,
            ),
        )
        for routine in routines
    ]
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
    target_count = 1 if payload.frequency == "daily" else payload.target_count
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
        target_count=target_count,
        active=True,
        position=(max_position or -1) + 1,
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
    if "target_count" in data:
        routine.target_count = (
            1
            if routine.frequency == "daily"
            else int(data["target_count"])
        )
        _upsert_routine_monthly_stat(
            db,
            routine,
            _month_start(_kst_today()),
        )

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

    expected_period = CHECK_PERIOD_BY_FREQUENCY[routine.frequency]
    if payload.period_type != expected_period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="루틴 주기와 기간 단위가 맞지 않습니다.",
        )
    target_count = max(1, int(routine.target_count or 1))
    if payload.count > target_count:
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
    if routine.frequency == "daily":
        start = _shift_months(current, -SHORT_RETENTION_MONTHS)
        done_dates = {
            row[0]
            for row in db.query(BookmarkRoutineCheck.period_start)
            .filter(
                BookmarkRoutineCheck.user_id == routine.user_id,
                BookmarkRoutineCheck.routine_id == routine.id,
                BookmarkRoutineCheck.period_type == "day",
                BookmarkRoutineCheck.done.is_(True),
                BookmarkRoutineCheck.period_start >= start,
                BookmarkRoutineCheck.period_start <= current,
            )
            .all()
        }
        day = start
        while day <= current:
            daily.append(
                {
                    "date": day,
                    "scheduled": True,
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
    """Keep detailed checks for the recent graph; preserve monthly stats."""
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
