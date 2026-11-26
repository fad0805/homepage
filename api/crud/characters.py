from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from core.audit import queue_change
from core.uploads import delete_replaced_upload, delete_uploaded_file
from models.characters import Character, CharacterRelationship, Doll, Location
from schemas.characters import (
    CharacterCreate,
    CharacterRelationshipInput,
    CharacterReorderRequest,
    CharacterUpdate,
    DollInput,
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


def _serialize_doll(doll: Doll | None) -> dict | None:
    if doll is None:
        return None
    return {
        "id": doll.id,
        "company": doll.company,
        "name": doll.name,
        "size": doll.size,
        "skin_tone": doll.skin_tone,
    }


def _serialize_relationship(relationship: CharacterRelationship) -> dict:
    related = relationship.related_character
    return {
        "id": relationship.id,
        "relationship_type": relationship.relationship_type,
        "character": (
            {
                "id": related.id,
                "name": related.name,
                "thumbnail": related.thumbnail,
                "layout": related.layout or "auto",
                "visible": related.visible,
                "is_my_doll": related.is_my_doll,
                "hidden_by_admin": bool(related.hidden_by_admin),
            }
            if related
            else None
        ),
    }


def _serialize_character_list_item(character: Character) -> dict:
    """Return only the fields the public character list renders."""
    location = character.location_relationship
    return {
        "id": character.id,
        "name": character.name,
        "thumbnail": character.thumbnail,
        "location_id": character.location_id,
        "order_in_location": character.order_in_location,
        "layout": character.layout or "auto",
        "location": (
            {
                "id": location.id,
                "name": location.name,
                "order": location.order,
            }
            if location
            else None
        ),
    }


def _serialize_character(
    character: Character,
    *,
    include_hidden: bool = True,
) -> dict:
    location = character.location_relationship
    return {
        "id": character.id,
        "user_id": character.user_id,
        "owner": character.user.username if character.user else None,
        "name": character.name,
        "thumbnail": character.thumbnail,
        "detail_image": character.detail_image,
        "location_id": character.location_id,
        "alt_name": character.alt_name,
        "nickname": character.nickname,
        "age": character.age,
        "serif": character.serif,
        "description": character.description,
        "comming_day": character.comming_day,
        "visible": character.visible,
        "is_my_doll": character.is_my_doll,
        "hidden_by_admin": bool(character.hidden_by_admin),
        "order_in_location": character.order_in_location,
        "layout": character.layout or "auto",
        "created_at": character.created_at,
        "updated_at": character.updated_at,
        "location": _serialize_location(location) if location else None,
        "head_doll": _serialize_doll(character.head_relationship),
        "body_doll": _serialize_doll(character.body_relationship),
        "relationships": [
            _serialize_relationship(relationship)
            for relationship in character.outgoing_relationships
            if relationship.related_character
            and (
                include_hidden
                or (
                    relationship.related_character.visible is not False
                    and not relationship.related_character.hidden_by_admin
                )
            )
        ],
    }


def _doll_is_referenced(
    db: Session,
    doll_id: int,
    character_id: int | None,
    other_part_id: int | None,
) -> bool:
    if other_part_id == doll_id:
        return True

    query = db.query(Character).filter(
        or_(Character.head == doll_id, Character.body == doll_id)
    )
    if character_id is not None:
        query = query.filter(Character.id != character_id)
    return query.first() is not None


def _doll_values(doll: Doll | None) -> tuple[str, str, str | None] | None:
    if doll is None:
        return None
    return (
        (doll.company or "").strip(),
        (doll.name or "").strip(),
        (doll.skin_tone or "").strip() or None,
    )


def _doll_input_values(
    doll_input: DollInput | None,
) -> tuple[str, str, str | None] | None:
    if doll_input is None:
        return None
    name = (doll_input.name or "").strip()
    if not name:
        return None
    return (
        (doll_input.company or "").strip(),
        name,
        (doll_input.skin_tone or "").strip() or None,
    )


def _sync_doll(
    db: Session,
    character: Character,
    part: str,
    doll_input: DollInput | None,
) -> bool:
    """Create or update the doll record linked to a head or body field.

    Returns whether the visible doll data changed, so the planner history does
    not record a no-op save or an internal doll-record replacement.
    """
    other_part = "body" if part == "head" else "head"
    current_id = getattr(character, part)
    current = (
        db.query(Doll).filter(Doll.id == current_id).first()
        if current_id
        else None
    )
    old_values = _doll_values(current)
    new_values = _doll_input_values(doll_input)
    other_part_id = getattr(character, other_part)

    if new_values is None:
        setattr(character, part, None)
        if current and not _doll_is_referenced(
            db, current.id, character.id, other_part_id
        ):
            db.delete(current)
        return old_values is not None

    company, name, skin_tone = new_values
    referenced = current is not None and _doll_is_referenced(
        db, current.id, character.id, other_part_id
    )

    if current and not referenced:
        current.company = company
        current.name = name
        current.skin_tone = skin_tone
        return old_values != new_values

    if referenced and old_values == new_values:
        return False

    doll = Doll(company=company, name=name, skin_tone=skin_tone)
    db.add(doll)
    db.flush()
    setattr(character, part, doll.id)
    return True


def _sync_relationships(
    db: Session,
    character: Character,
    items: list[CharacterRelationshipInput],
    user_id: int,
) -> None:
    """Replace the character's outgoing relationship links."""
    previous = sorted(
        (
            relationship.related_character_id,
            relationship.relationship_type or "",
        )
        for relationship in db.query(CharacterRelationship)
        .filter(CharacterRelationship.character_id == character.id)
        .all()
    )

    next_values: list[tuple[int, str]] = []
    seen: set[int] = set()
    for item in items:
        related_id = item.related_character_id
        if related_id == character.id or related_id in seen:
            continue
        seen.add(related_id)
        next_values.append(
            (related_id, (item.relationship_type or "").strip())
        )
    next_values.sort()

    if previous == next_values:
        return

    db.query(CharacterRelationship).filter(
        CharacterRelationship.character_id == character.id
    ).delete(synchronize_session=False)

    for related_id, relationship_type in next_values:
        related = (
            db.query(Character)
            .filter(
                Character.id == related_id,
                Character.user_id == user_id,
            )
            .first()
        )
        if not related:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="존재하지 않는 등장인물입니다.",
            )

        db.add(
            CharacterRelationship(
                character_id=character.id,
                related_character_id=related_id,
                relationship_type=relationship_type,
            )
        )

    queue_change(
        db,
        character,
        {"field": "relationships", "kind": "changed"},
    )


