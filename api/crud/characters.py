from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.characters import Character, CharacterRelationship, Location
from schemas.characters import (
    CharacterCreate,
    CharacterReorderRequest,
    CharacterUpdate,
    LocationCreate,
    LocationReorderRequest,
    LocationUpdate,
)


def _serialize_location(location: Location) -> dict:
    return {
        "id": location.id,
        "name": location.name,
        "description": location.description,
        "order": location.order,
    }


def _serialize_character(character: Character) -> dict:
    location = character.location_relationship
    return {
        "id": character.id,
        "name": character.name,
        "thumbnail": character.thumbnail,
        "location_id": character.location_id,
        "alt_name": character.alt_name,
        "nickname": character.nickname,
        "age": character.age,
        "serif": character.serif,
        "description": character.description,
        "comming_day": character.comming_day,
        "visible": character.visible,
        "is_my_doll": character.is_my_doll,
        "order_in_location": character.order_in_location,
        "created_at": character.created_at,
        "updated_at": character.updated_at,
        "location": _serialize_location(location) if location else None,
    }


def _get_location_or_404(db: Session, location_id: int) -> Location:
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist location",
        )
    return location


def _next_character_order(db: Session, location_id: int | None) -> int:
    max_order = (
        db.query(func.max(Character.order_in_location))
        .filter(Character.location_id == location_id)
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


def _next_location_order(db: Session) -> int:
    max_order = db.query(func.max(Location.order)).scalar()
    return 0 if max_order is None else max_order + 1


# Character CRUD Operations
def get_all_characters(db: Session):
    """
    Get all characters ordered by location and display order.
    """
    characters = (
        db.query(Character)
        .outerjoin(Location, Character.location_id == Location.id)
        .order_by(
            Location.order,
            Location.id,
            Character.order_in_location,
            Character.id,
        )
        .all()
    )
    return [_serialize_character(character) for character in characters]


def get_character(db: Session, character_id: int):
    """
    Get a single character.
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )
    return _serialize_character(character)


def create_character(db: Session, character: CharacterCreate):
    """
    Create a new character.
    """
    data = character.model_dump(exclude={"order_in_location"})

    if data.get("location_id") is not None:
        _get_location_or_404(db, data["location_id"])

    data["order_in_location"] = (
        character.order_in_location
        if character.order_in_location is not None
        else _next_character_order(db, data.get("location_id"))
    )

    db_character = Character(**data)
    db.add(db_character)
    db.commit()
    db.refresh(db_character)
    return _serialize_character(db_character)


def update_character(db: Session, character_id: int, updated: CharacterUpdate):
    """
    Update an existing character.
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )

    data = updated.model_dump(exclude_unset=True)

    if "location_id" in data and data["location_id"] is not None:
        _get_location_or_404(db, data["location_id"])

    if (
        "location_id" in data
        and "order_in_location" not in data
        and data["location_id"] != character.location_id
    ):
        data["order_in_location"] = _next_character_order(db, data["location_id"])

    for key, value in data.items():
        setattr(character, key, value)

    db.commit()
    db.refresh(character)
    return _serialize_character(character)


def delete_character(db: Session, character_id: int):
    """
    Delete a character and its relationship records.
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )

    db.query(CharacterRelationship).filter(
        (CharacterRelationship.character_id == character_id)
        | (CharacterRelationship.related_character_id == character_id)
    ).delete(synchronize_session=False)
    db.delete(character)
    db.commit()
    return True


def reorder_characters(db: Session, payload: CharacterReorderRequest):
    """
    Persist the order and location of multiple characters in a single transaction.
    """
    ids = [item.id for item in payload.items]
    characters = {
        character.id: character
        for character in db.query(Character).filter(Character.id.in_(ids)).all()
    }

    missing = set(ids) - set(characters)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist character: {sorted(missing)}",
        )

    try:
        for item in payload.items:
            character = characters[item.id]
            if item.location_id is not None:
                character.location_id = item.location_id
            character.order_in_location = item.order_in_location
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True


# Character Location CRUD Operations
def get_all_locations(db: Session):
    """
    Get all character locations ordered by display order.
    """
    locations = db.query(Location).order_by(Location.order, Location.id).all()
    return [_serialize_location(location) for location in locations]


def create_location(db: Session, location: LocationCreate):
    """
    Create a new character location.
    """
    order = (
        location.order if location.order is not None else _next_location_order(db)
    )
    db_location = Location(
        name=location.name,
        description=location.description,
        order=order,
    )
    db.add(db_location)
    db.commit()
    db.refresh(db_location)
    return _serialize_location(db_location)


def update_location(db: Session, location_id: int, updated: LocationUpdate):
    """
    Update an existing character location.
    """
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist location",
        )

    for key, value in updated.model_dump(exclude_unset=True).items():
        setattr(location, key, value)

    db.commit()
    db.refresh(location)
    return _serialize_location(location)


def delete_location(db: Session, location_id: int):
    """
    Delete a character location.
    """
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist location",
        )

    character_count = (
        db.query(Character).filter(Character.location_id == location_id).count()
    )
    if character_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "이 위치에 등장인물이 남아 있어 삭제할 수 없습니다. "
                "등장인물을 먼저 다른 위치로 옮기거나 삭제해주세요."
            ),
        )

    db.delete(location)
    db.commit()
    return True


def reorder_locations(db: Session, payload: LocationReorderRequest):
    """
    Persist the display order of multiple locations in a single transaction.
    """
    ids = [item.id for item in payload.items]
    locations = {
        location.id: location
        for location in db.query(Location).filter(Location.id.in_(ids)).all()
    }

    missing = set(ids) - set(locations)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist location: {sorted(missing)}",
        )

    try:
        for item in payload.items:
            locations[item.id].order = item.order
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True
