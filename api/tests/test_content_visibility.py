import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.books import (
    get_book,
    get_books_page,
    get_chapter,
    get_chapters_page,
    set_book_category_visibility,
    set_book_visibility,
    set_chapter_visibility,
)
from crud.illustrations import (
    get_all_illustrations,
    get_visible_illustration,
    get_visible_illustrations,
    set_illustration_visibility,
)
from db.base import Base
from models.books import Book, BookCategory, Chapter
from models.illustrations import Illustration
from models.users import User


class ContentVisibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.user = User(username="author", hashed_password="x")
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        self.category = BookCategory(
            user_id=self.user.id,
            name="카테고리",
            visible=True,
            order=0,
        )
        self.db.add(self.category)
        self.db.commit()
        self.db.refresh(self.category)

        self.book = Book(
            user_id=self.user.id,
            title="책",
            category_id=self.category.id,
            visible=True,
            order=0,
        )
        self.db.add(self.book)
        self.db.commit()
        self.db.refresh(self.book)

        self.chapter = Chapter(
            user_id=self.user.id,
            book_id=self.book.id,
            title="글",
            body="<p>본문</p>",
            tags=[],
            visible=True,
            order=0,
        )
        self.db.add(self.chapter)
        self.db.commit()
        self.db.refresh(self.chapter)

        self.illustration = Illustration(
            user_id=self.user.id,
            title="삽화",
            visible=True,
            representative_url="/uploads/illustrations/a.png",
            order=0,
        )
        self.db.add(self.illustration)
        self.db.commit()
        self.db.refresh(self.illustration)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_admin_can_hide_book_but_owner_keeps_access(self) -> None:
        set_book_visibility(self.db, self.book.id, visible=False)

        public, _ = get_books_page(
            self.db,
            page=1,
            author_user_id=self.user.id,
        )
        owner = get_book(
            self.db,
            self.book.id,
            include_hidden=True,
            owner_user_id=self.user.id,
        )

        self.assertEqual(public, [])
        self.assertFalse(owner["visible"])

    def test_admin_can_hide_category_and_its_books_leave_public_list(
        self,
    ) -> None:
        set_book_category_visibility(
            self.db,
            self.category.id,
            visible=False,
        )

        public, _ = get_books_page(
            self.db,
            page=1,
            author_user_id=self.user.id,
        )

        self.assertEqual(public, [])

    def test_admin_can_hide_chapter_but_owner_keeps_access(self) -> None:
        set_chapter_visibility(self.db, self.chapter.id, visible=False)

        public, _ = get_chapters_page(
            self.db,
            page=1,
            author_user_id=self.user.id,
            book_id=self.book.id,
        )
        owner = get_chapter(
            self.db,
            self.chapter.id,
            include_hidden=True,
            owner_user_id=self.user.id,
        )

        self.assertEqual(public, [])
        self.assertFalse(owner["visible"])

    def test_admin_can_hide_illustration_but_owner_keeps_access(self) -> None:
        set_illustration_visibility(
            self.db,
            self.illustration.id,
            visible=False,
        )

        public, _ = get_visible_illustrations(
            self.db,
            author_user_id=self.user.id,
        )
        owner = get_visible_illustration(
            self.db,
            self.illustration.id,
            owner_user_id=self.user.id,
            include_hidden=True,
        )
        admin_rows, _ = get_all_illustrations(self.db, self.user.id)

        self.assertEqual(public, [])
        self.assertFalse(owner["visible"])
        self.assertEqual(
            [row["id"] for row in admin_rows],
            [self.illustration.id],
        )

    def test_admin_view_unlocks_protected_illustration(self) -> None:
        self.illustration.protected = True
        self.db.commit()

        rows, _ = get_visible_illustrations(
            self.db,
            author_user_id=self.user.id,
        )
        admin_rows, _ = get_visible_illustrations(
            self.db,
            author_user_id=self.user.id,
            admin_view=True,
        )

        self.assertTrue(rows[0]["locked"])
        self.assertFalse(admin_rows[0]["locked"])


if __name__ == "__main__":
    unittest.main()
