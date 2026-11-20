import os
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("ENVIRONMENT", "development")

from core.mastodon import (
    _chapter_notify_allowed,
    _illustration_notify_allowed,
    serialize_mastodon_settings,
)
from crud.settings import (
    create_mastodon_settings,
    update_mastodon_settings,
)
from db.base import Base
from models.settings import MastodonSettings  # noqa: F401
from models.users import User
from schemas.settings import MastodonSettingsCreate, MastodonSettingsUpdate


class MastodonNotifyTagTests(unittest.TestCase):
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
            username="notify-owner",
            hashed_password="x",
            role="user",
        )
        self.db.add(user)
        self.db.commit()
        self.user_id = user.id

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _profile(self, notify_tag: str = "#신작") -> SimpleNamespace:
        return SimpleNamespace(
            notify_scope="tag",
            notify_tag=notify_tag,
            notify_book_id=None,
        )

    def test_tag_scope_matches_chapter_tags_case_insensitively(self) -> None:
        settings = self._profile()
        chapter = SimpleNamespace(book_id=1, tags=["판타지", "신작"])

        self.assertTrue(_chapter_notify_allowed(settings, chapter))

        chapter.tags = ["#신작"]
        self.assertTrue(_chapter_notify_allowed(settings, chapter))

        chapter.tags = ["신작 소설"]
        self.assertFalse(_chapter_notify_allowed(settings, chapter))

    def test_tag_scope_matches_illustration_tags(self) -> None:
        settings = self._profile("신작")
        illustration = SimpleNamespace(tags=["삽화", "신작"])

        self.assertTrue(
            _illustration_notify_allowed(settings, illustration)
        )

        illustration.tags = ["일반"]
        self.assertFalse(
            _illustration_notify_allowed(settings, illustration)
        )

    def test_other_scopes_still_allow_content_without_tags(self) -> None:
        chapter = SimpleNamespace(book_id=7, tags=[])
        illustration = SimpleNamespace(tags=[])

        self.assertTrue(
            _chapter_notify_allowed(
                SimpleNamespace(
                    notify_scope="all", notify_tag=None, notify_book_id=None
                ),
                chapter,
            )
        )
        self.assertTrue(
            _illustration_notify_allowed(
                SimpleNamespace(
                    notify_scope="illustrations",
                    notify_tag=None,
                    notify_book_id=None,
                ),
                illustration,
            )
        )

    def test_update_requires_and_normalizes_tag(self) -> None:
        profile = create_mastodon_settings(
            self.db,
            MastodonSettingsCreate(name="태그 알림"),
            self.user_id,
        )

        with self.assertRaises(HTTPException) as raised:
            update_mastodon_settings(
                self.db,
                profile["id"],
                MastodonSettingsUpdate(notify_scope="tag"),
                self.user_id,
            )
        self.assertEqual(raised.exception.status_code, 400)

        updated = update_mastodon_settings(
            self.db,
            profile["id"],
            MastodonSettingsUpdate(
                notify_scope="tag", notify_tag="  #신작  "
            ),
            self.user_id,
        )
        self.assertEqual(updated["notify_scope"], "tag")
        self.assertEqual(updated["notify_tag"], "신작")

        cleared = update_mastodon_settings(
            self.db,
            profile["id"],
            MastodonSettingsUpdate(notify_scope="books"),
            self.user_id,
        )
        self.assertEqual(cleared["notify_scope"], "books")
        self.assertIsNone(cleared["notify_tag"])

    def test_serializer_exposes_tag_only_for_tag_scope(self) -> None:
        settings = MastodonSettings(
            notify_scope="tag",
            notify_tag="신작",
        )
        self.assertEqual(
            serialize_mastodon_settings(settings)["notify_tag"], "신작"
        )

        settings.notify_scope = "all"
        self.assertIsNone(
            serialize_mastodon_settings(settings)["notify_tag"]
        )


if __name__ == "__main__":
    unittest.main()
