import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import date

from fastapi import (
    APIRouter,
    BackgroundTasks,
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

from core.mastodon import maybe_notify_illustration
from core.uploads import (
    MAX_UPLOAD_SIZE,
    MAX_VIDEO_UPLOAD_SIZE,
    VIDEO_CONTENT_TYPES,
    _read_upload,
    delete_uploaded_file,
    save_banner,
    save_uploaded_bytes,
)
from crud.illustrations import (
    append_illustration_images,
    bulk_delete_illustrations,
    bulk_update_illustrations,
    create_pending_illustration_group,
    delete_illustration,
    delete_illustration_image,
    finish_illustration_upload,
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
from db.session import SessionLocal, get_db
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

logger = logging.getLogger(__name__)
MAX_BULK_ILLUSTRATIONS = 100


@dataclass(frozen=True)
class PendingIllustrationFile:
    content: bytes
    content_type: str | None
    max_seconds: float | None = None
    start_seconds: float | None = None


async def _capture_upload(
    file: UploadFile,
    *,
    allow_video: bool = True,
    max_seconds: float | None = None,
    start_seconds: float | None = None,
) -> PendingIllustrationFile:
    """Read an upload before the request ends so a task can process it later."""
    is_video = bool(file.content_type in VIDEO_CONTENT_TYPES and allow_video)
    try:
        content = await _read_upload(
            file,
            limit=MAX_VIDEO_UPLOAD_SIZE if is_video else MAX_UPLOAD_SIZE,
            label="영상" if is_video else "이미지",
        )
    finally:
        await file.close()
    return PendingIllustrationFile(
        content=content,
        content_type=file.content_type,
        max_seconds=max_seconds,
        start_seconds=start_seconds,
    )


def _process_illustration_upload(
    illustration_id: int,
    user_id: int,
    files: list[PendingIllustrationFile],
    representative: PendingIllustrationFile | None,
) -> None:
    """Save files off the request path, then publish or remove the row."""
    db = SessionLocal()
    gallery_urls: list[str] = []
    cleanup_urls: list[str] = []
    committed = False
    try:
        for item in files:
            url = save_uploaded_bytes(
                item.content,
                item.content_type,
                folder="illustrations",
                allow_video=True,
                max_video_seconds=item.max_seconds,
                video_start_seconds=item.start_seconds,
            )
            gallery_urls.append(url)
            cleanup_urls.append(url)
        representative_url: str | None = None
        if representative is not None:
            representative_url = save_uploaded_bytes(
                representative.content,
                representative.content_type,
                folder="illustrations",
                allow_video=False,
            )
            cleanup_urls.append(representative_url)

        group = (
            db.query(Illustration)
            .filter(
                Illustration.id == illustration_id,
                Illustration.user_id == user_id,
            )
            .first()
        )
        if group is None:
            # The admin deleted the row while the upload was running.
            for url in cleanup_urls:
                delete_uploaded_file(url)
            return

        finish_illustration_upload(
            db,
            illustration_id,
            gallery_urls,
            representative_url,
        )
        committed = True
        db.refresh(group)
        if group.visible:
            maybe_notify_illustration(db, group)
    except Exception:
        db.rollback()
        logger.exception(
            "Background illustration upload failed for id=%s", illustration_id
        )
        if not committed:
            for url in cleanup_urls:
                delete_uploaded_file(url)
            try:
                pending = (
                    db.query(Illustration)
                    .filter(
                        Illustration.id == illustration_id,
                        Illustration.user_id == user_id,
                    )
                    .first()
                )
                if pending is not None:
                    db.delete(pending)
                    db.commit()
            except Exception:  # noqa: BLE001 - cleanup must never mask the original failure
                db.rollback()
    finally:
        db.close()


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
    background_tasks: BackgroundTasks,
    response: Response,
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
    representative_file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Register an illustration immediately and save its files in background.

    ``illustration_id`` keeps the older synchronous append path used by the
    edit dialog. New groups return ``202`` with a `processing` row; a failed
    background job removes that row entirely.
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

    requested_ranges = iter(parsed_ranges)

    if illustration_id is not None:
        uploaded: list[str] = []
        try:
            for file in files:
                is_video = file.content_type in VIDEO_CONTENT_TYPES
                selected_range = next(requested_ranges, None) if is_video else None
                uploaded.append(
                    await save_banner(
                        file,
                        folder="illustrations",
                        allow_video=True,
                        max_video_seconds=(
                            selected_range[1] if selected_range else None
                        ),
                        video_start_seconds=(
                            selected_range[0] if selected_range else None
                        ),
                    )
                )
            return append_illustration_images(
                db,
                illustration_id=illustration_id,
                uploads=uploaded,
            )
        except Exception:
            for url in uploaded:
                delete_uploaded_file(url)
            raise

    pending_files: list[PendingIllustrationFile] = []
    for file in files:
        is_video = file.content_type in VIDEO_CONTENT_TYPES
        selected_range = next(requested_ranges, None) if is_video else None
        pending_files.append(
            await _capture_upload(
                file,
                max_seconds=(selected_range[1] if selected_range else None),
                start_seconds=(selected_range[0] if selected_range else None),
            )
        )
    pending_representative = (
        await _capture_upload(representative_file, allow_video=False)
        if representative_file is not None
        else None
    )

    detail = create_pending_illustration_group(
        db,
        user_id=user.id,
        title=normalized_title,
        description=normalized_description,
        tags=_parse_tags(tags),
        visible=visible,
        protected=protected,
        taken_at=taken_at,
    )
    background_tasks.add_task(
        _process_illustration_upload,
        detail["id"],
        user.id,
        pending_files,
        pending_representative,
    )
    response.status_code = status.HTTP_202_ACCEPTED
    return detail


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
