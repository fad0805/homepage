import hashlib
import json
from datetime import date

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from core.uploads import VIDEO_CONTENT_TYPES, delete_uploaded_file, save_banner
from crud.illustrations import (
    append_illustration_images,
    bulk_delete_illustrations,
    bulk_update_illustrations,
    create_illustration_group,
    delete_illustration,
    delete_illustration_image,
    get_all_illustrations,
    get_illustration_stats,
    get_popular_illustrations,
    get_visible_illustration,
    get_visible_illustrations,
    register_illustration_view,
    reorder_illustration_images,
    reorder_illustrations,
    set_illustration_representative,
    update_illustration,
)
from db.session import get_db
from models.illustrations import Illustration
from schemas.illustrations import (
    IllustrationAdminListItem,
    IllustrationAdminStats,
    IllustrationBulkDelete,
    IllustrationBulkUpdate,
    IllustrationDetail,
    IllustrationImageReorderRequest,
    IllustrationListItem,
    IllustrationReorderRequest,
    IllustrationUpdate,
    today_kst,
)

from .utils import (
    get_client_ip,
    get_default_author_id,
    get_gallery_grants,
    get_optional_user,
    is_admin,
    require_auth,
)

router = APIRouter()

MAX_BULK_ILLUSTRATIONS = 100


def _parse_tags(value: str | None) -> list[str]:
    return [tag.strip() for tag in (value or "").split(",") if tag.strip()]


def _require_owned_illustration(
    db: Session,
    illustration_id: int,
    user,
    *,
    allow_admin_delete: bool = False,
):
    query = db.query(Illustration).filter(
        Illustration.id == illustration_id
    )
    if not (allow_admin_delete and is_admin(user)):
        query = query.filter(Illustration.user_id == user.id)
    illustration = query.first()
    if not illustration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="삽화를 찾을 수 없습니다.",
        )
    return illustration


