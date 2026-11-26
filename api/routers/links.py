from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from core.image_urls import public_url
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
    set_link_visibility,
)
from schemas.links import (
    LinkCreate,
    LinkUpdate,
    LinkVisibilityUpdate,
    Category,
    ReorderRequest,
    CategoryReorderRequest,
    UploadResponse,
)
from .utils import (
    get_default_author_id,
    get_optional_user,
    is_admin,
    owner_or_admin_delete_scope,
    require_admin,
    require_auth,
)

router = APIRouter()


# Link Categories
# Static paths must be declared before "/{link_id}" so they are not
# captured by the dynamic route.
@router.get("/categories")
def get_link_categories(
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """
    Get the default author's public categories, or the signed-in author's
    categories when ``mine`` is set.
    """
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_all_link_categories(db, current_user.id)

    author_id = get_default_author_id(db)
    if author_id is None:
        return []
    return get_all_link_categories(db, author_id)


@router.post("/categories")
def post_link_category(
    category: Category,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Create a new link category.
    """
    return create_link_category(db, category, user.id)


@router.put("/categories/reorder")
def put_link_category_order(
    payload: CategoryReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Persist the display order of the signed-in author's categories.
    """
    return reorder_link_categories(db, payload, user.id)


@router.put("/categories/{category_id}")
def modify_link_category(
    category_id: int,
    category: Category,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Update one of the signed-in author's link categories.
    """
    return update_link_category(db, category_id, category, user.id)


@router.delete("/categories/{category_id}")
def remove_link_category(
    category_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Delete a category. Admins may delete any author's category."""
    return delete_link_category(
        db,
        category_id,
        owner_or_admin_delete_scope(user),
    )


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
        return get_all_links(
            db,
            user_id=current_user.id,
            include_hidden=True,
        )
    author_id = get_default_author_id(db)
    if author_id is None:
        return []
    return get_all_links(
        db,
        user_id=author_id,
        include_hidden=current_user is not None and is_admin(current_user),
    )


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
    return create_link(
        db,
        link,
        user.id,
        owner=user.username,
    )


@router.put("/reorder")
def put_link_order(
    payload: ReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Persist the display order of the user's links.
    """
    return reorder_links(db, payload, user.id)


@router.post("/upload", response_model=UploadResponse)
async def upload_link_banner(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """
    Upload a banner image and return its public URL.
    """
    key = await save_banner(file, folder="banners")
    return {"url": public_url(key)}


@router.post("/category-upload", response_model=UploadResponse)
async def upload_category_banner(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """
    Upload the single category banner under the stable ``banner`` name.
    """
    key = await save_banner(file, folder="banners", name="banner")
    return {"url": public_url(key)}


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
        return get_link(db, link_id, user_id=current_user.id)
    link = get_link(db, link_id)
    if link.get("user_id") != get_default_author_id(db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link",
        )
    return link


@router.put("/{link_id}/visibility")
def update_link_visibility(
    link_id: int,
    payload: LinkVisibilityUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Hide or restore a link in public lists without editing it."""
    return set_link_visibility(
        db,
        link_id,
        hidden=payload.hidden,
    )


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
    return update_link(db, link_id, link, user.id)


@router.delete("/{link_id}")
def remove_link(
    link_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Delete a link. Admins may delete any author's link."""
    return delete_link(
        db,
        link_id,
        owner_or_admin_delete_scope(user),
    )
