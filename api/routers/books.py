from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from crud.books import (
    create_book,
    create_book_category,
    delete_book,
    delete_book_category,
    get_all_book_categories,
    get_all_books,
    get_book,
    reorder_book_categories,
    reorder_books,
    update_book,
    update_book_category,
)
from db.session import get_db
from schemas.books import (
    BookCategoryCreate,
    BookCategoryReorderRequest,
    BookCategoryUpdate,
    BookCreate,
    BookReorderRequest,
    BookUpdate,
)
from .utils import get_optional_user, is_admin, require_admin, require_auth

router = APIRouter()


@router.get("/")
@router.get("")
def get_books(
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    if current_user is not None and is_admin(current_user):
        return get_all_books(db, include_hidden=True)
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_all_books(
            db,
            include_hidden=True,
            owner_user_id=current_user.id,
        )
    return get_all_books(
        db,
        include_hidden=current_user is not None,
        viewer_user_id=current_user.id if current_user else None,
    )


@router.post("/")
@router.post("")
def post_book(
    payload: BookCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return create_book(db, payload, user.id)


@router.put("/reorder")
def put_book_order(
    payload: BookReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return reorder_books(
        db,
        payload,
        None if is_admin(user) else user.id,
    )


# Book categories. Static paths must be declared before "/{book_id}".
@router.get("/categories")
def get_book_categories(db: Session = Depends(get_db)):
    return get_all_book_categories(db)


@router.post("/categories")
def post_book_category(
    payload: BookCategoryCreate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    return create_book_category(db, payload)


@router.put("/categories/reorder")
def put_book_category_order(
    payload: BookCategoryReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    return reorder_book_categories(db, payload)


@router.put("/categories/{category_id}")
def put_book_category(
    category_id: int,
    payload: BookCategoryUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    return update_book_category(db, category_id, payload)


@router.delete("/categories/{category_id}")
def remove_book_category(
    category_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    return delete_book_category(db, category_id)


@router.get("/{book_id}")
def get_book_detail(
    book_id: int,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    if current_user is not None and is_admin(current_user):
        return get_book(db, book_id, include_hidden=True)
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return get_book(
            db,
            book_id,
            include_hidden=True,
            owner_user_id=current_user.id,
        )
    return get_book(
        db,
        book_id,
        include_hidden=current_user is not None,
        viewer_user_id=current_user.id if current_user else None,
    )


@router.put("/{book_id}")
def put_book(
    book_id: int,
    payload: BookUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return update_book(
        db,
        book_id,
        payload,
        None if is_admin(user) else user.id,
    )


@router.delete("/{book_id}")
def remove_book(
    book_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return delete_book(
        db,
        book_id,
        None if is_admin(user) else user.id,
    )
