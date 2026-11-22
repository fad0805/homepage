import hashlib
import json
import logging
import shutil
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

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
    ALLOWED_CONTENT_TYPES,
    MAX_STAGING_PART_BYTES,
    MAX_STAGING_REPRESENTATIVE_BYTES,
    MAX_UPLOAD_SIZE,
    MAX_VIDEO_UPLOAD_SIZE,
    VIDEO_CONVERSION_ATTEMPTS,
    VIDEO_CONTENT_TYPES,
    _read_upload,
    assemble_staged_file,
    cleanup_stale_staging_sessions,
    convert_video_file_to_webp_bytes,
    delete_uploaded_file,
    save_banner,
    save_converted_webp_bytes,
    save_uploaded_bytes,
    staging_session_dir,
    stream_upload_to_path,
    validate_upload_batch,
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


def _process_staged_upload(
    illustration_id: int,
    user_id: int,
    session_dir: Path,
    meta: dict[str, Any],
) -> None:
    """Assemble and convert staged files, then publish the illustration."""
    db = SessionLocal()
    gallery_urls: list[str] = []
    cleanup_urls: list[str] = []
    committed = False
    video_failed = False
    try:
        for entry in meta["files"]:
            file_dir = session_dir / f"{entry['index']:04d}"
            if entry["video"]:
                suffix = VIDEO_CONTENT_TYPES[entry["content_type"]]
                source = file_dir / f"source{suffix}"
                assemble_staged_file(
                    [
                        file_dir / f"{chunk:06d}.part"
                        for chunk in range(entry["chunk_count"])
                    ],
                    source,
                )
                converted_url: str | None = None
                for attempt in range(VIDEO_CONVERSION_ATTEMPTS):
                    try:
                        content = convert_video_file_to_webp_bytes(
                            source,
                            suffix,
                            max_seconds=entry.get("seconds"),
                            start_seconds=entry.get("start"),
                        )
                        converted_url = save_converted_webp_bytes(
                            content, folder="illustrations"
                        )
                        break
                    except Exception as exc:  # noqa: BLE001 - retry any failure
                        logger.warning(
                            "Staged video conversion failed "
                            "(illustration=%s, file=%s, attempt=%s): %s",
                            illustration_id,
                            entry["index"],
                            attempt + 1,
                            exc,
                        )
                        if attempt + 1 < VIDEO_CONVERSION_ATTEMPTS:
                            time.sleep(attempt + 1)
                if converted_url is None:
                    video_failed = True
                    continue
                url = converted_url
            else:
                content = (file_dir / "000000.part").read_bytes()
                url = save_uploaded_bytes(
                    content,
                    entry["content_type"],
                    folder="illustrations",
                )
            gallery_urls.append(url)
            cleanup_urls.append(url)

        representative_url: str | None = None
        if meta.get("representative_content_type"):
            representative = (session_dir / "representative.part").read_bytes()
            representative_url = save_uploaded_bytes(
                representative,
                meta["representative_content_type"],
                folder="illustrations",
                allow_video=False,
            )
            cleanup_urls.append(representative_url)

        if meta["purpose"] == "append":
            append_illustration_images(db, illustration_id, gallery_urls)
            if not video_failed:
                existing = (
                    db.query(Illustration)
                    .filter(
                        Illustration.id == illustration_id,
                        Illustration.user_id == user_id,
                    )
                    .first()
                )
                if existing is not None and existing.upload_status == "video_failed":
                    existing.upload_status = "ready"
                    db.commit()
        else:
            group = (
                db.query(Illustration)
                .filter(
                    Illustration.id == illustration_id,
                    Illustration.user_id == user_id,
                )
                .first()
            )
            if group is None:
                for saved in cleanup_urls:
                    delete_uploaded_file(saved)
                return
            finish_illustration_upload(
                db,
                illustration_id,
                gallery_urls,
                representative_url,
            )
            if video_failed:
                group.visible = False
                group.protected = False
                group.upload_status = "video_failed"
            db.commit()
            db.refresh(group)
            committed = True
            if not video_failed and group.visible:
                maybe_notify_illustration(db, group)
        committed = True
    except Exception:
        db.rollback()
        logger.exception(
            "Background staged upload failed for id=%s", illustration_id
        )
        if not committed:
            for saved in cleanup_urls:
                delete_uploaded_file(saved)
            try:
                pending = (
                    db.query(Illustration)
                    .filter(
                        Illustration.id == illustration_id,
                        Illustration.user_id == user_id,
                    )
                    .first()
                )
                if pending is not None and meta["purpose"] == "create":
                    db.delete(pending)
                    db.commit()
            except Exception:  # noqa: BLE001 - cleanup must not mask the original failure
                db.rollback()
    finally:
        db.close()
        shutil.rmtree(session_dir, ignore_errors=True)


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


