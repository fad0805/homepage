from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from core.uploads import save_banner
from db.session import get_db
from crud.characters import (
    create_character,
    create_location,
    delete_character,
    delete_location,
    get_all_characters,
    get_all_locations,
    get_character,
    reorder_characters,
    reorder_locations,
    update_character,
    update_location,
)
from schemas.characters import (
    CharacterCreate,
    CharacterReorderRequest,
    CharacterUpdate,
    LocationCreate,
    LocationReorderRequest,
    LocationUpdate,
    UploadResponse,
)
from .utils import require_auth

router = APIRouter()


# Character Locations
# Static paths must be declared before "/{character_id}" so they are not
# captured by the dynamic route.
@router.get("/locations")
def get_locations(db: Session = Depends(get_db)):
    """
    Get all character locations.
    """
    return get_all_locations(db)


@router.post("/locations")
def post_location(
    location: LocationCreate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Create a new character location.
    """
    return create_location(db, location)


@router.put("/locations/reorder")
def put_location_order(
    payload: LocationReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Persist the display order of character locations.
    """
    return reorder_locations(db, payload)


@router.put("/locations/{location_id}")
def modify_location(
    location_id: int,
    location: LocationUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Update an existing character location.
    """
    return update_location(db, location_id, location)


@router.delete("/locations/{location_id}")
def remove_location(
    location_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Delete a character location.
    """
    return delete_location(db, location_id)


# Characters
@router.get("/")
@router.get("")
def get_characters(db: Session = Depends(get_db)):
    """
    Get all characters.
    """
    return get_all_characters(db)


@router.post("/")
@router.post("")
def post_character(
    character: CharacterCreate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Create a new character.
    """
    return create_character(db, character)


@router.put("/reorder")
def put_character_order(
    payload: CharacterReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Persist the display order of characters.
    """
    return reorder_characters(db, payload)


@router.post("/upload", response_model=UploadResponse)
async def upload_character_thumbnail(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """
    Upload a thumbnail image and return its public URL.
    """
    url = await save_banner(file, folder="characters")
    return {"url": url}


@router.get("/{character_id}")
def get_character_detail(character_id: int, db: Session = Depends(get_db)):
    """
    Get a single character.
    """
    return get_character(db, character_id)


@router.put("/{character_id}")
def modify_character(
    character_id: int,
    character: CharacterUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Update an existing character.
    """
    return update_character(db, character_id, character)


@router.delete("/{character_id}")
def remove_character(
    character_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Delete a character.
    """
    return delete_character(db, character_id)
