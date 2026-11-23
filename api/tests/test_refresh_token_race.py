import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.security import hash_refresh_token
from crud.users import create_user_session
from db.base import Base
from models.users import User, UserSession
from routers.utils import create_session_refresh_token, refresh_access_token


class RefreshTokenRaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.user = User(username="writer", hashed_password="x")
        self.db.add(self.user)
        self.db.commit()

        row = create_user_session(self.db, self.user.id)
        self.refresh_token = create_session_refresh_token(
            row.id, self.user.username, row.expires_at
        )
        row.refresh_token_hash = hash_refresh_token(self.refresh_token)
        self.db.commit()
        self.session_id = row.id

        # A second request loads the row before the first one rotates it.
        self.stale_db = self.Session()
        self.stale_session = (
            self.stale_db.query(UserSession).filter_by(id=self.session_id).one()
        )

    def tearDown(self) -> None:
        self.stale_db.close()
        self.db.close()
        self.engine.dispose()

    def test_concurrent_refresh_returns_the_same_cookie_value(self) -> None:
        _, _, first = refresh_access_token(
            self.db, refresh_token=self.refresh_token
        )
        _, _, second = refresh_access_token(
            self.stale_db, refresh_token=self.refresh_token
        )

        self.assertIsNotNone(first)
        self.assertEqual(first, second)

        current = self.db.query(UserSession).filter_by(id=self.session_id).one()
        self.assertEqual(
            current.refresh_token_hash,
            hash_refresh_token(first),
        )

    def test_grace_token_does_not_start_another_rotation(self) -> None:
        _, _, rotated = refresh_access_token(
            self.db, refresh_token=self.refresh_token
        )
        current = self.db.query(UserSession).filter_by(id=self.session_id).one()
        rotated_at = current.refresh_token_rotated_at

        _, _, replayed = refresh_access_token(
            self.db, refresh_token=self.refresh_token
        )

        self.assertEqual(replayed, rotated)
        current = self.db.query(UserSession).filter_by(id=self.session_id).one()
        self.assertEqual(current.refresh_token_rotated_at, rotated_at)
