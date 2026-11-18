"""Periodic removal of manuscript nodes that spent 30 days in the trash."""

import asyncio
import logging

from crud.manuscript import purge_expired, TRASH_RETENTION_DAYS
from db.session import SessionLocal

logger = logging.getLogger("uvicorn.error")

CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60


async def manuscript_trash_cleanup_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                deleted = purge_expired(db, retention_days=TRASH_RETENTION_DAYS)
            if deleted:
                logger.info("Purged %s expired manuscript nodes", deleted)
        except Exception:
            logger.exception("Failed to purge manuscript trash")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
