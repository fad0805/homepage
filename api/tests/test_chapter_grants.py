import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.books import get_chapter
from db.base import Base
from models.books import Book, BookCategory, Chapter
from models.users import User


class ChapterGrantTests(unittest.TestCase):
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
        self.db.add(self.owner)
        self.db.commit()

        self.category = BookCategory(
            user_id=self.owner.id,
            name="보호 카테고리",
            visible=True,
            protected=True,
        )
        self.book = Book(
            user_id=self.owner.id,
            title="보호 책",
            category_id=None,
            visible=True,
            protected=False,
        )
        self.db.add_all([self.category, self.book])
        self.db.commit()

        self.book.category_id = self.category.id
        self.chapter = Chapter(
            user_id=self.owner.id,
            book_id=self.book.id,
            title="보호 글",
            body="<p>본문</p>",
            tags=[],
            visible=True,
            protected=False,
        )
        self.db.add(self.chapter)
        self.db.commit()
        self.db.refresh(self.chapter)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _locked(self, **kwargs) -> bool:
        chapter = get_chapter(self.db, self.chapter.id, **kwargs)
        return bool(chapter["locked"])

    def test_category_code_opens_unprotected_children(self) -> None:
        self.assertTrue(self._locked())
        self.assertFalse(
            self._locked(granted_categories=frozenset({self.category.id}))
        )

    def test_category_code_does_not_open_protected_chapter(self) -> None:
        self.chapter.protected = True
        self.db.commit()

        self.assertTrue(
            self._locked(granted_categories=frozenset({self.category.id}))
        )
        self.assertFalse(
            self._locked(
                granted_categories=frozenset({self.category.id}),
                granted_chapters=frozenset({self.chapter.id}),
            )
        )

    def test_category_code_does_not_open_protected_book(self) -> None:
        self.book.protected = True
        self.db.commit()

        self.assertTrue(
            self._locked(granted_categories=frozenset({self.category.id}))
        )
        self.assertFalse(
            self._locked(
                granted_categories=frozenset({self.category.id}),
                granted_books=frozenset({self.book.id}),
            )
        )

    def test_book_code_does_not_open_protected_chapter(self) -> None:
        self.book.protected = True
        self.chapter.protected = True
        self.db.commit()

        self.assertTrue(
            self._locked(granted_books=frozenset({self.book.id}))
        )
        self.assertFalse(
            self._locked(
                granted_categories=frozenset({self.category.id}),
                granted_books=frozenset({self.book.id}),
                granted_chapters=frozenset({self.chapter.id}),
            )
        )

    def test_book_grant_does_not_open_protected_chapter(self) -> None:
        self.category.protected = False
        self.book.protected = True
        self.chapter.protected = True
        self.db.commit()

        self.assertTrue(
            self._locked(granted_books=frozenset({self.book.id}))
        )
        self.assertFalse(
            self._locked(
                granted_books=frozenset({self.book.id}),
                granted_chapters=frozenset({self.chapter.id}),
            )
        )

    def test_all_three_grants_are_required_together(self) -> None:
        self.book.protected = True
        self.chapter.protected = True
        self.db.commit()

        self.assertTrue(self._locked())
        self.assertTrue(
            self._locked(granted_categories=frozenset({self.category.id}))
        )
        self.assertTrue(
            self._locked(granted_books=frozenset({self.book.id}))
        )
        self.assertFalse(
            self._locked(
                granted_categories=frozenset({self.category.id}),
                granted_books=frozenset({self.book.id}),
                granted_chapters=frozenset({self.chapter.id}),
            )
        )

    def test_category_grant_is_not_needed_when_category_is_unprotected(
        self,
    ) -> None:
        self.category.protected = False
        self.db.commit()

        self.assertFalse(self._locked())


if __name__ == "__main__":
    unittest.main()
