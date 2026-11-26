import hashlib

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from core.image_urls import public_url
from core.uploads import save_banner
from crud.books import (
    create_chapter,
    delete_chapter,
    get_all_chapters,
    get_chapter,
    get_chapters_page,
    register_chapter_view,
    reorder_chapters,
    search_chapters_for_owner,
    set_chapter_visibility,
    update_chapter,
)
from db.session import get_db
from schemas.books import (
    ChapterCreate,
    ChapterReorderRequest,
    ChapterUpdate,
)
from schemas.visibility import AdminVisibilityUpdate

from .utils import (
    get_client_ip,
    get_default_author_id,
    get_gallery_grants,
    get_optional_user,
    is_admin,
    owner_or_admin_delete_scope,
    require_admin,
    require_auth,
)

router = APIRouter()


@router.post("/upload")
async def upload_chapter_image(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """Upload an image used inside a chapter body."""
    key = await save_banner(file, folder="chapters")
    return {"url": public_url(key)}


@router.get("/")
@router.get("")
def get_chapters(
    request: Request,
    response: Response,
    mine: bool = False,
    q: str | None = None,
    tag: str | None = None,
    book_id: int | None = None,
    pinned: bool | None = None,
    include_body: bool = True,
    ids_only: bool = False,
    sort: str = "newest",
    page: int | None = None,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    grants = get_gallery_grants(request, db)
    filters: dict = {
        "query": q,
        "tag": tag,
        "book_id": book_id,
        "pinned": pinned,
        "include_body": include_body,
        "ids_only": ids_only,
    }
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        filters.update(
            include_hidden=True,
            owner_user_id=current_user.id,
        )
    else:
        author_id = get_default_author_id(db)
        if author_id is None:
            return []
        filters["author_user_id"] = author_id
        if current_user is not None and is_admin(current_user):
            filters["include_hidden"] = True
        else:
            filters.update(
                include_hidden=current_user is not None,
                granted_chapters=grants.chapters,
                granted_books=grants.books,
                granted_categories=grants.categories,
                viewer_user_id=current_user.id if current_user else None,
            )

    if sort not in ("newest", "oldest"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sort must be newest or oldest",
        )

    if page is None:
        # Searches are always paginated so a broad query cannot return every
        # matching chapter in one payload. Callers that need a full list can
        # still pass ``book_id`` with an explicit page when paginating.
        if not q:
            return get_all_chapters(db, **filters)
        page = 1

    chapters, total = get_chapters_page(
        db,
        page=page,
        page_size=page_size,
        newest_first=sort == "newest",
        oldest_first=sort == "oldest",
        **filters,
    )
    response.headers["X-Total-Count"] = str(total)
    return chapters


@router.post("/")
@router.post("")
def post_chapter(
    payload: ChapterCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return create_chapter(db, payload, user.id)


@router.put("/reorder")
def put_chapter_order(
    payload: ChapterReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return reorder_chapters(db, payload, user.id)


@router.post("/{chapter_id}/view")
def post_chapter_view(
    chapter_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    ip_hash = hashlib.sha256(get_client_ip(request).encode()).hexdigest()
    return register_chapter_view(
        db,
        chapter_id,
        ip_hash,
        count=current_user is None,
    )


@router.get("/search")
def search_chapters(
    q: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(require_auth),
):
    """Owner-only chapter search that also matches body text.

    Returns short snippets instead of whole bodies, and is kept separate from
    the public ``?q=`` search so protected content is never leaked.
    """
    return search_chapters_for_owner(
        db,
        owner_user_id=current_user.id,
        query=q,
        limit=max(1, min(limit, 100)),
    )


@router.get("/{chapter_id}")
def get_chapter_detail(
    chapter_id: int,
    request: Request,
    mine: bool = False,
    include_body: bool = True,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    grants = get_gallery_grants(request, db)
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_chapter(
            db,
            chapter_id,
            include_hidden=True,
            owner_user_id=current_user.id,
            include_body=include_body,
        )
    if current_user is not None and is_admin(current_user):
        chapter = get_chapter(
            db,
            chapter_id,
            include_hidden=True,
            include_body=include_body,
        )
    else:
        chapter = get_chapter(
            db,
            chapter_id,
            include_hidden=current_user is not None,
            granted_chapters=grants.chapters,
            granted_books=grants.books,
            granted_categories=grants.categories,
            viewer_user_id=current_user.id if current_user else None,
            include_body=include_body,
        )
    if chapter.get("user_id") != get_default_author_id(db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )
    return chapter


@router.put("/{chapter_id}/visibility")
def update_chapter_visibility(
    chapter_id: int,
    payload: AdminVisibilityUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Change a chapter's public setting without editing its content."""
    return set_chapter_visibility(
        db,
        chapter_id,
        visible=payload.visible,
    )


@router.put("/{chapter_id}")
def put_chapter(
    chapter_id: int,
    payload: ChapterUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return update_chapter(db, chapter_id, payload, user.id)


@router.delete("/{chapter_id}")
def remove_chapter(
    chapter_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Delete a chapter. Admins may delete any author's chapter."""
    return delete_chapter(
        db,
        chapter_id,
        owner_or_admin_delete_scope(user),
    )
