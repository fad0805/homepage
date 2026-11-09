from datetime import timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.chapter_drafts import ChapterDraft
from schemas.chapter_drafts import ChapterDraftSave


MAX_DRAFT_KEY_LENGTH = 120


def _clean_tags(tags: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    for tag in tags or []:
        value = tag.strip()
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned[:20]


def _normalize_key(draft_key: str) -> str:
    key = (draft_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="임시저장 키가 필요합니다.",
        )
    if len(key) > MAX_DRAFT_KEY_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="임시저장 키가 너무 깁니다.",
        )
    return key


def get_chapter_draft(db: Session, owner: str, draft_key: str):
    """Return the current user's draft for the given key, if any."""
    key = _normalize_key(draft_key)
    return (
        db.query(ChapterDraft)
        .filter(
            ChapterDraft.owner == owner,
            ChapterDraft.draft_key == key,
        )
        .first()
    )


def save_chapter_draft(
    db: Session,
    owner: str,
    draft_key: str,
    payload: ChapterDraftSave,
):
    """Create or overwrite the current user's draft."""
    key = _normalize_key(draft_key)
    draft = (
        db.query(ChapterDraft)
        .filter(
            ChapterDraft.owner == owner,
            ChapterDraft.draft_key == key,
        )
        .first()
    )
    if draft is None:
        draft = ChapterDraft(owner=owner, draft_key=key)
        db.add(draft)

    data = payload.model_dump()
    data["tags"] = _clean_tags(data.get("tags"))
    published_at = data.get("published_at")
    if published_at is not None and published_at.tzinfo is not None:
        data["published_at"] = published_at.astimezone(
            timezone.utc
        ).replace(tzinfo=None)

    for field, value in data.items():
        setattr(draft, field, value)

    db.commit()
    db.refresh(draft)
    return draft


def delete_chapter_draft(db: Session, owner: str, draft_key: str):
    """Delete the current user's draft if it exists."""
    key = _normalize_key(draft_key)
    draft = (
        db.query(ChapterDraft)
        .filter(
            ChapterDraft.owner == owner,
            ChapterDraft.draft_key == key,
        )
        .first()
    )
    if draft is not None:
        db.delete(draft)
        db.commit()
    return True
