import unittest
from datetime import datetime, timedelta

from pydantic import ValidationError

from core.config import (
    GALLERY_ACCESS_MAX_DAYS,
    GALLERY_INVITE_HOURS,
    GALLERY_SESSION_DAYS,
)
from crud import gallery as gallery_crud
from models.gallery import GalleryInvite, GallerySession
from schemas.gallery import GalleryInviteCreate


class GalleryExpiryTests(unittest.TestCase):
    def test_config_is_capped_at_one_week(self) -> None:
        self.assertEqual(GALLERY_ACCESS_MAX_DAYS, 7)
        self.assertEqual(GALLERY_INVITE_HOURS, 168)
        self.assertEqual(GALLERY_SESSION_DAYS, 7)

    def test_invite_lifetime_cannot_exceed_one_week(self) -> None:
        invite = GalleryInviteCreate(
            resource_type="book", resource_id=1, expires_in_hours=168
        )
        self.assertEqual(invite.expires_in_hours, 168)

        with self.assertRaises(ValidationError):
            GalleryInviteCreate(
                resource_type="book", resource_id=1, expires_in_hours=169
            )

    def test_invite_expires_one_week_after_creation(self) -> None:
        created_at = datetime(2026, 1, 1)
        invite = GalleryInvite(
            user_id=1,
            code_hash="code",
            created_at=created_at,
            expires_at=created_at + timedelta(days=30),
        )

        self.assertEqual(
            gallery_crud.invite_expires_at(invite),
            created_at + timedelta(days=7),
        )
        self.assertFalse(
            gallery_crud.invite_is_expired(
                invite, created_at + timedelta(days=6, hours=23)
            )
        )
        self.assertTrue(
            gallery_crud.invite_is_expired(
                invite, created_at + timedelta(days=7)
            )
        )

    def test_session_expires_one_week_after_creation(self) -> None:
        created_at = datetime(2026, 1, 1)
        session = GallerySession(
            token_hash="token",
            created_at=created_at,
            expires_at=created_at + timedelta(days=30),
        )

        self.assertEqual(
            gallery_crud.session_expires_at(session),
            created_at + timedelta(days=7),
        )
        self.assertFalse(
            gallery_crud.session_is_expired(
                session, created_at + timedelta(days=6, hours=23)
            )
        )
        self.assertTrue(
            gallery_crud.session_is_expired(
                session, created_at + timedelta(days=7)
            )
        )


if __name__ == "__main__":
    unittest.main()
