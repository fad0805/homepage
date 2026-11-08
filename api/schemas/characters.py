from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

CharacterLayout = Literal["auto", "left", "center", "right"]


class LocationBase(BaseModel):
    """Base model for a character location."""

    name: str
    description: str | None = None
    order: int | None = None


class LocationCreate(LocationBase):
    """Model for creating a character location."""


class LocationUpdate(BaseModel):
    """Model for updating a character location."""

    name: str | None = None
    description: str | None = None
    order: int | None = None


class LocationReorderItem(BaseModel):
    """A single location position inside a reorder request."""

    id: int
    order: int


class LocationReorderRequest(BaseModel):
    """Payload for reordering character locations."""

    items: list[LocationReorderItem] = Field(default_factory=list)


class DollInput(BaseModel):
    """Head or body doll information entered from the character form."""

    company: str | None = None
    name: str | None = None
    skin_tone: str | None = None


class CharacterRelationshipInput(BaseModel):
    """A character linked from another character's profile."""

    related_character_id: int
    relationship_type: str | None = None


class CharacterBase(BaseModel):
    """Base model for a character."""

    name: str
    thumbnail: str | None = None
    location_id: int | None = None
    alt_name: str | None = None
    nickname: str | None = None
    age: str | None = None
    serif: str | None = None
    description: str | None = None
    comming_day: date | None = None
    visible: bool = True
    is_my_doll: bool = True
    order_in_location: int | None = None
    layout: CharacterLayout = "auto"
    relationships: list[CharacterRelationshipInput] = Field(default_factory=list)
    head_doll: DollInput | None = None
    body_doll: DollInput | None = None


class CharacterCreate(CharacterBase):
    """Model for creating a character."""


class CharacterUpdate(BaseModel):
    """Model for updating an existing character."""

    name: str | None = None
    thumbnail: str | None = None
    location_id: int | None = None
    alt_name: str | None = None
    nickname: str | None = None
    age: str | None = None
    serif: str | None = None
    description: str | None = None
    comming_day: date | None = None
    visible: bool | None = None
    is_my_doll: bool | None = None
    order_in_location: int | None = None
    layout: CharacterLayout | None = None
    relationships: list[CharacterRelationshipInput] | None = None
    head_doll: DollInput | None = None
    body_doll: DollInput | None = None


class CharacterReorderItem(BaseModel):
    """A single character position inside a reorder request."""

    id: int
    order_in_location: int
    location_id: int | None = None


class CharacterReorderRequest(BaseModel):
    """Payload for reordering characters."""

    items: list[CharacterReorderItem] = Field(default_factory=list)


class UploadResponse(BaseModel):
    """Result of a thumbnail upload."""

    url: str
