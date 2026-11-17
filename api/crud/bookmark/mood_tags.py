"""Bookmark mood tags."""

from .common import *  # noqa: F401,F403


def list_mood_tags(
    db: Session,
    user_id: int,
) -> list[BookmarkMoodTag]:
    return (
        db.query(BookmarkMoodTag)
        .filter(BookmarkMoodTag.user_id == user_id)
        .order_by(BookmarkMoodTag.position, BookmarkMoodTag.id)
        .all()
    )


def create_mood_tag(
    db: Session,
    payload: BookmarkMoodTagCreate,
    user_id: int,
) -> BookmarkMoodTag:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기분 태그 이름을 입력해주세요.",
        )
    exists = (
        db.query(BookmarkMoodTag.id)
        .filter(
            BookmarkMoodTag.user_id == user_id,
            BookmarkMoodTag.name == name,
        )
        .first()
    )
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 같은 이름의 기분 태그가 있습니다.",
        )
    max_position = (
        db.query(func.max(BookmarkMoodTag.position))
        .filter(BookmarkMoodTag.user_id == user_id)
        .scalar()
    )
    tag = BookmarkMoodTag(
        user_id=user_id,
        name=name,
        position=(max_position or -1) + 1,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def update_mood_tag(
    db: Session,
    tag_id: int,
    payload: BookmarkMoodTagUpdate,
    user_id: int,
) -> BookmarkMoodTag:
    tag = (
        db.query(BookmarkMoodTag)
        .filter(
            BookmarkMoodTag.id == tag_id,
            BookmarkMoodTag.user_id == user_id,
        )
        .first()
    )
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기분 태그를 찾을 수 없습니다.",
        )
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기분 태그 이름을 입력해주세요.",
        )
    duplicate = (
        db.query(BookmarkMoodTag.id)
        .filter(
            BookmarkMoodTag.user_id == user_id,
            BookmarkMoodTag.name == name,
            BookmarkMoodTag.id != tag.id,
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 같은 이름의 기분 태그가 있습니다.",
        )
    tag.name = name
    db.commit()
    db.refresh(tag)
    return tag


def reorder_mood_tags(
    db: Session,
    payload: BookmarkMoodTagReorder,
    user_id: int,
) -> list[BookmarkMoodTag]:
    ids = list(dict.fromkeys(payload.ids))
    if len(ids) != len(payload.ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기분 태그 순서가 올바르지 않습니다.",
        )
    tags = (
        db.query(BookmarkMoodTag)
        .filter(
            BookmarkMoodTag.user_id == user_id,
            BookmarkMoodTag.id.in_(ids),
        )
        .all()
    )
    if len(tags) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기분 태그를 찾을 수 없습니다.",
        )
    positions = {tag_id: index for index, tag_id in enumerate(ids)}
    for tag in tags:
        tag.position = positions[tag.id]
    db.commit()
    return list_mood_tags(db, user_id)


def delete_mood_tag(
    db: Session,
    tag_id: int,
    user_id: int,
) -> dict:
    tag = (
        db.query(BookmarkMoodTag)
        .filter(
            BookmarkMoodTag.id == tag_id,
            BookmarkMoodTag.user_id == user_id,
        )
        .first()
    )
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="기분 태그를 찾을 수 없습니다.",
        )
    db.query(BookmarkGoal).filter(
        BookmarkGoal.user_id == user_id,
        BookmarkGoal.mood_tag_id == tag.id,
    ).update(
        {BookmarkGoal.mood_tag_id: None},
        synchronize_session=False,
    )
    db.delete(tag)
    db.commit()
    return {"success": True}
