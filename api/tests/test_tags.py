import os
import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("ENVIRONMENT", "development")

from crud.tags import (
    list_tag_names,
    prune_orphan_tags,
    sync_chapter_tags,
    sync_illustration_tags,
)
from db.base import Base
from models.books import Book, Chapter  # noqa: F401
from models.illustrations import Illustration  # noqa: F401
from models.tags import ChapterTag, IllustrationTag, Tag
from models.users import User


class TagTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        user = User(
            username="tag-user",
            hashed_password="x",
            role="user",
        )
        self.db.add(user)
        self.db.commit()
        self.user_id = user.id

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_tags_are_case_insensitive_and_individual(self) -> None:
        chapter = SimpleNamespace(
            id=1,
            user_id=self.user_id,
            tags=["Sea", "sea", "SEA", "밤", " 밤 "],
        )
        sync_chapter_tags(self.db, chapter)
        self.db.commit()

        names = {tag.name for tag in self.db.query(Tag).all()}
        self.assertEqual(names, {"Sea", "밤"})
        self.assertEqual(
            self.db.query(ChapterTag).count(),
            2,
        )
        self.assertEqual(list_tag_names(self.db, self.user_id, "s"), ["Sea"])
        self.assertEqual(
            list_tag_names(self.db, self.user_id, "SEA"),
            ["Sea"],
        )

    def test_unused_tags_are_pruned(self) -> None:
        chapter = SimpleNamespace(
            id=1,
            user_id=self.user_id,
            tags=["Sea", "밤"],
        )
        sync_chapter_tags(self.db, chapter)
        self.db.commit()

        chapter.tags = ["night"]
        sync_chapter_tags(self.db, chapter)
        self.db.commit()

        names = {tag.name for tag in self.db.query(Tag).all()}
        self.assertEqual(names, {"night"})

    def test_tag_shared_between_chapter_and_illustration(self) -> None:
        chapter = SimpleNamespace(
            id=1,
            user_id=self.user_id,
            tags=["shared"],
        )
        illustration = SimpleNamespace(
            id=1,
            user_id=self.user_id,
            tags=["SHARED"],
        )
        sync_chapter_tags(self.db, chapter)
        sync_illustration_tags(self.db, illustration)
        self.db.commit()
        self.assertEqual(self.db.query(Tag).count(), 1)

        self.db.query(ChapterTag).delete()
        self.db.commit()
        prune_orphan_tags(self.db)
        self.db.commit()

        self.assertEqual(self.db.query(Tag).count(), 1)
        self.assertEqual(self.db.query(IllustrationTag).count(), 1)


if __name__ == "__main__":
    unittest.main()
