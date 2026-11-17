"""Periodic removal of chapter drafts that have expired."""

import asyncio
import logging

from crud.chapter_drafts import prune_old_chapter_drafts
from db.session import SessionLocal

logger = logging.getLogger("uvicorn.error")

CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60


async def chapter_draft_cleanup_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                deleted = prune_old_chapter_drafts(db)
            if deleted:
                logger.info("Pruned %s old chapter drafts", deleted)
        except Exception:
            logger.exception("Failed to prune old chapter drafts")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
