"""Planner search."""

from .common import *  # noqa: F401,F403
from .tasks import maintain_tasks


def search_planner(
    db: Session,
    user_id: int,
    *,
    start_date: date,
    end_date: date,
    query: str | None = None,
) -> dict:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="검색 종료일은 시작일보다 빠를 수 없습니다.",
        )
    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="한 번에 1년 범위까지만 검색할 수 있습니다.",
        )

    maintain_tasks(db, user_id)
    tokens = search_tokens(query)

    tasks_query = (
        db.query(PlannerTask)
        .options(selectinload(PlannerTask.color_relation))
        .filter(
            PlannerTask.user_id == user_id,
            or_(
                PlannerTask.start_date.is_(None),
                and_(
                    PlannerTask.start_date <= end_date,
                    PlannerTask.end_date >= start_date,
                ),
            ),
        )
    )
    if tokens:
        tasks_query = tasks_query.outerjoin(
            PlannerColor,
            PlannerTask.color_id == PlannerColor.id,
        )
        for token in tokens:
            pattern = like_pattern(token)
            tasks_query = tasks_query.filter(
                or_(
                    PlannerTask.title.ilike(pattern, escape="\\"),
                    PlannerTask.notes.ilike(pattern, escape="\\"),
                    PlannerColor.name.ilike(pattern, escape="\\"),
                    PlannerColor.color.ilike(pattern, escape="\\"),
                )
            )

    status_order = {"active": 0, "inactive": 1, "trashed": 2}
    tasks = tasks_query.all()
    tasks.sort(
        key=lambda task: (
            status_order.get(task.status, 9),
            task.start_date or date.max,
            task.id,
        )
    )

    start_utc = _kst_day_start_utc(start_date)
    end_utc = _kst_day_start_utc(end_date + timedelta(days=1))
    events_query = db.query(PlannerEvent).filter(
        PlannerEvent.owner_user_id == user_id,
        PlannerEvent.occurred_at >= start_utc,
        PlannerEvent.occurred_at < end_utc,
    )
    for token in tokens:
        pattern = like_pattern(token)
        events_query = events_query.filter(
            or_(
                PlannerEvent.title.ilike(pattern, escape="\\"),
                PlannerEvent.notes.ilike(pattern, escape="\\"),
                cast(PlannerEvent.changes, Text).ilike(
                    pattern,
                    escape="\\",
                ),
                PlannerEvent.entity_type.ilike(pattern, escape="\\"),
                PlannerEvent.action.ilike(pattern, escape="\\"),
            )
        )

    events = events_query.order_by(
        PlannerEvent.occurred_at.desc(),
        PlannerEvent.id.desc(),
    ).all()
    return {
        "tasks": [_serialize_task(task) for task in tasks],
        "events": [_serialize_event(event) for event in events],
    }
