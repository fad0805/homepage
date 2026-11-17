"""Normalized content tags and autocomplete helpers."""

from sqlalchemy.orm import Session

from core.search import like_pattern
from models.tags import ChapterTag, IllustrationTag, Tag


def _clean_names(tags: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in tags or []:
        value = raw.strip()[:255]
        key = value.lower()
        if value and key not in seen:
            seen.add(key)
            cleaned.append(value)
    return cleaned[:20]


def _ensure_tags(
    db: Session,
    user_id: int,
    names: list[str],
) -> list[Tag]:
    if not names:
        return []
    normalized = [name.lower() for name in names]
    existing = {
        tag.normalized_name: tag
        for tag in (
            db.query(Tag)
            .filter(
                Tag.user_id == user_id,
                Tag.normalized_name.in_(normalized),
            )
            .all()
        )
    }
    for name in names:
        key = name.lower()
        if key in existing:
            continue
        tag = Tag(
            user_id=user_id,
            name=name,
            normalized_name=key,
        )
        db.add(tag)
        existing[key] = tag
    db.flush()
    return [existing[name.lower()] for name in names]


def prune_orphan_tags(
    db: Session,
    user_id: int | None = None,
) -> int:
    used = db.query(ChapterTag.tag_id).union(
        db.query(IllustrationTag.tag_id)
    )
    query = db.query(Tag).filter(~Tag.id.in_(used))
    if user_id is not None:
        query = query.filter(Tag.user_id == user_id)
    return query.delete(synchronize_session=False)


def sync_chapter_tags(db: Session, chapter) -> None:
    db.query(ChapterTag).filter(
        ChapterTag.chapter_id == chapter.id
    ).delete(synchronize_session=False)
    tags = _ensure_tags(db, chapter.user_id, _clean_names(chapter.tags))
    db.add_all(
        [
            ChapterTag(chapter_id=chapter.id, tag_id=tag.id)
            for tag in tags
        ]
    )
    db.flush()
    prune_orphan_tags(db, chapter.user_id)


def sync_illustration_tags(db: Session, illustration) -> None:
    db.query(IllustrationTag).filter(
        IllustrationTag.illustration_id == illustration.id
    ).delete(synchronize_session=False)
    tags = _ensure_tags(
        db,
        illustration.user_id,
        _clean_names(illustration.tags),
    )
    db.add_all(
        [
            IllustrationTag(
                illustration_id=illustration.id,
                tag_id=tag.id,
            )
            for tag in tags
        ]
    )
    db.flush()
    prune_orphan_tags(db, illustration.user_id)


def list_tag_names(
    db: Session,
    user_id: int,
    query: str,
    *,
    limit: int = 10,
) -> list[str]:
    value = query.strip()
    if not value:
        return []
    rows = (
        db.query(Tag.name)
        .filter(
            Tag.user_id == user_id,
            Tag.normalized_name.ilike(
                like_pattern(value.lower()),
                escape="\\",
            ),
        )
        .order_by(Tag.name)
        .limit(limit)
        .all()
    )
    return [row[0] for row in rows]
