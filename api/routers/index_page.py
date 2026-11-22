from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from core.uploads import save_banner
from crud.index_page import (
    get_index_page_read,
    update_index_page,
)
from db.session import get_db
from routers.utils import is_admin, require_auth
from schemas.index_page import IndexPageRead, IndexPageUpdate

router = APIRouter()


@router.get("", response_model=IndexPageRead)
def read_index_page(
    scope: str = "integrated",
    user_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Return a public integrated or author index page."""
    if scope not in ("integrated", "author"):
        raise HTTPException(status_code=400, detail="잘못된 인덱스 범위입니다.")
    if scope == "author" and user_id is None:
        raise HTTPException(status_code=400, detail="작가를 지정해주세요.")
    return get_index_page_read(db, scope=scope, user_id=user_id)


@router.get("/mine", response_model=IndexPageRead)
def read_my_index_page(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Return the signed-in author's index page."""
    return get_index_page_read(db, scope="author", user_id=user.id)


@router.put("", response_model=IndexPageRead)
def put_index_page(
    payload: IndexPageUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Update the signed-in author's index or the admin-only integrated index."""
    if payload.scope == "integrated" and not is_admin(user):
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")

    target_user_id = user.id if payload.scope == "author" else None
    return update_index_page(
        db,
        scope=payload.scope,
        user_id=target_user_id,
        content_html=payload.content_html,
        title=payload.title,
        subtitle=payload.subtitle,
        copyright_name=payload.copyright_name,
    )


@router.post("/upload")
async def upload_index_image(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """Upload an image used inside the main index content."""
    url = await save_banner(file, folder="index")
    return {"url": url}
