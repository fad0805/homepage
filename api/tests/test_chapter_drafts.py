import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.chapter_drafts import (
    DRAFT_RETENTION_DAYS,
    prune_old_chapter_drafts,
)
from db.base import Base
from models.chapter_drafts import ChapterDraft


class ChapterDraftCleanupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _draft(
        self,
        key: str,
        *,
        created_at: datetime,
        updated_at: datetime,
    ) -> ChapterDraft:
        draft = ChapterDraft(
            owner="draft-owner",
            draft_key=key,
            title=key,
            tags=[],
            visible=True,
            pinned=False,
            created_at=created_at,
            updated_at=updated_at,
        )
        self.db.add(draft)
        self.db.commit()
        return draft

    def test_prune_deletes_drafts_older_than_retention_window(self) -> None:
        now = datetime(2026, 11, 17, 12, 0, 0)
        self._draft(
            "expired",
            created_at=now - timedelta(days=DRAFT_RETENTION_DAYS + 10),
            updated_at=now - timedelta(days=DRAFT_RETENTION_DAYS + 1),
        )
        self._draft(
            "recent",
            created_at=now - timedelta(days=2),
            updated_at=now - timedelta(days=2),
        )

        deleted = prune_old_chapter_drafts(self.db, now=now)

        self.assertEqual(deleted, 1)
        remaining = [draft.draft_key for draft in self.db.query(ChapterDraft)]
        self.assertEqual(remaining, ["recent"])

    def test_prune_keeps_draft_at_retention_boundary(self) -> None:
        now = datetime(2026, 11, 17, 12, 0, 0)
        self._draft(
            "boundary",
            created_at=now - timedelta(days=DRAFT_RETENTION_DAYS),
            updated_at=now - timedelta(days=DRAFT_RETENTION_DAYS),
        )

        deleted = prune_old_chapter_drafts(self.db, now=now)

        self.assertEqual(deleted, 0)
        self.assertEqual(self.db.query(ChapterDraft).count(), 1)

    def test_prune_uses_last_saved_time(self) -> None:
        now = datetime(2026, 11, 17, 12, 0, 0)
        self._draft(
            "edited-recently",
            created_at=now - timedelta(days=DRAFT_RETENTION_DAYS + 20),
            updated_at=now - timedelta(days=1),
        )

        deleted = prune_old_chapter_drafts(self.db, now=now)

        self.assertEqual(deleted, 0)
        self.assertEqual(self.db.query(ChapterDraft).count(), 1)

    def test_prune_accepts_timezone_aware_now(self) -> None:
        now = datetime(2026, 11, 17, 12, 0, 0, tzinfo=timezone.utc)
        self._draft(
            "expired",
            created_at=now.replace(tzinfo=None)
            - timedelta(days=DRAFT_RETENTION_DAYS + 1),
            updated_at=now.replace(tzinfo=None)
            - timedelta(days=DRAFT_RETENTION_DAYS + 1),
        )

        deleted = prune_old_chapter_drafts(self.db, now=now)

        self.assertEqual(deleted, 1)