def _get_location_or_404(
    db: Session,
    location_id: int,
    user_id: int,
) -> Location:
    location = (
        db.query(Location)
        .filter(
            Location.id == location_id,
            Location.user_id == user_id,
        )
        .first()
    )
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist location",
        )
    return location


def _next_character_order(
    db: Session,
    location_id: int | None,
    user_id: int,
) -> int:
    max_order = (
        db.query(func.max(Character.order_in_location))
        .filter(
            Character.location_id == location_id,
            Character.user_id == user_id,
        )
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


def _next_location_order(db: Session, user_id: int) -> int:
    max_order = (
        db.query(func.max(Location.order))
        .filter(Location.user_id == user_id)
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


# Character CRUD Operations
def get_public_characters(db: Session, user_id: int):
    """Return only visible public-list characters for one author."""
    characters = (
        db.query(Character)
        .outerjoin(Location, Character.location_id == Location.id)
        .filter(
            Character.user_id == user_id,
            Character.is_my_doll.is_(True),
            Character.visible.isnot(False),
            Character.hidden_by_admin.is_(False),
        )
        .order_by(
            Location.order,
            Location.id,
            Character.order_in_location,
            Character.id,
        )
        .all()
    )
    return [_serialize_character_list_item(character) for character in characters]


def get_all_characters(db: Session, user_id: int | None = None):
    """
    Get all characters, or only one author's characters.
    """
    query = (
        db.query(Character)
        .options(
            selectinload(Character.outgoing_relationships).selectinload(
                CharacterRelationship.related_character
            )
        )
        .outerjoin(Location, Character.location_id == Location.id)
        .order_by(
            Location.order,
            Location.id,
            Character.order_in_location,
            Character.id,
        )
    )
    if user_id is not None:
        query = query.filter(Character.user_id == user_id)
    return [_serialize_character(character) for character in query.all()]


def get_character(
    db: Session,
    character_id: int,
    *,
    include_hidden: bool = False,
):
    """
    Get a single character.
    """
    character = (
        db.query(Character)
        .options(
            selectinload(Character.outgoing_relationships).selectinload(
                CharacterRelationship.related_character
            )
        )
        .filter(Character.id == character_id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )
    # Characters without the "my doll" mark are private profiles.
    if character.is_my_doll is not True or character.visible is False:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )
    if character.hidden_by_admin and not include_hidden:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )
    return _serialize_character(character, include_hidden=include_hidden)


def set_character_visibility(
    db: Session,
    character_id: int,
    *,
    hidden: bool,
):
    """Administrator-only public visibility toggle without editing content."""
    character = (
        db.query(Character)
        .options(
            selectinload(Character.outgoing_relationships).selectinload(
                CharacterRelationship.related_character
            )
        )
        .filter(Character.id == character_id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )

    character.hidden_by_admin = hidden
    db.commit()
    db.refresh(character)
    return _serialize_character(character, include_hidden=True)


def create_character(
    db: Session,
    character: CharacterCreate,
    user_id: int,
):
    """
    Create a new character owned by the signed-in author.
    """
    data = character.model_dump(
        exclude={
            "order_in_location",
            "relationships",
            "head_doll",
            "body_doll",
        }
    )

    if data.get("location_id") is not None:
        _get_location_or_404(db, data["location_id"], user_id)

    data["user_id"] = user_id
    data["order_in_location"] = (
        character.order_in_location
        if character.order_in_location is not None
        else _next_character_order(
            db,
            data.get("location_id"),
            user_id,
        )
    )

    db_character = Character(**data)
    db.add(db_character)
    db.flush()
    _sync_doll(db, db_character, "head", character.head_doll)
    _sync_doll(db, db_character, "body", character.body_doll)
    _sync_relationships(
        db,
        db_character,
        character.relationships,
        user_id,
    )
    db.commit()
    db.refresh(db_character)
    return _serialize_character(db_character)


def update_character(
    db: Session,
    character_id: int,
    updated: CharacterUpdate,
    user_id: int,
):
    """
    Update one of the signed-in author's characters.
    """
    character = (
        db.query(Character)
        .filter(
            Character.id == character_id,
            Character.user_id == user_id,
        )
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )

    old_thumbnail = character.thumbnail
    old_detail_image = character.detail_image

    data = updated.model_dump(
        exclude_unset=True,
        exclude={"relationships", "head_doll", "body_doll"},
    )

    # ``layout`` is NOT NULL; an explicit null should leave it unchanged.
    if data.get("layout") is None:
        data.pop("layout", None)

    if "location_id" in data and data["location_id"] is not None:
        _get_location_or_404(db, data["location_id"], user_id)

    if (
        "location_id" in data
        and "order_in_location" not in data
        and data["location_id"] != character.location_id
    ):
        data["order_in_location"] = _next_character_order(
            db,
            data["location_id"],
            user_id,
        )

    for key, value in data.items():
        setattr(character, key, value)

    if "head_doll" in updated.model_fields_set:
        if _sync_doll(db, character, "head", updated.head_doll):
            queue_change(
                db,
                character,
                {"field": "head_doll", "kind": "changed"},
            )
    if "body_doll" in updated.model_fields_set:
        if _sync_doll(db, character, "body", updated.body_doll):
            queue_change(
                db,
                character,
                {"field": "body_doll", "kind": "changed"},
            )
    if "relationships" in updated.model_fields_set:
        _sync_relationships(
            db,
            character,
            updated.relationships or [],
            user_id,
        )

    db.commit()
    db.refresh(character)

    if (
        old_thumbnail
        and "thumbnail" in data
        and old_thumbnail != character.thumbnail
    ):
        still_used = (
            db.query(Character)
            .filter(Character.thumbnail == old_thumbnail)
            .first()
        )
        if not still_used:
            delete_replaced_upload(old_thumbnail, character.thumbnail)

    if (
        old_detail_image
        and "detail_image" in data
        and old_detail_image != character.detail_image
    ):
        still_used = (
            db.query(Character)
            .filter(Character.detail_image == old_detail_image)
            .first()
        )
        if not still_used:
            delete_replaced_upload(
                old_detail_image,
                character.detail_image,
            )

    return _serialize_character(character)


def delete_character(
    db: Session,
    character_id: int,
    user_id: int | None = None,
):
    """
    Delete a character. Administrators may delete any author's character.
    """
    query = db.query(Character).filter(Character.id == character_id)
    if user_id is not None:
        query = query.filter(Character.user_id == user_id)
    character = query.first()
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist character",
        )

    db.query(CharacterRelationship).filter(
        (CharacterRelationship.character_id == character_id)
        | (CharacterRelationship.related_character_id == character_id)
    ).delete(synchronize_session=False)

    thumbnail = character.thumbnail
    detail_image = character.detail_image
    doll_ids = {
        doll_id for doll_id in (character.head, character.body) if doll_id
    }
    db.delete(character)
    db.flush()

    for doll_id in doll_ids:
        is_referenced = (
            db.query(Character)
            .filter(
                or_(Character.head == doll_id, Character.body == doll_id)
            )
            .first()
        )
        if is_referenced:
            continue
        doll = db.query(Doll).filter(Doll.id == doll_id).first()
        if doll:
            db.delete(doll)

    db.commit()

    if thumbnail:
        still_used = (
            db.query(Character)
            .filter(Character.thumbnail == thumbnail)
            .first()
        )
        if not still_used:
            delete_uploaded_file(thumbnail)

    if detail_image:
        still_used = (
            db.query(Character)
            .filter(Character.detail_image == detail_image)
            .first()
        )
        if not still_used:
            delete_uploaded_file(detail_image)

    return True


def reorder_characters(
    db: Session,
    payload: CharacterReorderRequest,
    user_id: int,
):
    """
    Persist the order and location of the author's characters.
    """
    ids = [item.id for item in payload.items]
    characters = {
        character.id: character
        for character in (
            db.query(Character)
            .filter(
                Character.id.in_(ids),
                Character.user_id == user_id,
            )
            .all()
        )
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
                _get_location_or_404(db, item.location_id, user_id)
                character.location_id = item.location_id
            character.order_in_location = item.order_in_location
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True


# Character Location CRUD Operations
def get_all_locations(db: Session, user_id: int):
    """
    Get the signed-in author's character locations.
    """
    locations = (
        db.query(Location)
        .filter(Location.user_id == user_id)
        .order_by(Location.order, Location.id)
        .all()
    )
    return [_serialize_location(location) for location in locations]


def create_location(
    db: Session,
    location: LocationCreate,
    user_id: int,
):
    """
    Create a new character location owned by the signed-in author.
    """
    order = (
        location.order
        if location.order is not None
        else _next_location_order(db, user_id)
    )
    db_location = Location(
        user_id=user_id,
        name=location.name,
        description=location.description,
        order=order,
    )
    db.add(db_location)
    db.commit()
    db.refresh(db_location)
    return _serialize_location(db_location)


def update_location(
    db: Session,
    location_id: int,
    updated: LocationUpdate,
    user_id: int,
):
    """
    Update one of the signed-in author's locations.
    """
    location = _get_location_or_404(db, location_id, user_id)

    for key, value in updated.model_dump(exclude_unset=True).items():
        setattr(location, key, value)

    db.commit()
    db.refresh(location)
    return _serialize_location(location)


def delete_location(
    db: Session,
    location_id: int,
    owner_user_id: int | None,
):
    """Delete a character location.

    ``owner_user_id=None`` is reserved for administrator deletion and skips
    the owner filter.
    """
    query = db.query(Location).filter(Location.id == location_id)
    if owner_user_id is not None:
        query = query.filter(Location.user_id == owner_user_id)
    location = query.first()
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


def reorder_locations(
    db: Session,
    payload: LocationReorderRequest,
    user_id: int,
):
    """
    Persist the display order of the signed-in author's locations.
    """
    ids = [item.id for item in payload.items]
    locations = {
        location.id: location
        for location in (
            db.query(Location)
            .filter(
                Location.id.in_(ids),
                Location.user_id == user_id,
            )
            .all()
        )
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