@router.get("", response_model=list[IllustrationListItem])
@router.get(
    "/",
    response_model=list[IllustrationListItem],
    include_in_schema=False,
)
def read_illustrations(
    request: Request,
    response: Response,
    q: str | None = None,
    tag: str | None = None,
    sort: str = "taken",
    filter_basis: str = Query("taken", alias="filter"),
    from_: date | None = Query(None, alias="from"),
    to: date | None = None,
    include_undated: bool = True,
    page: int = 1,
    page_size: int = 12,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """Return one page of illustrations with the total in a response header."""
    grants = get_gallery_grants(request, db)
    date_from, date_to = from_, to
    if date_from and date_to and date_from > date_to:
        date_from, date_to = date_to, date_from

    common = {
        "author_user_id": get_default_author_id(db),
        "query": q,
        "tag": tag,
        "sort": sort,
        "filter_basis": filter_basis,
        "date_from": date_from,
        "date_to": date_to,
        "include_undated": include_undated,
        "page": max(1, page),
        "page_size": max(1, min(page_size, 50)),
        "granted_illustrations": grants.illustrations,
    }
    if current_user is not None and is_admin(current_user):
        illustrations, total = get_visible_illustrations(
            db,
            include_hidden=True,
            **common,
        )
    else:
        illustrations, total = get_visible_illustrations(
            db,
            viewer_user_id=current_user.id if current_user else None,
            **common,
        )
    response.headers["X-Total-Count"] = str(total)
    return illustrations


@router.get("/admin", response_model=list[IllustrationAdminListItem])
def read_all_illustrations(
    response: Response,
    q: str | None = None,
    page: int = 1,
    page_size: int = 12,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Return one page of the user's illustration groups for the admin board."""
    illustrations, total = get_all_illustrations(
        db,
        user.id,
        query=q,
        page=max(1, page),
        page_size=max(1, min(page_size, 50)),
    )
    response.headers["X-Total-Count"] = str(total)
    return illustrations


@router.get("/admin/stats", response_model=IllustrationAdminStats)
def read_illustration_stats(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Return illustration totals and accumulated views for the dashboard."""
    return get_illustration_stats(db, user.id)


@router.get(
    "/admin/popular",
    response_model=list[IllustrationAdminListItem],
)
def read_popular_illustrations(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Return the user's most viewed illustrations for the dashboard."""
    return get_popular_illustrations(db, user.id, limit=limit)


@router.post("/bulk", response_model=IllustrationDetail)
async def upload_illustrations(
    files: list[UploadFile] = File(...),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    taken_at: date | None = Form(default=None),
    representative_index: int = Form(default=0),
    illustration_id: int | None = Form(default=None),
    visible: bool = Form(default=True),
    protected: bool = Form(default=False),
    video_ranges: str | None = Form(default=None),
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

    if illustration_id is not None:
        _require_owned_illustration(db, illustration_id, user)

    parsed_ranges: list[tuple[float, float]] = []
    if video_ranges:
        try:
            raw_ranges = json.loads(video_ranges)
            if isinstance(raw_ranges, list):
                for item in raw_ranges:
                    parsed_ranges.append(
                        (
                            float(item.get("start", 0)),
                            float(item.get("seconds", 0)),
                        )
                    )
        except (AttributeError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="영상 자르기 구간 값이 올바르지 않습니다.",
            ) from exc

    uploaded: list[str] = []
    requested_ranges = iter(parsed_ranges)
    try:
        for file in files:
            is_video = file.content_type in VIDEO_CONTENT_TYPES
            selected_range = next(requested_ranges, None) if is_video else None
            url = await save_banner(
                file,
                folder="illustrations",
                allow_video=True,
                max_video_seconds=selected_range[1] if selected_range else None,
                video_start_seconds=(
                    selected_range[0] if selected_range else None
                ),
            )
            uploaded.append(url)

        if illustration_id is None:
            return create_illustration_group(
                db,
                user_id=user.id,
                title=normalized_title,
                description=normalized_description,
                tags=_parse_tags(tags),
                uploads=uploaded,
                taken_at=taken_at,
                representative_index=representative_index,
                visible=visible,
                protected=protected,
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
    user=Depends(require_auth),
):
    """Persist the display order of the user's illustration groups."""
    return reorder_illustrations(db, payload, user.id)


@router.patch("/bulk")
def patch_illustrations_bulk(
    payload: IllustrationBulkUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Apply changes to the user's selected groups."""
    updated = bulk_update_illustrations(db, payload, user.id)
    return {"updated": updated}


@router.post("/bulk-delete")
def delete_illustrations_bulk(
    payload: IllustrationBulkDelete,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Delete the user's selected groups and their files."""
    deleted = bulk_delete_illustrations(
        db,
        payload.ids,
        None if is_admin(user) else user.id,
    )
    return {"deleted": deleted}


@router.put(
    "/{illustration_id}/images/reorder",
    response_model=IllustrationDetail,
)
def put_illustration_image_order(
    illustration_id: int,
    payload: IllustrationImageReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Persist the order of photos inside one of the user's groups."""
    _require_owned_illustration(db, illustration_id, user)
    return reorder_illustration_images(db, illustration_id, payload)


@router.delete(
    "/{illustration_id}/images/{image_id}",
    response_model=IllustrationDetail,
)
def remove_illustration_image(
    illustration_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Delete one photo from one of the user's groups."""
    _require_owned_illustration(db, illustration_id, user)
    return delete_illustration_image(db, illustration_id, image_id)


@router.put(
    "/{illustration_id}/representative",
    response_model=IllustrationDetail,
)
async def put_illustration_representative(
    illustration_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Upload a separately cropped representative image."""
    _require_owned_illustration(db, illustration_id, user)
    url = await save_banner(file, folder="illustrations")
    try:
        return set_illustration_representative(
            db,
            illustration_id,
            url,
        )
    except Exception:
        delete_uploaded_file(url)
        raise


@router.post("/{illustration_id}/view")
def post_illustration_view(
    illustration_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """Count one anonymous view of a public illustration."""
    ip_hash = hashlib.sha256(get_client_ip(request).encode()).hexdigest()
    return register_illustration_view(
        db,
        illustration_id,
        ip_hash,
        count=current_user is None,
    )


@router.get("/{illustration_id}", response_model=IllustrationDetail)
def read_illustration(
    illustration_id: int,
    request: Request,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """Return a single illustration, hiding images until it is unlocked."""
    grants = get_gallery_grants(request, db)
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="로그인이 필요합니다.",
            )
        return get_visible_illustration(
            db,
            illustration_id,
            owner_user_id=current_user.id,
            include_hidden=True,
            granted_illustrations=grants.illustrations,
            viewer_user_id=current_user.id,
        )

    if current_user is not None and is_admin(current_user):
        illustration = get_visible_illustration(
            db,
            illustration_id,
            include_hidden=True,
        )
    else:
        illustration = get_visible_illustration(
            db,
            illustration_id,
            include_hidden=current_user is not None,
            granted_illustrations=grants.illustrations,
            viewer_user_id=current_user.id if current_user else None,
        )
    if illustration.get("user_id") != get_default_author_id(db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="삽화를 찾을 수 없습니다.",
        )
    return illustration


@router.put("/{illustration_id}", response_model=IllustrationDetail)
def modify_illustration(
    illustration_id: int,
    payload: IllustrationUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Update one of the user's illustrations."""
    _require_owned_illustration(db, illustration_id, user)
    return update_illustration(db, illustration_id, payload)


@router.delete("/{illustration_id}")
def remove_illustration(
    illustration_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Delete one of the user's groups and all its uploaded files."""
    _require_owned_illustration(
        db,
        illustration_id,
        user,
        allow_admin_delete=True,
    )
    return delete_illustration(db, illustration_id)
