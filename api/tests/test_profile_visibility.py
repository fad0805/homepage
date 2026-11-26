import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.profiles import (
    get_all_profiles,
    get_profile,
    set_profile_visibility,
    update_profile,
)
from db.base import Base
from models.profiles import Profile
from models.users import User
from schemas.profiles import ProfileUpdate


class ProfileVisibilityTests(unittest.TestCase):
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
        self.other = User(username="other", hashed_password="x")
        self.db.add_all([self.author, self.other])
        self.db.commit()

        self.profile = Profile(
            user_id=self.author.id,
            title="작가 프로필",
            subtitle="부제",
            profile="<p>소개</p>",
        )
        self.other_profile = Profile(
            user_id=self.other.id,
            title="다른 작가",
            profile="<p>다른 소개</p>",
        )
        self.db.add_all([self.profile, self.other_profile])
        self.db.commit()
        self.db.refresh(self.profile)
        self.db.refresh(self.other_profile)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_hidden_profile_is_excluded_from_public_list(self) -> None:
        set_profile_visibility(
            self.db,
            self.profile.id,
            hidden=True,
        )

        public = get_all_profiles(self.db, user_id=self.author.id)
        admin = get_all_profiles(
            self.db,
            user_id=self.author.id,
            include_hidden=True,
        )

        self.assertEqual(public, [])
        self.assertEqual([row["id"] for row in admin], [self.profile.id])

    def test_hidden_profile_detail_requires_include_hidden(self) -> None:
        set_profile_visibility(
            self.db,
            self.profile.id,
            hidden=True,
        )

        with self.assertRaises(HTTPException) as raised:
            get_profile(self.db, self.profile.id, include_hidden=False)
        self.assertEqual(raised.exception.status_code, 404)

        profile = get_profile(self.db, self.profile.id, include_hidden=True)
        self.assertTrue(profile["hidden_by_admin"])

    def test_author_can_restore_visibility_only_through_admin_flag(self) -> None:
        hidden = set_profile_visibility(
            self.db,
            self.profile.id,
            hidden=True,
        )
        self.assertTrue(hidden["hidden_by_admin"])

        updated = update_profile(
            self.db,
            self.profile.id,
            ProfileUpdate(title="수정된 제목", profile="<p>수정된 소개</p>"),
            self.author.id,
        )

        self.assertEqual(updated["title"], "수정된 제목")
        self.assertTrue(updated["hidden_by_admin"])

        visible = set_profile_visibility(
            self.db,
            self.profile.id,
            hidden=False,
        )
        self.assertFalse(visible["hidden_by_admin"])


if __name__ == "__main__":
    unittest.main()
