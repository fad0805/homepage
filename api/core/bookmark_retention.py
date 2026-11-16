import asyncio
import logging

from crud.bookmark import prune_old_routine_checks
from db.session import SessionLocal

logger = logging.getLogger("uvicorn.error")
RETENTION_INTERVAL_SECONDS = 24 * 60 * 60


def _prune_once() -> int:
    with SessionLocal() as db:
        return prune_old_routine_checks(db)


async def bookmark_retention_loop() -> None:
    """Prune old detailed checks while keeping monthly aggregates."""
    while True:
        try:
            deleted = await asyncio.to_thread(_prune_once)
            if deleted:
                logger.info("Pruned %s old bookmark routine checks", deleted)
        except Exception:
            logger.exception("Bookmark retention cleanup failed")
        await asyncio.sleep(RETENTION_INTERVAL_SECONDS)
