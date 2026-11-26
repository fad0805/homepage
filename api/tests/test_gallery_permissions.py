import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud import gallery as gallery_crud
from db.base import Base
from models.gallery import GalleryInvite, GallerySession, GallerySessionGrant
from models.illustrations import Illustration
from models.users import User


class GalleryPermissionTests(unittest.TestCase):
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

        self.owner_illustration = self._illustration(
            self.owner.id,
            "owner",
        )
        self.other_illustration = self._illustration(
            self.other.id,
            "other",
        )

        self.owner_invite = self._invite(
            self.owner.id,
            self.owner_illustration.id,
            "owner-invite",
        )
        self.other_invite = self._invite(
            self.other.id,
            self.other_illustration.id,
            "other-invite",
        )

        self.session = GallerySession(
            token_hash="session-token",
            expires_at=datetime.utcnow() + timedelta(days=1),
        )
        self.db.add(self.session)
        self.db.commit()
        self.db.refresh(self.session)

        self.owner_grant = GallerySessionGrant(
            session_id=self.session.id,
            illustration_id=self.owner_illustration.id,
        )
        self.other_grant = GallerySessionGrant(
            session_id=self.session.id,
            illustration_id=self.other_illustration.id,
        )
        self.db.add_all([self.owner_grant, self.other_grant])
        self.db.commit()
        self.db.refresh(self.owner_grant)
        self.db.refresh(self.other_grant)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _illustration(self, user_id: int, name: str) -> Illustration:
        illustration = Illustration(
            user_id=user_id,
            title=name,
            visible=True,
            order=0,
        )
        self.db.add(illustration)
        self.db.commit()
        self.db.refresh(illustration)
        return illustration

    def _invite(
        self,
        user_id: int,
        illustration_id: int,
        code: str,
    ) -> GalleryInvite:
        invite = GalleryInvite(
            user_id=user_id,
            code_hash=code,
            illustration_id=illustration_id,
            expires_at=datetime.utcnow() + timedelta(hours=1),
        )
        self.db.add(invite)
        self.db.commit()
        self.db.refresh(invite)
        return invite

    def test_admin_lists_every_invite_and_user_lists_own(self) -> None:
        self.assertEqual(
            {invite.id for invite in gallery_crud.list_invites(self.db)},
            {self.owner_invite.id, self.other_invite.id},
        )
        self.assertEqual(
            [
                invite.id
                for invite in gallery_crud.list_invites(
                    self.db,
                    self.owner.id,
                )
            ],
            [self.owner_invite.id],
        )

    def test_user_cannot_revoke_another_users_invite(self) -> None:
        now = datetime.utcnow()

        self.assertFalse(
            gallery_crud.revoke_invite(
                self.db,
                self.other_invite.id,
                now,
                self.owner.id,
            )
        )
        self.assertTrue(
            gallery_crud.revoke_invite(
                self.db,
                self.other_invite.id,
                now,
                None,
            )
        )

    def test_user_sees_only_granted_resources_on_their_sessions(self) -> None:
        owner_sessions = gallery_crud.list_sessions(
            self.db,
            self.owner.id,
        )
        admin_sessions = gallery_crud.list_sessions(self.db)

        self.assertEqual([session.id for session in owner_sessions], [self.session.id])
        self.assertEqual([session.id for session in admin_sessions], [self.session.id])

    def test_user_can_revoke_only_owned_session_grant(self) -> None:
        self.assertFalse(
            gallery_crud.revoke_session_grant(
                self.db,
                self.session.id,
                self.other_grant.id,
                self.owner.id,
            )
        )
        self.assertTrue(
            gallery_crud.revoke_session_grant(
                self.db,
                self.session.id,
                self.owner_grant.id,
                self.owner.id,
            )
        )

    def test_user_revokes_only_own_session_grants(self) -> None:
        self.assertTrue(
            gallery_crud.revoke_session_grants(
                self.db,
                self.session.id,
                self.owner.id,
                datetime.utcnow(),
            )
        )

        self.db.expire_all()
        remaining = gallery_crud.list_sessions(self.db)
        self.assertEqual(len(remaining), 1)
        self.assertEqual(
            [grant.id for grant in remaining[0].grants],
            [self.other_grant.id],
        )


if __name__ == "__main__":
    unittest.main()
