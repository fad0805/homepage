import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.books import get_all_books, get_book
from db.base import Base
from models.books import Book, BookCategory
from models.users import User


class BookCategoryVisibilityTests(unittest.TestCase):
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
        self.db.flush()

        self.hidden_category = BookCategory(
            user_id=self.owner.id,
            name="비공개 카테고리",
            visible=False,
        )
        self.db.add(self.hidden_category)
        self.db.flush()

        self.hidden_book = Book(
            user_id=self.owner.id,
            title="비공개 카테고리 책",
            tags=[],
            category_id=self.hidden_category.id,
        )
        self.public_book = Book(
            user_id=self.owner.id,
            title="공개 책",
            tags=[],
        )
        self.db.add_all([self.hidden_book, self.public_book])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _titles(self, books):
        return sorted(book["title"] for book in books)

    def test_anonymous_list_excludes_hidden_categories(self) -> None:
        books = get_all_books(self.db)

        self.assertEqual(self._titles(books), ["공개 책"])

    def test_signed_in_viewer_excludes_other_hidden_categories(self) -> None:
        books = get_all_books(
            self.db,
            include_hidden=True,
            viewer_user_id=self.other.id,
        )

        self.assertEqual(self._titles(books), ["공개 책"])

    def test_owner_sees_own_hidden_category(self) -> None:
        books = get_all_books(
            self.db,
            include_hidden=True,
            viewer_user_id=self.owner.id,
        )

        self.assertEqual(
            self._titles(books),
            ["공개 책", "비공개 카테고리 책"],
        )

    def test_admin_sees_hidden_categories(self) -> None:
        books = get_all_books(
            self.db,
            include_hidden=True,
            is_admin=True,
        )

        self.assertEqual(
            self._titles(books),
            ["공개 책", "비공개 카테고리 책"],
        )

    def test_hidden_category_detail_is_hidden_from_other_viewers(self) -> None:
        with self.assertRaises(HTTPException) as context:
            get_book(
                self.db,
                self.hidden_book.id,
                include_hidden=True,
                viewer_user_id=self.other.id,
            )
        self.assertEqual(context.exception.status_code, 404)

    def test_hidden_category_detail_is_visible_to_owner_and_admin(self) -> None:
        owned = get_book(
            self.db,
            self.hidden_book.id,
            include_hidden=True,
            viewer_user_id=self.owner.id,
        )
        self.assertEqual(owned["title"], "비공개 카테고리 책")

        admin = get_book(
            self.db,
            self.hidden_book.id,
            include_hidden=True,
            is_admin=True,
        )
        self.assertEqual(admin["title"], "비공개 카테고리 책")
