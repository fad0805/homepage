import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.image_cleanup import prune_orphan_chapter_uploads
from db.base import Base
from models.books import Chapter
from models.chapter_drafts import ChapterDraft
from models.illustrations import Illustration  # noqa: F401 - registers FK target
from models.manuscript import ManuscriptNode


class ImageCleanupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "chapters").mkdir()
        (self.root / "illustrations").mkdir()

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        patcher = mock.patch("core.uploads.UPLOAD_DIR", self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _file(self, folder: str, name: str, *, age_seconds: int = 7200) -> Path:
        path = self.root / folder / name
        path.write_bytes(b"image")
        old = time.time() - age_seconds
        os.utime(path, (old, old))
        return path

    def _chapter(self, body: str) -> None:
        self.db.add(
            Chapter(
                user_id=1,
                book_id=1,
                title="chapter",
                body=body,
                tags=[],
            )
        )

    def test_prune_deletes_only_old_unreferenced_chapter_images(self) -> None:
        kept = self._file("chapters", "kept.webp")
        kept_draft = self._file("chapters", "kept-draft.webp")
        kept_manuscript = self._file("chapters", "kept-manuscript.webp")
        orphan = self._file("chapters", "orphan.webp")
        recent = self._file("chapters", "recent.webp", age_seconds=10)

        self._chapter(f'<img src="/uploads/chapters/{kept.name}">')
        self.db.add(
            ChapterDraft(
                owner="owner",
                draft_key="draft",
                title="draft",
                body=f'<img src="/uploads/chapters/{kept_draft.name}">',
                tags=[],
            )
        )
        self.db.add(
            ManuscriptNode(
                project_id=1,
                user_id=1,
                node_type="chapter",
                title="node",
                body=f'<img src="images/chapters/{kept_manuscript.name}">',
            )
        )
        self.db.commit()

        deleted = prune_orphan_chapter_uploads(
            self.db,
            now=datetime.now(timezone.utc),
            min_age_seconds=60,
        )

        self.assertEqual(deleted, 1)
        self.assertTrue(kept.exists())
        self.assertTrue(kept_draft.exists())
        self.assertTrue(kept_manuscript.exists())
        self.assertFalse(orphan.exists())
        self.assertTrue(recent.exists())

    def test_prune_leaves_other_upload_folders_alone(self) -> None:
        illustration = self._file("illustrations", "cover.webp")
        self.db.commit()

        deleted = prune_orphan_chapter_uploads(
            self.db,
            now=datetime.now(timezone.utc) + timedelta(days=2),
        )

        self.assertEqual(deleted, 0)
        self.assertTrue(illustration.exists())
