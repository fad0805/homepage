"""Bookmark journal."""

from .common import *  # noqa: F401,F403

JOURNAL_LEVELS = {"year", "quarter", "month", "week", "day"}
WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")
WEEK_ORDINALS = ("첫", "둘", "셋", "넷", "다섯")


def _week_group_date(week_start: date) -> date:
    """A week belongs to the month containing its Thursday."""
    return week_start + timedelta(days=3)


def _period_group_date(level: str, period_start: date) -> date:
    if level == "day":
        period_start -= timedelta(days=period_start.weekday())
    if level in {"week", "day"}:
        return _week_group_date(period_start)
    return period_start


def _journal_label(level: str, start: date) -> str:
    if level == "year":
        return f"{start.year}년"
    if level == "quarter":
        return f"{start.year}년 {((start.month - 1) // 3) + 1}분기"
    if level == "month":
        return f"{start.year}년 {start.month}월"
    if level == "week":
        thursday = _week_group_date(start)
        week = (thursday.day - 1) // 7 + 1
        ordinal = (
            WEEK_ORDINALS[week - 1]
            if week <= len(WEEK_ORDINALS)
            else str(week)
        )
        return f"{thursday.year}년 {thursday.month}월 {ordinal}째주"
    return (
        f"{start.year}년 {start.month}월 {start.day}일 "
        f"({WEEKDAYS[start.weekday()]})"
    )


