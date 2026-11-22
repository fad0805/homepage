import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.books import (
    create_book_category,
    get_all_book_categories,
    get_all_books,
    update_book_category,
)
from db.base import Base
from models.books import Book
from models.users import User
from schemas.books import BookCategoryCreate, BookCategoryUpdate


class BookCategoryExpandedDefaultTests(unittest.TestCase):
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

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_create_persists_expanded_default(self) -> None:
        category = create_book_category(
            self.db,
            BookCategoryCreate(
                name="펼치는 카테고리",
                visible=False,
                protected=True,
                expanded_by_default=True,
            ),
            self.owner.id,
        )

        self.assertTrue(category["expanded_by_default"])
        self.assertFalse(category["visible"])
        self.assertTrue(category["protected"])

        categories = get_all_book_categories(self.db, self.owner.id)
        self.assertTrue(categories[0]["expanded_by_default"])
        self.assertFalse(categories[0]["visible"])
        self.assertTrue(categories[0]["protected"])

    def test_update_can_collapse_previously_expanded_category(self) -> None:
        category = create_book_category(
            self.db,
            BookCategoryCreate(name="카테고리", expanded_by_default=True),
            self.owner.id,
        )

        updated = update_book_category(
            self.db,
            category["id"],
            BookCategoryUpdate(expanded_by_default=False),
            self.owner.id,
        )

        self.assertFalse(updated["expanded_by_default"])

    def test_book_list_exposes_category_expanded_default(self) -> None:
        expanded = create_book_category(
            self.db,
            BookCategoryCreate(name="펼침", expanded_by_default=True),
            self.owner.id,
        )
        collapsed = create_book_category(
            self.db,
            BookCategoryCreate(name="접힘", expanded_by_default=False),
            self.owner.id,
        )
        self.db.add_all(
            [
                Book(
                    user_id=self.owner.id,
                    title="펼침 책",
                    tags=[],
                    category_id=expanded["id"],
                ),
                Book(
                    user_id=self.owner.id,
                    title="접힘 책",
                    tags=[],
                    category_id=collapsed["id"],
                ),
            ]
        )
        self.db.commit()

        books = {book["title"]: book for book in get_all_books(self.db)}

        self.assertTrue(books["펼침 책"]["category"]["expanded_by_default"])
        self.assertFalse(books["접힘 책"]["category"]["expanded_by_default"])
