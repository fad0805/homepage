"""Periodic removal of chapter images that are no longer used in content."""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

from core.image_urls import storage_reference
from core.uploads import delete_uploaded_file, iter_uploaded_files
from db.session import SessionLocal
from models.books import Chapter
from models.chapter_drafts import ChapterDraft
from models.manuscript import ManuscriptNode

logger = logging.getLogger("uvicorn.error")

CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60
# Uploads start before the editor content is saved. Keep new files long enough
# for a draft to be written before considering them orphaned.
ORPHAN_GRACE_SECONDS = 24 * 60 * 60
CHAPTER_FOLDER = "chapters"

_URL_RE = re.compile(r"(?:https?://|/uploads/)[^\s\"'<>()]+")
_KEY_RE = re.compile(r"(?<![A-Za-z0-9_/])images/chapters/[A-Za-z0-9_./-]+")


def _is_chapter_key(key: str | None) -> bool:
    if not key:
        return False
    parts = key.split("/")
    return len(parts) >= 2 and parts[-2] == CHAPTER_FOLDER


def _references_in_text(text: str) -> set[str]:
    keys: set[str] = set()
    for match in (*_URL_RE.findall(text), *_KEY_RE.findall(text)):
        candidate = match.rstrip(".,;")
        key = storage_reference(candidate)
        if _is_chapter_key(key):
            keys.add(key)
    return keys


def collect_referenced_chapter_keys(db) -> set[str]:
    """Return chapter image keys still referenced by saved content."""
    keys: set[str] = set()
    columns = (
        (Chapter, Chapter.body),
        (ChapterDraft, ChapterDraft.body),
        (ManuscriptNode, ManuscriptNode.body),
    )
    for model, column in columns:
        rows = db.query(column).filter(column.isnot(None)).all()
        for (value,) in rows:
            if value:
                keys.update(_references_in_text(str(value)))
    return keys


def prune_orphan_chapter_uploads(
    db,
    *,
    now: datetime | None = None,
    min_age_seconds: int = ORPHAN_GRACE_SECONDS,
) -> int:
    """Delete chapter uploads that no saved content references.

    Returns the number of files removed. Storage failures are swallowed inside
    :func:`delete_uploaded_file` so a single bad object cannot stop the sweep.
    """
    current = now or datetime.now(timezone.utc)
    cutoff = current - timedelta(seconds=min_age_seconds)
    referenced = collect_referenced_chapter_keys(db)

    deleted = 0
    for key, modified in iter_uploaded_files(CHAPTER_FOLDER):
        if modified is None or modified > cutoff:
            continue
        if key in referenced:
            continue
        delete_uploaded_file(key)
        deleted += 1
    return deleted


async def image_cleanup_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                deleted = prune_orphan_chapter_uploads(db)
            if deleted:
                logger.info("Deleted %s orphan chapter images", deleted)
        except Exception:
            logger.exception("Failed to prune orphan chapter images")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
