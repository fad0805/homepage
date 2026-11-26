import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.characters import get_all_characters, get_public_characters
from db.base import Base
from models.characters import Character, Location
from models.users import User


class CharacterListTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.user = User(username="author", hashed_password="x")
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        self.location = Location(
            user_id=self.user.id,
            name="성",
            description="성 설명",
            order=0,
        )
        self.db.add(self.location)
        self.db.commit()
        self.db.refresh(self.location)

        self.public = self._character("공개", is_my_doll=True, visible=True)
        self.private = self._character(
            "비공개 프로필",
            is_my_doll=False,
            visible=True,
        )
        self.hidden = self._character(
            "숨김",
            is_my_doll=True,
            visible=False,
        )

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _character(
        self,
        name: str,
        *,
        is_my_doll: bool,
        visible: bool,
    ) -> Character:
        character = Character(
            user_id=self.user.id,
            name=name,
            thumbnail=f"/uploads/characters/{name}.png",
            detail_image=f"/uploads/characters/{name}-detail.png",
            location_id=self.location.id,
            is_my_doll=is_my_doll,
            visible=visible,
            order_in_location=0,
        )
        self.db.add(character)
        self.db.commit()
        self.db.refresh(character)
        return character

    def test_public_list_excludes_private_and_hidden_characters(self) -> None:
        rows = get_public_characters(self.db, self.user.id)

        self.assertEqual([row["id"] for row in rows], [self.public.id])

    def test_public_list_only_returns_list_fields(self) -> None:
        row = get_public_characters(self.db, self.user.id)[0]

        self.assertEqual(
            set(row),
            {
                "id",
                "name",
                "thumbnail",
                "location_id",
                "order_in_location",
                "layout",
                "location",
            },
        )
        self.assertEqual(
            set(row["location"]),
            {"id", "name", "order"},
        )
        self.assertNotIn("detail_image", row)
        self.assertNotIn("description", row)
        self.assertNotIn("relationships", row)
        self.assertNotIn("head_doll", row)

    def test_owner_list_still_includes_private_and_hidden_characters(self) -> None:
        rows = get_all_characters(self.db, self.user.id)

        self.assertEqual(
            {row["id"] for row in rows},
            {self.public.id, self.private.id, self.hidden.id},
        )


if __name__ == "__main__":
    unittest.main()
