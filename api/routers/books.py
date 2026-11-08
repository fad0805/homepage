from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from crud.books import (
    create_book,
    delete_book,
    get_all_books,
    get_book,
    reorder_books,
    update_book,
)
from db.session import get_db
from schemas.books import BookCreate, BookReorderRequest, BookUpdate
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
