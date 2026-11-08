from sqlalchemy import Boolean, Column, Date, Integer, String, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import relationship

from db.base import Base


class Character(Base):
    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    thumbnail = Column(String, nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    alt_name = Column(String, nullable=True)
    nickname = Column(String, nullable=True)
    head = Column(Integer, ForeignKey("dolls.id"), nullable=True, index=True)
    body = Column(Integer, ForeignKey("dolls.id"), nullable=True, index=True)
    comming_day = Column(Date, nullable=True)
    age = Column(String, nullable=True)
    serif = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    visible = Column(Boolean, default=True)
    is_my_doll = Column(Boolean, default=True)
    order_in_location = Column(Integer, nullable=True)
    layout = Column(
        String,
        nullable=False,
        default="auto",
        server_default="auto",
    )

    location_relationship = relationship("Location", foreign_keys=[location_id])
    head_relationship = relationship("Doll", foreign_keys=[head])
    body_relationship = relationship("Doll", foreign_keys=[body])
    outgoing_relationships = relationship(
        "CharacterRelationship",
        foreign_keys="CharacterRelationship.character_id",
        order_by="CharacterRelationship.id",
    )


class CharacterRelationship(Base):
    __tablename__ = "character_relationships"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    related_character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    relationship_type = Column(String, nullable=False)
    established = Column(DateTime, nullable=True)

    character = relationship(
        "Character",
        foreign_keys=[character_id],
        back_populates="outgoing_relationships",
    )
    related_character = relationship("Character", foreign_keys=[related_character_id])


class Doll(Base):
    __tablename__ = "dolls"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    company = Column(String, nullable=False)
    name = Column(String, nullable=False)
    size = Column(String, nullable=True)
    skin_tone = Column(String, nullable=True)


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    order = Column(Integer, nullable=True)