def get_journal_tree(
    db: Session,
    user_id: int,
    *,
    decade_start: date | None = None,
) -> dict[str, Any]:
    anchor = decade_start or _kst_today()
    decade = (anchor.year // 10) * 10
    start = date(decade, 1, 1)
    end = date(decade + 9, 12, 31)
    query_start = start - timedelta(days=6)
    query_end = end + timedelta(days=6)

    goals = (
        db.query(BookmarkGoal)
        .options(selectinload(BookmarkGoal.mood_tag))
        .filter(
            BookmarkGoal.user_id == user_id,
            BookmarkGoal.period_type.in_(JOURNAL_LEVELS),
            BookmarkGoal.period_start >= query_start,
            BookmarkGoal.period_start <= query_end,
        )
        .all()
    )
    ratings = (
        db.query(BookmarkRating)
        .filter(
            BookmarkRating.user_id == user_id,
            BookmarkRating.period_type.in_(JOURNAL_LEVELS),
            BookmarkRating.period_start >= query_start,
            BookmarkRating.period_start <= query_end,
        )
        .all()
    )
    reviews = (
        db.query(BookmarkReview)
        .filter(
            BookmarkReview.user_id == user_id,
            BookmarkReview.period_type.in_(JOURNAL_LEVELS),
            BookmarkReview.period_start >= query_start,
            BookmarkReview.period_start <= query_end,
        )
        .all()
    )

    def in_decade(level: str, period_start: date) -> bool:
        return start <= _period_group_date(level, period_start) <= end

    goals_by_key = {
        (item.period_type, item.period_start): item
        for item in goals
        if in_decade(item.period_type, item.period_start)
    }
    ratings_by_key = {
        (item.period_type, item.period_start): item
        for item in ratings
        if in_decade(item.period_type, item.period_start)
    }
    reviews_by_key = {
        (item.period_type, item.period_start): item
        for item in reviews
        if in_decade(item.period_type, item.period_start)
    }

    nodes: dict[tuple[str, date], dict[str, Any]] = {}

    def ensure(level: str, period_start: date) -> dict[str, Any]:
        key = (level, period_start)
        node = nodes.get(key)
        if node is None:
            node = {
                "level": level,
                "period_start": period_start,
                "period_end": _period_end(level, period_start),
                "label": _journal_label(level, period_start),
                "goal": None,
                "rating": None,
                "review": None,
                "children": {},
            }
            nodes[key] = node
        return node

    def link(parent: dict[str, Any], child: dict[str, Any]) -> None:
        parent["children"][
            (child["level"], child["period_start"])
        ] = child

    def ensure_chain(level: str, period_start: date) -> dict[str, Any]:
        if level == "year":
            return ensure("year", date(period_start.year, 1, 1))
        if level == "quarter":
            quarter_start = date(
                period_start.year,
                ((period_start.month - 1) // 3) * 3 + 1,
                1,
            )
            quarter = ensure("quarter", quarter_start)
            link(
                ensure("year", date(period_start.year, 1, 1)),
                quarter,
            )
            return quarter
        if level == "week":
            week_start = period_start
            group_date = _week_group_date(week_start)
            quarter_start = date(
                group_date.year,
                ((group_date.month - 1) // 3) * 3 + 1,
                1,
            )
            quarter = ensure("quarter", quarter_start)
            month = ensure(
                "month",
                date(group_date.year, group_date.month, 1),
            )
            week = ensure("week", week_start)
            link(
                ensure("year", date(group_date.year, 1, 1)),
                quarter,
            )
            link(quarter, month)
            link(month, week)
            return week
        if level == "month":
            quarter_start = date(
                period_start.year,
                ((period_start.month - 1) // 3) * 3 + 1,
                1,
            )
            quarter = ensure("quarter", quarter_start)
            month = ensure("month", period_start)
            link(ensure("year", date(period_start.year, 1, 1)), quarter)
            link(quarter, month)
            return month
        # A day belongs to the week that starts on its Monday.
        week_start = period_start - timedelta(
            days=period_start.weekday()
        )
        group_date = _week_group_date(week_start)
        quarter_start = date(
            group_date.year,
            ((group_date.month - 1) // 3) * 3 + 1,
            1,
        )
        quarter = ensure("quarter", quarter_start)
        month = ensure(
            "month",
            date(group_date.year, group_date.month, 1),
        )
        week = ensure("week", week_start)
        day = ensure("day", period_start)
        link(
            ensure("year", date(group_date.year, 1, 1)),
            quarter,
        )
        link(quarter, month)
        link(month, week)
        link(week, day)
        return day

    for level, period_start in (
        set(goals_by_key)
        | set(ratings_by_key)
        | set(reviews_by_key)
    ):
        node = ensure_chain(level, period_start)
        node["goal"] = goals_by_key.get((level, period_start))
        node["rating"] = ratings_by_key.get((level, period_start))
        node["review"] = reviews_by_key.get((level, period_start))

    def has_record(node: dict[str, Any]) -> bool:
        goal = node["goal"]
        review = node["review"]
        return bool(
            (goal is not None and goal.content.strip())
            or (
                goal is not None
                and (
                    goal.wake_time is not None
                    or goal.mood_tag_id is not None
                )
            )
            or node["rating"] is not None
            or (review is not None and review.content.strip())
        )

    def prune(node: dict[str, Any]) -> dict[str, Any] | None:
        children = [
            child
            for child in (prune(item) for item in node["children"].values())
            if child is not None
        ]
        if not has_record(node) and not children:
            return None
        node["children"] = {
            (child["level"], child["period_start"]): child
            for child in children
        }
        return node

    def aggregate(
        node: dict[str, Any],
    ) -> tuple[int, int, int, int, int]:
        goal_count = (
            1
            if node["goal"] is not None
            and node["goal"].content.strip()
            else 0
        )
        review_count = (
            1
            if node["review"] is not None
            and node["review"].content.strip()
            else 0
        )
        rating_count = 1 if node["rating"] else 0
        rating_sum = node["rating"].rating if node["rating"] else 0
        for child in node["children"].values():
            (
                child_goals,
                child_reviews,
                child_ratings,
                child_rating_sum,
                _child_total,
            ) = aggregate(child)
            goal_count += child_goals
            review_count += child_reviews
            rating_count += child_ratings
            rating_sum += child_rating_sum
        node["goal_count"] = goal_count
        node["review_count"] = review_count
        node["rating_count"] = rating_count
        node["average_rating"] = (
            round(rating_sum / rating_count, 2)
            if rating_count
            else None
        )
        return (
            goal_count,
            review_count,
            rating_count,
            rating_sum,
            len(node["children"]),
        )

    def finalize(node: dict[str, Any]) -> dict[str, Any]:
        return {
            **node,
            "children": [
                finalize(child)
                for child in sorted(
                    node["children"].values(),
                    key=lambda item: item["period_start"],
                )
            ],
        }

    years = []
    for node in nodes.values():
        if node["level"] == "year":
            pruned = prune(node)
            if pruned is not None:
                aggregate(pruned)
                years.append(finalize(pruned))
    years.sort(key=lambda item: item["period_start"])
    return {
        "decade_start": start,
        "decade_end": end,
        "label": f"{decade}년대",
        "years": years,
    }


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
