from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from core.uploads import save_banner
from crud.books import (
    create_book,
    create_bookshelf,
    delete_book,
    delete_bookshelf,
    get_all_books,
    get_all_bookshelves,
    get_book,
    reorder_books,
    reorder_bookshelves,
    update_book,
    update_bookshelf,
)
from db.session import get_db
from schemas.books import (
    BookCreate,
    BookReorderRequest,
    BookUpdate,
    BookshelfCreate,
    BookshelfReorderRequest,
    BookshelfUpdate,
)
from .utils import require_auth

router = APIRouter()


@router.post("/upload")
async def upload_book_image(
    file: UploadFile = File(...),
    _=Depends(require_auth),
):
    """Upload an image used inside a book body."""
    url = await save_banner(file, folder="books")
    return {"url": url}


# Bookshelves
@router.get("/shelves")
def get_bookshelves(db: Session = Depends(get_db)):
    return get_all_bookshelves(db)


@router.post("/shelves")
def post_bookshelf(
    payload: BookshelfCreate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return create_bookshelf(db, payload)


@router.put("/shelves/reorder")
def put_bookshelf_order(
    payload: BookshelfReorderRequest,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return reorder_bookshelves(db, payload)


@router.put("/shelves/{bookshelf_id}")
def put_bookshelf(
    bookshelf_id: int,
    payload: BookshelfUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return update_bookshelf(db, bookshelf_id, payload)


@router.delete("/shelves/{bookshelf_id}")
def remove_bookshelf(
    bookshelf_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return delete_bookshelf(db, bookshelf_id)


# Books
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
