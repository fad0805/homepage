import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.uploads import MAX_UPLOAD_SIZE, save_banner
from core.url_safety import validate_external_url
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
from .utils import get_optional_user, is_admin, require_auth

router = APIRouter()


# Character Locations
# Static paths must be declared before "/{character_id}" so they are not
# captured by the dynamic route.
@router.get("/locations")
def get_locations(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Get the signed-in author's character locations.
    """
    return get_all_locations(db, user.id)


@router.post("/locations")
def post_location(
    location: LocationCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Create a new character location.
    """
    return create_location(db, location, user.id)


@router.put("/locations/reorder")
def put_location_order(
    payload: LocationReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Persist the display order of the signed-in author's locations.
    """
    return reorder_locations(db, payload, user.id)


@router.put("/locations/{location_id}")
def modify_location(
    location_id: int,
    location: LocationUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Update one of the signed-in author's locations.
    """
    return update_location(db, location_id, location, user.id)


@router.delete("/locations/{location_id}")
def remove_location(
    location_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Delete one of the signed-in author's locations.
    """
    return delete_location(db, location_id, user.id)


# Characters
@router.get("/")
@router.get("")
def get_characters(
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """
    Get all characters, or only the signed-in author's characters.
    """
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_all_characters(db, user_id=current_user.id)
    return get_all_characters(db)


@router.post("/")
@router.post("")
def post_character(
    character: CharacterCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Create a new character owned by the signed-in author.
    """
    return create_character(db, character, user.id)


@router.put("/reorder")
def put_character_order(
    payload: CharacterReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Persist the display order of the author's characters.
    """
    return reorder_characters(db, payload, user.id)


@router.get("/image-proxy")
async def proxy_character_image(
    url: str,
    _=Depends(require_auth),
):
    """
    Fetch an external image through the API so it can be cropped in the
    browser without cross-origin canvas restrictions.
    """
    await run_in_threadpool(
        validate_external_url,
        url,
        resource_label="이미지 URL",
    )

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(10.0),
            headers={"User-Agent": "homepage-image-proxy/1.0"},
        ) as client:
            async with client.stream("GET", url) as response:
                if response.status_code != status.HTTP_200_OK:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="이미지를 불러오지 못했습니다.",
                    )

                content_type = (
                    response.headers.get("content-type", "")
                    .split(";")[0]
                    .strip()
                    .lower()
                )
                if not content_type.startswith("image/"):
                    raise HTTPException(
                        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                        detail="이미지 URL이 아닙니다.",
                    )

                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_UPLOAD_SIZE:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=(
                                "이미지 크기는 "
                                f"{MAX_UPLOAD_SIZE // (1024 * 1024)}MB 이하여야 "
                                "합니다."
                            ),
                        )
                    chunks.append(chunk)
    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지를 불러오지 못했습니다.",
        )

    return Response(
        content=b"".join(chunks),
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=300"},
    )


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
    user=Depends(require_auth),
):
    """
    Update one of the signed-in author's characters.
    """
    return update_character(db, character_id, character, user.id)


@router.delete("/{character_id}")
def remove_character(
    character_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Delete a character. Administrators may delete any author's character.
    """
    return delete_character(
        db,
        character_id,
        None if is_admin(user) else user.id,
    )
