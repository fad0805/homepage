import os
import unittest

from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("ENVIRONMENT", "development")

from crud.links import (
    create_link_category,
    get_all_link_categories,
    reorder_link_categories,
)
from db.base import Base
from models.links import Category  # noqa: F401
from models.users import User
from schemas.links import Category as CategorySchema
from schemas.links import CategoryReorderItem, CategoryReorderRequest


class LinkCategoryTests(unittest.TestCase):
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
            username="link-category-user",
            hashed_password="x",
            role="user",
        )
        self.db.add(user)
        self.db.commit()
        self.user_id = user.id

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_special_category_is_first_in_api_responses(self) -> None:
        create_link_category(
            self.db,
            CategorySchema(name="일반", order=0),
            self.user_id,
        )
        create_link_category(
            self.db,
            CategorySchema(name="배너", is_special=True, order=5),
            self.user_id,
        )

        categories = get_all_link_categories(self.db, self.user_id)

        self.assertEqual([c["name"] for c in categories], ["배너", "일반"])

    def test_reorder_keeps_special_category_pinned(self) -> None:
        normal = create_link_category(
            self.db,
            CategorySchema(name="일반", order=0),
            self.user_id,
        )
        special = create_link_category(
            self.db,
            CategorySchema(name="배너", is_special=True, order=5),
            self.user_id,
        )

        reorder_link_categories(
            self.db,
            CategoryReorderRequest(
                items=[
                    CategoryReorderItem(id=int(normal["id"]), order=0),
                    CategoryReorderItem(id=int(special["id"]), order=1),
                ]
            ),
            self.user_id,
        )

        categories = get_all_link_categories(self.db, self.user_id)
        self.assertEqual([c["name"] for c in categories], ["배너", "일반"])
        self.assertEqual([c["order"] for c in categories], [0, 1])

    def test_only_one_special_category_per_user(self) -> None:
        create_link_category(
            self.db,
            CategorySchema(name="배너", is_special=True),
            self.user_id,
        )
        self.db.add(
            Category(
                user_id=self.user_id,
                name="두 번째 배너",
                is_special=True,
                order=1,
            )
        )

        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()


if __name__ == "__main__":
    unittest.main()
