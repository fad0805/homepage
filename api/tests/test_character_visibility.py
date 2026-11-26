import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.characters import (
    delete_location,
    get_character,
    get_public_characters,
    set_character_visibility,
)
from db.base import Base
from models.characters import Character, CharacterRelationship, Location
from models.users import User


class CharacterVisibilityTests(unittest.TestCase):
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
        self.invisible = self._character(
            "숨김",
            is_my_doll=True,
            visible=False,
        )
        self.admin_hidden = self._character(
            "관리자 숨김",
            is_my_doll=True,
            visible=True,
            hidden_by_admin=True,
        )

        for related in (self.private, self.invisible, self.admin_hidden):
            self.db.add(
                CharacterRelationship(
                    character_id=self.public.id,
                    related_character_id=related.id,
                    relationship_type="관계",
                )
            )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _character(
        self,
        name: str,
        *,
        is_my_doll: bool,
        visible: bool,
        hidden_by_admin: bool = False,
    ) -> Character:
        character = Character(
            user_id=self.user.id,
            name=name,
            thumbnail=f"/uploads/characters/{name}.png",
            location_id=self.location.id,
            is_my_doll=is_my_doll,
            visible=visible,
            hidden_by_admin=hidden_by_admin,
            order_in_location=0,
        )
        self.db.add(character)
        self.db.commit()
        self.db.refresh(character)
        return character

    def test_public_list_excludes_admin_hidden_character(self) -> None:
        rows = get_public_characters(self.db, self.user.id)
        ids = {row["id"] for row in rows}

        self.assertIn(self.public.id, ids)
        self.assertNotIn(self.private.id, ids)
        self.assertNotIn(self.invisible.id, ids)
        self.assertNotIn(self.admin_hidden.id, ids)

    def test_admin_hidden_detail_requires_include_hidden(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            get_character(self.db, self.admin_hidden.id)
        self.assertEqual(raised.exception.status_code, 404)

        character = get_character(
            self.db,
            self.admin_hidden.id,
            include_hidden=True,
        )
        self.assertTrue(character["hidden_by_admin"])

    def test_admin_toggle_hides_and_restores_character(self) -> None:
        hidden = set_character_visibility(
            self.db,
            self.public.id,
            hidden=True,
        )
        self.assertTrue(hidden["hidden_by_admin"])

        rows = get_public_characters(self.db, self.user.id)
        self.assertNotIn(self.public.id, {row["id"] for row in rows})

        visible = set_character_visibility(
            self.db,
            self.public.id,
            hidden=False,
        )
        self.assertFalse(visible["hidden_by_admin"])

    def test_relationship_keeps_private_profile_and_hides_invisible(self) -> None:
        character = get_character(self.db, self.public.id)
        related_ids = {
            item["character"]["id"]
            for item in character["relationships"]
            if item["character"]
        }

        self.assertIn(self.private.id, related_ids)
        self.assertNotIn(self.invisible.id, related_ids)
        self.assertNotIn(self.admin_hidden.id, related_ids)

    def test_admin_can_delete_an_empty_location(self) -> None:
        empty = Location(user_id=self.user.id, name="빈 장소", order=1)
        self.db.add(empty)
        self.db.commit()
        self.db.refresh(empty)

        self.assertTrue(delete_location(self.db, empty.id, None))
        self.assertIsNone(
            self.db.query(Location).filter(Location.id == empty.id).first()
        )


if __name__ == "__main__":
    unittest.main()
