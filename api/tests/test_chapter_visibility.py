import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.books import get_chapter, register_chapter_view
from db.base import Base
from models.books import Book, BookCategory, Chapter
from models.users import User


class ChapterVisibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.owner = User(username="owner", hashed_password="x")
        self.other = User(username="other", hashed_password="x")
        self.db.add_all([self.owner, self.other])
        self.db.commit()

        self.hidden_category = BookCategory(
            user_id=self.owner.id,
            name="숨김 카테고리",
            visible=False,
        )
        self.db.add(self.hidden_category)
        self.db.commit()

        self.book = Book(
            user_id=self.owner.id,
            title="숨김 카테고리의 책",
            category_id=self.hidden_category.id,
            visible=True,
        )
        self.db.add(self.book)
        self.db.commit()

        self.chapter = Chapter(
            user_id=self.owner.id,
            book_id=self.book.id,
            title="숨김 카테고리의 챕터",
            body="<p>비공개 본문</p>",
            tags=[],
            visible=True,
        )
        self.db.add(self.chapter)
        self.db.commit()
        self.db.refresh(self.chapter)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_hidden_category_chapter_is_not_public(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            get_chapter(self.db, self.chapter.id)
        self.assertEqual(raised.exception.status_code, 404)

        with self.assertRaises(HTTPException) as raised:
            get_chapter(
                self.db,
                self.chapter.id,
                include_hidden=True,
                viewer_user_id=self.other.id,
            )
        self.assertEqual(raised.exception.status_code, 404)

    def test_hidden_category_chapter_cannot_be_viewed_publicly(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            register_chapter_view(self.db, self.chapter.id, "ip-hash")
        self.assertEqual(raised.exception.status_code, 404)

    def test_owner_can_open_hidden_category_chapter(self) -> None:
        chapter = get_chapter(
            self.db,
            self.chapter.id,
            include_hidden=True,
            owner_user_id=self.owner.id,
        )

        self.assertEqual(chapter["id"], self.chapter.id)

    def test_admin_view_bypasses_hidden_category(self) -> None:
        chapter = get_chapter(
            self.db,
            self.chapter.id,
            include_hidden=True,
        )

        self.assertEqual(chapter["id"], self.chapter.id)


if __name__ == "__main__":
    unittest.main()
