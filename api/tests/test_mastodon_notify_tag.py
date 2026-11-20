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

    def _profile(
        self,
        notify_tag: str = "#신작",
        *,
        notify_scope: str = "tag",
        notify_tag_mode: str = "any",
    ) -> SimpleNamespace:
        return SimpleNamespace(
            notify_scope=notify_scope,
            notify_tag=notify_tag,
            notify_tag_mode=notify_tag_mode,
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

    def test_multiple_tags_support_or_and_and(self) -> None:
        chapter = SimpleNamespace(book_id=1, tags=["신작", "판타지"])
        illustration = SimpleNamespace(tags=["신작"])

        any_profile = self._profile("신작, 판타지", notify_tag_mode="any")
        all_profile = self._profile("신작, 판타지", notify_tag_mode="all")

        self.assertTrue(_chapter_notify_allowed(any_profile, chapter))
        self.assertTrue(_chapter_notify_allowed(all_profile, chapter))
        self.assertTrue(_illustration_notify_allowed(any_profile, illustration))
        self.assertFalse(
            _illustration_notify_allowed(all_profile, illustration)
        )

    def test_mixed_operators_respect_precedence_and_parentheses(self) -> None:
        chapter = SimpleNamespace(book_id=1, tags=["신작"])
        profile = self._profile("신작 * 판타지 + 로맨스")

        self.assertTrue(_chapter_notify_allowed(profile, chapter))

        chapter.tags = ["판타지"]
        self.assertFalse(_chapter_notify_allowed(profile, chapter))

        chapter.tags = ["판타지", "로맨스"]
        self.assertTrue(_chapter_notify_allowed(profile, chapter))

        grouped = self._profile("(신작 * 판타지) + 로맨스")
        chapter.tags = ["신작"]
        self.assertFalse(_chapter_notify_allowed(grouped, chapter))

        chapter.tags = ["신작", "로맨스"]
        self.assertTrue(_chapter_notify_allowed(grouped, chapter))

    def test_tag_scopes_can_target_chapters_or_illustrations(self) -> None:
        chapter = SimpleNamespace(book_id=1, tags=["신작"])
        illustration = SimpleNamespace(tags=["신작"])

        chapters_only = self._profile(
            "신작", notify_scope="tag_books"
        )
        illustrations_only = self._profile(
            "신작", notify_scope="tag_illustrations"
        )

        self.assertTrue(_chapter_notify_allowed(chapters_only, chapter))
        self.assertFalse(
            _illustration_notify_allowed(chapters_only, illustration)
        )
        self.assertFalse(
            _chapter_notify_allowed(illustrations_only, chapter)
        )
        self.assertTrue(
            _illustration_notify_allowed(illustrations_only, illustration)
        )

    def test_update_keeps_explicit_operator_expression(self) -> None:
        profile = create_mastodon_settings(
            self.db,
            MastodonSettingsCreate(name="표현식 알림"),
            self.user_id,
        )
        updated = update_mastodon_settings(
            self.db,
            profile["id"],
            MastodonSettingsUpdate(
                notify_scope="tag_illustrations",
                notify_tag="(신작 * 판타지) + 로맨스",
            ),
            self.user_id,
        )
        self.assertEqual(
            updated["notify_tag"], "(신작 * 판타지) + 로맨스"
        )

        with self.assertRaises(HTTPException) as raised:
            update_mastodon_settings(
                self.db,
                profile["id"],
                MastodonSettingsUpdate(
                    notify_scope="tag_illustrations",
                    notify_tag="신작 + (판타지",
                ),
                self.user_id,
            )
        self.assertEqual(raised.exception.status_code, 400)

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

        multiple = update_mastodon_settings(
            self.db,
            profile["id"],
            MastodonSettingsUpdate(
                notify_scope="tag_books",
                notify_tag="  #신작, 판타지, #신작  ",
                notify_tag_mode="all",
            ),
            self.user_id,
        )
        self.assertEqual(multiple["notify_scope"], "tag_books")
        self.assertEqual(multiple["notify_tag"], "신작 + 판타지")
        self.assertEqual(multiple["notify_tag_mode"], "all")

        cleared = update_mastodon_settings(
            self.db,
            profile["id"],
            MastodonSettingsUpdate(notify_scope="books"),
            self.user_id,
        )
        self.assertEqual(cleared["notify_scope"], "books")
        self.assertIsNone(cleared["notify_tag"])
        self.assertEqual(cleared["notify_tag_mode"], "any")

    def test_serializer_exposes_tag_only_for_tag_scope(self) -> None:
        settings = MastodonSettings(
            notify_scope="tag",
            notify_tag="신작",
        )
        serialized = serialize_mastodon_settings(settings)
        self.assertEqual(serialized["notify_tag"], "신작")
        self.assertEqual(serialized["notify_tag_mode"], "any")

        settings.notify_scope = "all"
        self.assertIsNone(
            serialize_mastodon_settings(settings)["notify_tag"]
        )
        self.assertEqual(
            serialize_mastodon_settings(settings)["notify_tag_mode"], "any"
        )


if __name__ == "__main__":
    unittest.main()
