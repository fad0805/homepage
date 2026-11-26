import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.mastodon import (
    list_active_notification_profiles,
    maybe_notify_chapter,
)
from crud.settings import (
    create_mastodon_settings,
    get_mastodon_settings_by_id,
    list_mastodon_settings,
)
from db.base import Base
from models.books import Book, Chapter
from models.settings import MastodonSettings  # noqa: F401
from models.users import User
from schemas.settings import MastodonSettingsCreate


class MastodonOwnershipTests(unittest.TestCase):
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
        self.db.refresh(self.owner)
        self.db.refresh(self.other)

        self.owner_profile = MastodonSettings(
            user_id=self.owner.id,
            name="owner",
            enabled=True,
            instance_url="https://example.com",
            access_token="owner-token",
            notify_scope="all",
        )
        self.other_profile = MastodonSettings(
            user_id=self.other.id,
            name="other",
            enabled=True,
            instance_url="https://example.com",
            access_token="other-token",
            notify_scope="all",
        )
        self.db.add_all([self.owner_profile, self.other_profile])
        self.db.commit()
        self.db.refresh(self.owner_profile)
        self.db.refresh(self.other_profile)

        self.book = Book(
            user_id=self.owner.id,
            title="책",
            tags=[],
            visible=True,
            order=0,
        )
        self.db.add(self.book)
        self.db.commit()
        self.db.refresh(self.book)

        self.chapter = Chapter(
            user_id=self.owner.id,
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

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_settings_list_and_detail_are_owner_only(self) -> None:
        self.assertEqual(
            [row["id"] for row in list_mastodon_settings(self.db, self.owner.id)],
            [self.owner_profile.id],
        )
        self.assertEqual(
            [row["id"] for row in list_mastodon_settings(self.db, self.other.id)],
            [self.other_profile.id],
        )

        with self.assertRaises(HTTPException) as raised:
            get_mastodon_settings_by_id(
                self.db,
                self.other_profile.id,
                self.owner.id,
            )
        self.assertEqual(raised.exception.status_code, 404)

    def test_created_profile_is_owned_by_the_signed_in_user(self) -> None:
        created = create_mastodon_settings(
            self.db,
            MastodonSettingsCreate(name="새 설정"),
            self.owner.id,
        )

        self.assertIn(
            created["id"],
            {row["id"] for row in list_mastodon_settings(self.db, self.owner.id)},
        )
        self.assertNotIn(
            created["id"],
            {row["id"] for row in list_mastodon_settings(self.db, self.other.id)},
        )

    def test_active_profiles_are_scoped_to_content_owner(self) -> None:
        profiles = list_active_notification_profiles(
            self.db,
            self.owner.id,
        )

        self.assertEqual([profile.id for profile in profiles], [self.owner_profile.id])

    def test_chapter_notification_uses_only_owner_profiles(self) -> None:
        with mock.patch(
            "core.mastodon.post_status",
            return_value="status-1",
        ) as post_status:
            posted = maybe_notify_chapter(self.db, self.chapter)

        self.assertTrue(posted)
        post_status.assert_called_once()
        self.assertEqual(
            post_status.call_args.args[0].id,
            self.owner_profile.id,
        )
        self.assertNotEqual(
            post_status.call_args.args[0].id,
            self.other_profile.id,
        )


if __name__ == "__main__":
    unittest.main()
