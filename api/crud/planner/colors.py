"""Planner colors."""

from .common import *  # noqa: F401,F403


def get_colors(db: Session, user_id: int) -> dict:
    colors = (
        db.query(PlannerColor)
        .filter(PlannerColor.user_id == user_id)
        .order_by(PlannerColor.position.asc(), PlannerColor.id.asc())
        .all()
    )
    return {"colors": [_serialize_color(color) for color in colors]}


def save_color(
    db: Session,
    color: str,
    user_id: int,
    name: str | None = None,
) -> dict:
    normalized = _clean_color(color)
    if normalized is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="색상을 입력해주세요.",
        )
    clean_name = _clean_color_name(name)
    existing = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.user_id == user_id,
            PlannerColor.color == normalized,
        )
        .first()
    )
    if existing is not None:
        if clean_name is not None and existing.name != clean_name:
            existing.name = clean_name
            db.commit()
            db.refresh(existing)
        return _serialize_color(existing)

    last = (
        db.query(PlannerColor.position)
        .filter(PlannerColor.user_id == user_id)
        .order_by(PlannerColor.position.desc(), PlannerColor.id.desc())
        .first()
    )
    next_position = (last[0] + 1) if last is not None else 0
    saved = PlannerColor(
        user_id=user_id,
        color=normalized,
        name=clean_name,
        position=next_position,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return _serialize_color(saved)


def reorder_colors(
    db: Session,
    payload: PlannerColorReorder,
    user_id: int,
) -> dict:
    colors = (
        db.query(PlannerColor)
        .filter(PlannerColor.user_id == user_id)
        .order_by(PlannerColor.position.asc(), PlannerColor.id.asc())
        .all()
    )
    by_id = {color.id: color for color in colors}
    ordered: list[PlannerColor] = []
    seen: set[int] = set()
    for color_id in payload.ids:
        color = by_id.get(color_id)
        if color is None or color.id in seen:
            continue
        ordered.append(color)
        seen.add(color.id)

    # A chip created in another tab may be missing from the request. Keep it
    # after the explicitly ordered chips instead of dropping it.
    ordered.extend(
        color for color in colors if color.id not in seen
    )
    for index, color in enumerate(ordered):
        color.position = index
    db.commit()
    return get_colors(db, user_id)


def update_color(
    db: Session,
    color_id: int,
    payload: PlannerColorUpdate,
    user_id: int,
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 내용이 없습니다.",
        )

    saved = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.id == color_id,
            PlannerColor.user_id == user_id,
        )
        .first()
    )
    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="색상 칩을 찾을 수 없습니다.",
        )

    if "color" in data:
        normalized = _clean_color(data["color"])
        if normalized is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="색상을 입력해주세요.",
            )
        if normalized != saved.color:
            duplicate = (
                db.query(PlannerColor)
                .filter(
                    PlannerColor.user_id == user_id,
                    PlannerColor.color == normalized,
                    PlannerColor.id != saved.id,
                )
                .first()
            )
            if duplicate is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="이미 사용 중인 색상입니다.",
                )
            saved.color = normalized

    if "name" in data:
        saved.name = _clean_color_name(data["name"])

    db.commit()
    db.refresh(saved)
    return _serialize_color(saved)


def delete_color(
    db: Session,
    color_id: int,
    user_id: int,
) -> dict:
    saved = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.id == color_id,
            PlannerColor.user_id == user_id,
        )
        .first()
    )
    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="색상 칩을 찾을 수 없습니다.",
        )

    deleted_tasks = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.color_id == color_id,
            PlannerTask.status == "trashed",
        )
        .delete(synchronize_session=False)
    )
    unassigned_tasks = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user_id,
            PlannerTask.color_id == color_id,
        )
        .update(
            {PlannerTask.color_id: None},
            synchronize_session=False,
        )
    )
    db.delete(saved)
    db.commit()
    return {
        "success": True,
        "unassigned_tasks": unassigned_tasks,
        "deleted_tasks": deleted_tasks,
    }
