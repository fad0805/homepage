import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.links import (
    delete_link,
    get_all_links,
    get_link,
    set_link_visibility,
    update_link,
)
from db.base import Base
from models.links import Category, Link
from models.users import User
from schemas.links import LinkUpdate


class LinkVisibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.author = User(username="author", hashed_password="x")
        self.db.add(self.author)
        self.db.commit()
        self.db.refresh(self.author)

        self.category = Category(
            user_id=self.author.id,
            name="링크",
            order=0,
        )
        self.db.add(self.category)
        self.db.commit()
        self.db.refresh(self.category)

        self.public = self._link("공개 링크")
        self.hidden = self._link("숨김 링크")

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _link(self, name: str) -> Link:
        link = Link(
            user_id=self.author.id,
            owner=self.author.username,
            name=name,
            url=f"https://example.com/{name}",
            category=self.category.id,
            order=0,
        )
        self.db.add(link)
        self.db.commit()
        self.db.refresh(link)
        return link

    def test_public_list_excludes_hidden_link(self) -> None:
        set_link_visibility(self.db, self.hidden.id, hidden=True)

        public = get_all_links(self.db, user_id=self.author.id)
        admin = get_all_links(
            self.db,
            user_id=self.author.id,
            include_hidden=True,
        )

        self.assertEqual([link["id"] for link in public], [self.public.id])
        self.assertEqual(
            {link["id"] for link in admin},
            {self.public.id, self.hidden.id},
        )

    def test_hidden_link_can_still_be_read_by_id(self) -> None:
        set_link_visibility(self.db, self.hidden.id, hidden=True)

        link = get_link(self.db, self.hidden.id)

        self.assertEqual(link["id"], self.hidden.id)
        self.assertTrue(link["hidden_by_admin"])

    def test_owner_update_does_not_change_admin_visibility(self) -> None:
        set_link_visibility(self.db, self.hidden.id, hidden=True)

        updated = update_link(
            self.db,
            self.hidden.id,
            LinkUpdate(name="수정된 링크"),
            self.author.id,
        )

        self.assertEqual(updated["name"], "수정된 링크")
        self.assertTrue(updated["hidden_by_admin"])

    def test_admin_can_delete_any_link(self) -> None:
        deleted = delete_link(self.db, self.public.id, None)

        self.assertTrue(deleted)
        remaining = get_all_links(
            self.db,
            user_id=self.author.id,
            include_hidden=True,
        )
        self.assertEqual([link["id"] for link in remaining], [self.hidden.id])


if __name__ == "__main__":
    unittest.main()
