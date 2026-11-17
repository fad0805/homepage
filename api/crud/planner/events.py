"""Planner events."""

from .common import *  # noqa: F401,F403
from .tasks import maintain_tasks


def create_completed_record(
    db: Session,
    payload: PlannerCompletedCreate,
    user_id: int,
) -> dict:
    """Backfill a past schedule directly as a completion history entry."""
    title = _clean_title(payload.title)
    notes = _clean_notes(payload.notes)
    if payload.completed_on >= kst_today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="완료 기록은 과거 날짜로만 만들 수 있습니다.",
        )

    actor_id = get_audit_actor() or user_id
    # Noon KST keeps the entry safely on the intended calendar date.
    occurred_at = (
        _kst_day_start_utc(payload.completed_on) + timedelta(hours=12)
    )
    event = PlannerEvent(
        owner_user_id=user_id,
        actor_user_id=actor_id,
        entity_type="task",
        entity_id=None,
        action="completed",
        title=title,
        notes=notes,
        changes=None,
        occurred_at=occurred_at,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _serialize_event(event)


def get_events(
    db: Session,
    user_id: int,
    *,
    start_date: date,
    end_date: date,
) -> dict:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="조회 종료일은 시작일보다 빠를 수 없습니다.",
        )
    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="한 번에 1년까지만 조회할 수 있습니다.",
        )

    maintain_tasks(db, user_id)
    start_utc = _kst_day_start_utc(start_date)
    end_utc = _kst_day_start_utc(end_date + timedelta(days=1))
    events = (
        db.query(PlannerEvent)
        .filter(
            PlannerEvent.owner_user_id == user_id,
            PlannerEvent.occurred_at >= start_utc,
            PlannerEvent.occurred_at < end_utc,
        )
        .order_by(PlannerEvent.occurred_at.desc(), PlannerEvent.id.desc())
        .all()
    )
    return {"events": [_serialize_event(event) for event in events]}
