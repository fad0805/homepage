from datetime import date
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from core.uploads import delete_uploaded_file, save_banner
from crud.illustrations import (
    append_illustration_images,
    bulk_delete_illustrations,
    bulk_update_illustrations,
    create_illustration_group,
    delete_illustration,
    delete_illustration_image,
    get_all_illustrations,
    get_visible_illustration,
    get_visible_illustrations,
    reorder_illustration_images,
    reorder_illustrations,
    set_illustration_representative,
    update_illustration,
)
from db.session import get_db
from schemas.illustrations import (
    IllustrationBulkDelete,
    IllustrationBulkUpdate,
    IllustrationDetail,
    IllustrationImageReorderRequest,
    IllustrationListItem,
    IllustrationReorderRequest,
    IllustrationUpdate,
    today_kst,
)
from .utils import get_gallery_grants, get_optional_user, require_auth

router = APIRouter()

MAX_BULK_ILLUSTRATIONS = 100


def _parse_tags(value: str | None) -> list[str]:
    return [tag.strip() for tag in (value or "").split(",") if tag.strip()]


@router.get("", response_model=list[IllustrationListItem])
@router.get(
    "/",
    response_model=list[IllustrationListItem],
    include_in_schema=False,
)
def read_illustrations(db: Session = Depends(get_db)):
    """Return the public illustration gallery."""
    return get_visible_illustrations(db)


@router.get("/admin", response_model=list[IllustrationDetail])
def read_all_illustrations(
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Return every illustration group for the admin board."""
    return get_all_illustrations(db)


@router.post("/bulk", response_model=IllustrationDetail)
async def upload_illustrations(
    files: list[UploadFile] = File(...),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    taken_at: date | None = Form(default=None),
    representative_index: int = Form(default=0),
    illustration_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Upload several photos as one illustration group.

    ``illustration_id`` lets the client append later batches to the same
    group, so large uploads still become a single board entry.
    """
    if len(files) > MAX_BULK_ILLUSTRATIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"한 번에 최대 {MAX_BULK_ILLUSTRATIONS}장까지 업로드할 수 "
                "있습니다."
            ),
        )

    if taken_at is not None and taken_at > today_kst():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="촬영 일자는 오늘 이후로 지정할 수 없습니다.",
        )

    normalized_title = (title or "").strip()
    if illustration_id is None and not normalized_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="삽화 제목을 입력해주세요.",
        )
    normalized_description = (description or "").strip() or None

    uploaded: list[tuple[str, str | None]] = []
    try:
        for file in files:
            original_name = Path(file.filename or "").name[:255] or None
            url = await save_banner(file, folder="illustrations")
            uploaded.append((url, original_name))

        if illustration_id is None:
            return create_illustration_group(
                db,
                owner=getattr(user, "username", "admin"),
                title=normalized_title,
                description=normalized_description,
                tags=_parse_tags(tags),
                uploads=uploaded,
                taken_at=taken_at,
                representative_index=representative_index,
            )

        return append_illustration_images(
            db,
            illustration_id=illustration_id,
            uploads=uploaded,
        )
    except Exception:
        for url, _ in uploaded:
            delete_uploaded_file(url)
        raise


@router.put("/reorder")
def put_illustration_order(
    payload: IllustrationReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Persist the display order of illustration groups."""
    return reorder_illustrations(db, payload)


@router.patch("/bulk")
def patch_illustrations_bulk(
    payload: IllustrationBulkUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Apply visibility or shooting date changes to selected groups."""
    updated = bulk_update_illustrations(db, payload)
    return {"updated": updated}


@router.post("/bulk-delete")
def delete_illustrations_bulk(
    payload: IllustrationBulkDelete,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Delete selected illustration groups and their files."""
    deleted = bulk_delete_illustrations(db, payload.ids)
    return {"deleted": deleted}


@router.put(
    "/{illustration_id}/images/reorder",
    response_model=IllustrationDetail,
)
def put_illustration_image_order(
    illustration_id: int,
    payload: IllustrationImageReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Persist the order of photos inside one illustration."""
    return reorder_illustration_images(db, illustration_id, payload)


@router.delete(
    "/{illustration_id}/images/{image_id}",
    response_model=IllustrationDetail,
)
def remove_illustration_image(
    illustration_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Delete one photo from an illustration group."""
    return delete_illustration_image(db, illustration_id, image_id)


@router.put(
    "/{illustration_id}/representative",
    response_model=IllustrationDetail,
)
async def put_illustration_representative(
    illustration_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Upload a separately cropped representative image."""
    original_name = Path(file.filename or "").name[:255] or None
    url = await save_banner(file, folder="illustrations")
    try:
        return set_illustration_representative(
            db,
            illustration_id,
            url,
            original_name,
        )
    except Exception:
        delete_uploaded_file(url)
        raise


@router.get("/{illustration_id}", response_model=IllustrationDetail)
def read_illustration(
    illustration_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """Return a single illustration, hiding images until it is unlocked."""
    grants = get_gallery_grants(request, db)
    return get_visible_illustration(
        db,
        illustration_id,
        include_hidden=current_user is not None,
        granted_illustrations=grants.illustrations,
    )


@router.put("/{illustration_id}", response_model=IllustrationDetail)
def modify_illustration(
    illustration_id: int,
    payload: IllustrationUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Update an illustration caption, dates, visibility or cover image."""
    return update_illustration(db, illustration_id, payload)


@router.delete("/{illustration_id}")
def remove_illustration(
    illustration_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Delete an illustration group and all its uploaded files."""
    return delete_illustration(db, illustration_id)