def _write_staging_meta(session_dir: Path, meta: dict[str, Any]) -> None:
    target = session_dir / "meta.json"
    temporary = session_dir / "meta.tmp"
    temporary.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    temporary.replace(target)


def _read_staging_meta(session_dir: Path) -> dict[str, Any]:
    meta_path = session_dir / "meta.json"
    if not meta_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="업로드 세션이 없습니다. 처음부터 다시 올려주세요.",
        )
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="업로드 세션을 읽을 수 없습니다.",
        ) from exc


@router.post("/upload-stage")
async def stage_upload(
    request: Request,
    chunk: UploadFile = File(...),
    session_id: str = Form(...),
    file_index: int = Form(...),
    file_count: int = Form(...),
    chunk_index: int = Form(0),
    chunk_count: int = Form(1),
    file_name: str = Form(...),
    content_type: str = Form(""),
    total_size: int = Form(...),
    purpose: str = Form("create"),
    illustration_id: int | None = Form(None),
    title: str | None = Form(None),
    description: str | None = Form(None),
    tags: str | None = Form(None),
    taken_at: date | None = Form(None),
    visible: bool = Form(True),
    protected: bool = Form(False),
    video_start_seconds: float | None = Form(None),
    video_seconds: float | None = Form(None),
    representative_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Store one byte chunk of a staged illustration upload."""
    # A single video is split across many chunks, so do not count each chunk
    # as a separate video here. Video totals are validated in the session meta.
    validate_upload_batch([], request.headers.get("content-length"))
    cleanup_stale_staging_sessions()

    is_video = content_type in VIDEO_CONTENT_TYPES
    if not is_video and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="PNG, JPEG, WEBP, GIF 이미지 또는 MP4, MOV, WEBM 영상만 업로드할 수 있습니다.",
        )
    if purpose not in {"create", "append"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="업로드 방식이 올바르지 않습니다.",
        )
    if file_count < 1 or file_count > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="한 번에 최대 100개 파일까지 업로드할 수 있습니다.",
        )
    if file_index < 0 or file_index >= file_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="파일 순서가 올바르지 않습니다.",
        )
    if chunk_count < 1 or chunk_index < 0 or chunk_index >= chunk_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="청크 순서가 올바르지 않습니다.",
        )
    size_limit = MAX_VIDEO_UPLOAD_SIZE if is_video else MAX_UPLOAD_SIZE
    if total_size <= 0 or total_size > size_limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "영상" if is_video else "이미지"
            ) + f" 크기는 {size_limit // (1024 * 1024)}MB 이하여야 합니다.",
        )

    session_dir = staging_session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    meta_path = session_dir / "meta.json"
    if meta_path.exists():
        meta = _read_staging_meta(session_dir)
        if meta["user_id"] != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="다른 사용자의 업로드 세션입니다.",
            )
        if (
            meta["purpose"] != purpose
            or meta["file_count"] != file_count
            or meta.get("illustration_id") != illustration_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="업로드 세션 정보가 일치하지 않습니다.",
            )
    else:
        if file_index != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="첫 파일부터 순서대로 올려주세요.",
            )
        if taken_at is not None and taken_at > today_kst():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="촬영 일자는 오늘 이후로 지정할 수 없습니다.",
            )
        if purpose == "create":
            if not (title or "").strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="삽화 제목을 입력해주세요.",
                )
        else:
            if illustration_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="삽화 정보가 없습니다.",
                )
            _require_owned_illustration(db, illustration_id, user)
        meta = {
            "user_id": user.id,
            "purpose": purpose,
            "illustration_id": illustration_id,
            "file_count": file_count,
            "files": [],
            "details": {
                "title": (title or "").strip() or None,
                "description": (description or "").strip() or None,
                "tags": _parse_tags(tags),
                "taken_at": taken_at.isoformat() if taken_at else None,
                "visible": visible,
                "protected": bool(visible and protected),
            },
        }

    entry = {
        "index": file_index,
        "name": file_name,
        "content_type": content_type,
        "total_size": total_size,
        "video": is_video,
        "chunk_count": chunk_count,
        "start": video_start_seconds,
        "seconds": video_seconds,
    }
    if file_index == len(meta["files"]):
        if meta["files"]:
            previous = meta["files"][-1]
            previous_dir = session_dir / f"{previous['index']:04d}"
            received = len(list(previous_dir.glob("*.part")))
            if received != previous["chunk_count"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="이전 파일의 업로드가 끝나지 않았습니다.",
                )
        if is_video and sum(1 for item in meta["files"] if item["video"]) >= 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="삽화 한 개당 영상은 최대 5개까지 업로드할 수 있습니다.",
            )
        meta["files"].append(entry)
    elif file_index < len(meta["files"]):
        existing_entry = meta["files"][file_index]
        if (
            existing_entry["content_type"] != content_type
            or existing_entry["total_size"] != total_size
            or existing_entry["chunk_count"] != chunk_count
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="업로드 세션의 파일 정보가 일치하지 않습니다.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="파일을 순서대로 올려주세요.",
        )

    file_dir = session_dir / f"{file_index:04d}"
    received = {
        int(part.stem)
        for part in file_dir.glob("*.part")
        if part.stem.isdigit()
    }
    if any(index not in received for index in range(chunk_index)) or any(
        index > chunk_index for index in received
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="청크를 순서대로 올려주세요.",
        )
    # A client may retry a chunk whose metadata write did not complete.
    (file_dir / f"{chunk_index:06d}.part").unlink(missing_ok=True)
    await stream_upload_to_path(
        chunk,
        file_dir / f"{chunk_index:06d}.part",
        MAX_STAGING_PART_BYTES,
    )

    if representative_file is not None:
        if file_index != 0 or purpose != "create" or meta.get(
            "representative_content_type"
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="대표 이미지는 첫 요청에만 보낼 수 있습니다.",
            )
        if representative_file.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="대표 이미지는 PNG, JPEG, WEBP, GIF만 가능합니다.",
            )
        await stream_upload_to_path(
            representative_file,
            session_dir / "representative.part",
            MAX_STAGING_REPRESENTATIVE_BYTES,
        )
        meta["representative_content_type"] = representative_file.content_type

    if chunk_index == chunk_count - 1:
        received_size = sum(
            part.stat().st_size for part in file_dir.glob("*.part")
        )
        if received_size != total_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="업로드된 파일 크기가 일치하지 않습니다.",
            )

    _write_staging_meta(session_dir, meta)
    return {"accepted": True}


@router.post("/upload-finalize")
async def finalize_upload(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Publish a staged upload only after every file has arrived."""
    session_dir = staging_session_dir(session_id)
    meta = _read_staging_meta(session_dir)
    if meta["user_id"] != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 사용자의 업로드 세션입니다.",
        )
    if len(meta["files"]) != meta["file_count"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="모든 파일을 먼저 업로드해주세요.",
        )
    for entry in meta["files"]:
        file_dir = session_dir / f"{entry['index']:04d}"
        received = len(list(file_dir.glob("*.part")))
        if received != entry["chunk_count"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="모든 파일을 먼저 업로드해주세요.",
            )

    if meta["purpose"] == "append":
        illustration_id = meta["illustration_id"]
        _require_owned_illustration(db, illustration_id, user)
        background_tasks.add_task(
            _process_staged_upload,
            illustration_id,
            user.id,
            session_dir,
            meta,
        )
        return {"accepted": True, "illustration_id": illustration_id}

    details = meta["details"]
    taken_at = (
        date.fromisoformat(details["taken_at"]) if details["taken_at"] else None
    )
    detail = create_pending_illustration_group(
        db,
        user_id=user.id,
        title=details["title"],
        description=details["description"],
        tags=details["tags"],
        visible=details["visible"],
        protected=details["protected"],
        taken_at=taken_at,
    )
    background_tasks.add_task(
        _process_staged_upload,
        detail["id"],
        user.id,
        session_dir,
        meta,
    )
    response.status_code = status.HTTP_202_ACCEPTED
    return detail


@router.post("/bulk", response_model=IllustrationDetail)
async def upload_illustrations(
    request: Request,
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
    """Register one chunk of an illustration upload.

    The UI sends one file per request, trimming videos to 10 seconds first.
    ``illustration_id`` is the append path used for later chunks and the edit
    dialog; new groups return ``202`` with a `processing` row.
    """
    validate_upload_batch(files, request.headers.get("content-length"))

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
            include_unpublished=True,
            granted_illustrations=grants.illustrations,
            viewer_user_id=current_user.id,
        )

    illustration = get_visible_illustration(
        db,
        illustration_id,
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
