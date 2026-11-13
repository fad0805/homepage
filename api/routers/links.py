from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from core.uploads import save_banner
from db.session import get_db
from crud.links import (
    get_all_links,
    get_link,
    create_link,
    update_link,
    delete_link,
    get_all_link_categories,
    create_link_category,
    update_link_category,
    delete_link_category,
    reorder_links,
    reorder_link_categories,
)
from schemas.links import (
    LinkCreate,
    LinkUpdate,
    Category,
    ReorderRequest,
    CategoryReorderRequest,
    UploadResponse,
)
from .utils import get_optional_user, require_auth

router = APIRouter()


# Link Categories
# Static paths must be declared before "/{link_id}" so they are not
# captured by the dynamic route.
@router.get("/categories")
def get_link_categories(db: Session = Depends(get_db)):
    """
    Get all link categories.
    """
    return get_all_link_categories(db)


@router.post("/categories")
def post_link_category(
    category: Category,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Create a new link category.
    """
    return create_link_category(db, category)


@router.put("/categories/reorder")
def put_link_category_order(
    payload: CategoryReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Persist the display order of link categories.
    """
    return reorder_link_categories(db, payload)


@router.put("/categories/{category_id}")
def modify_link_category(
    category_id: int,
    category: Category,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Update an existing link category.
    """
    return update_link_category(db, category_id, category)


@router.delete("/categories/{category_id}")
def remove_link_category(
    category_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """
    Delete a link category.
    """
    return delete_link_category(db, category_id)


# Links
@router.get("/")
@router.get("")
def get_links(
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """
    Get all links, or only the signed-in user's links.
    """
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_all_links(db, owner=current_user.username)
    return get_all_links(db)


@router.post("/")
@router.post("")
def post_link(
    link: LinkCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Create a new link.
    """
    return create_link(db, link, owner=getattr(user, "username", None))


@router.put("/reorder")
def put_link_order(
    payload: ReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Persist the display order of the user's links.
    """
    return reorder_links(db, payload, user.username)


@router.post("/upload", response_model=UploadResponse)
async def upload_link_banner(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """
    Upload a banner image and return its public URL.
    """
    url = await save_banner(file, folder="banners")
    return {"url": url}


@router.get("/{link_id}")
def get_link_detail(
    link_id: int,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """
    Get a single link, or one of the signed-in user's links.
    """
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_link(db, link_id, owner=current_user.username)
    return get_link(db, link_id)


@router.put("/{link_id}")
def modify_link(
    link_id: int,
    link: LinkUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Update one of the user's links.
    """
    return update_link(db, link_id, link, user.username)


@router.delete("/{link_id}")
def remove_link(
    link_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Delete one of the user's links.
    """
    return delete_link(db, link_id, user.username)
