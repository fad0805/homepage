from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from crud.chapter_drafts import (
    delete_chapter_draft,
    get_chapter_draft,
    save_chapter_draft,
)
from db.session import get_db
from schemas.chapter_drafts import ChapterDraftRead, ChapterDraftSave

from .utils import require_auth

router = APIRouter()


@router.get("/{draft_key}", response_model=ChapterDraftRead | None)
def read_chapter_draft(
    draft_key: str,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Return the current user's chapter draft."""
    return get_chapter_draft(db, user.username, draft_key)


@router.put("/{draft_key}", response_model=ChapterDraftRead)
def write_chapter_draft(
    draft_key: str,
    payload: ChapterDraftSave,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Create or overwrite the current user's chapter draft."""
    return save_chapter_draft(db, user.username, draft_key, payload)


@router.delete("/{draft_key}")
def remove_chapter_draft(
    draft_key: str,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Delete the current user's chapter draft."""
    return delete_chapter_draft(db, user.username, draft_key)
