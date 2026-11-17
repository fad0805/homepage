"""Bookmark journal."""

from .common import *  # noqa: F401,F403


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
