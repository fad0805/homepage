import hashlib

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.orm import Session

from core.uploads import save_banner
from crud.books import (
    create_chapter,
    delete_chapter,
    get_all_chapters,
    get_chapter,
    register_chapter_view,
    reorder_chapters,
    update_chapter,
)
from db.session import get_db
from schemas.books import (
    ChapterCreate,
    ChapterReorderRequest,
    ChapterUpdate,
)
from .utils import require_auth

router = APIRouter()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


@router.post("/upload")
async def upload_chapter_image(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """Upload an image used inside a chapter body."""
    url = await save_banner(file, folder="chapters")
    return {"url": url}


@router.get("/")
@router.get("")
def get_chapters(db: Session = Depends(get_db)):
    return get_all_chapters(db)


@router.post("/")
@router.post("")
def post_chapter(
    payload: ChapterCreate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return create_chapter(db, payload)


@router.put("/reorder")
def put_chapter_order(
    payload: ChapterReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return reorder_chapters(db, payload)


@router.post("/{chapter_id}/view")
def post_chapter_view(
    chapter_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    ip_hash = hashlib.sha256(_client_ip(request).encode()).hexdigest()
    return register_chapter_view(db, chapter_id, ip_hash)


@router.get("/{chapter_id}")
def get_chapter_detail(chapter_id: int, db: Session = Depends(get_db)):
    return get_chapter(db, chapter_id)


@router.put("/{chapter_id}")
def put_chapter(
    chapter_id: int,
    payload: ChapterUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return update_chapter(db, chapter_id, payload)


@router.delete("/{chapter_id}")
def remove_chapter(
    chapter_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return delete_chapter(db, chapter_id)
