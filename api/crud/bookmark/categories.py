"""Bookmark categories."""

from .common import *  # noqa: F401,F403


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
