import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.uploads import MAX_UPLOAD_SIZE, save_banner
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


def _validate_external_image_url(url: str) -> None:
    """Reject non-http(s) and private-network image URLs."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="http 또는 https 이미지 URL만 사용할 수 있습니다.",
        )

    try:
        addresses = socket.getaddrinfo(parsed.hostname, None)
    except OSError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지 URL의 호스트를 확인할 수 없습니다.",
        )

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="내부 네트워크 주소는 사용할 수 없습니다.",
            )


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


@router.get("/image-proxy")
async def proxy_character_image(
    url: str,
    _=Depends(require_auth),
):
    """
    Fetch an external image through the API so it can be cropped in the
    browser without cross-origin canvas restrictions.
    """
    await run_in_threadpool(_validate_external_image_url, url)

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
