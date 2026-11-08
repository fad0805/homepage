from fastapi import APIRouter, Depends
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
from .utils import require_auth

router = APIRouter()


@router.get("/")
@router.get("")
def get_books(db: Session = Depends(get_db)):
    return get_all_books(db)


@router.post("/")
@router.post("")
def post_book(
    payload: BookCreate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return create_book(db, payload)


@router.put("/reorder")
def put_book_order(
    payload: BookReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return reorder_books(db, payload)


# Book categories. Static paths must be declared before "/{book_id}".
@router.get("/categories")
def get_book_categories(db: Session = Depends(get_db)):
    return get_all_book_categories(db)


@router.post("/categories")
def post_book_category(
    payload: BookCategoryCreate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return create_book_category(db, payload)


@router.put("/categories/reorder")
def put_book_category_order(
    payload: BookCategoryReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return reorder_book_categories(db, payload)


@router.put("/categories/{category_id}")
def put_book_category(
    category_id: int,
    payload: BookCategoryUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return update_book_category(db, category_id, payload)


@router.delete("/categories/{category_id}")
def remove_book_category(
    category_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return delete_book_category(db, category_id)


@router.get("/{book_id}")
def get_book_detail(book_id: int, db: Session = Depends(get_db)):
    return get_book(db, book_id)


@router.put("/{book_id}")
def put_book(
    book_id: int,
    payload: BookUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return update_book(db, book_id, payload)


@router.delete("/{book_id}")
def remove_book(
    book_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return delete_book(db, book_id)
