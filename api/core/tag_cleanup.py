"""Periodic removal of tags that no content references."""

import asyncio
import logging

from crud.tags import prune_orphan_tags
from db.session import SessionLocal

logger = logging.getLogger("uvicorn.error")

CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60


async def tag_cleanup_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                prune_orphan_tags(db)
                db.commit()
        except Exception:
            logger.exception("Failed to prune orphan tags")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
