from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.books import Book, Bookshelf
from schemas.books import (
    BookCreate,
    BookReorderRequest,
    BookUpdate,
    BookshelfCreate,
    BookshelfReorderRequest,
    BookshelfUpdate,
)


def _serialize_bookshelf(bookshelf: Bookshelf) -> dict:
    return {
        "id": bookshelf.id,
        "title": bookshelf.title,
        "description": bookshelf.description,
        "order": bookshelf.order,
        "visible": bookshelf.visible,
    }


def _serialize_book(book: Book) -> dict:
    bookshelf = book.bookshelf
    return {
        "id": book.id,
        "bookshelf_id": book.bookshelf_id,
        "title": book.title,
        "subtitle": book.subtitle,
        "body": book.body,
        "order": book.order,
        "visible": book.visible,
        "bookshelf": (
            {
                "id": bookshelf.id,
                "title": bookshelf.title,
            }
            if bookshelf
            else None
        ),
    }


# Bookshelf CRUD
def get_all_bookshelves(db: Session):
    bookshelves = (
        db.query(Bookshelf)
        .order_by(Bookshelf.order, Bookshelf.id)
        .all()
    )
    return [_serialize_bookshelf(bookshelf) for bookshelf in bookshelves]


def create_bookshelf(db: Session, payload: BookshelfCreate):
    bookshelf = Bookshelf(**payload.model_dump())
    db.add(bookshelf)
    db.commit()
    db.refresh(bookshelf)
    return _serialize_bookshelf(bookshelf)


def update_bookshelf(
    db: Session,
    bookshelf_id: int,
    payload: BookshelfUpdate,
):
    bookshelf = (
        db.query(Bookshelf).filter(Bookshelf.id == bookshelf_id).first()
    )
    if not bookshelf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist bookshelf",
        )

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(bookshelf, key, value)

    db.commit()
    db.refresh(bookshelf)
    return _serialize_bookshelf(bookshelf)


def delete_bookshelf(db: Session, bookshelf_id: int):
    bookshelf = (
        db.query(Bookshelf).filter(Bookshelf.id == bookshelf_id).first()
    )
    if not bookshelf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist bookshelf",
        )

    db.delete(bookshelf)
    db.commit()
    return True


def reorder_bookshelves(
    db: Session,
    payload: BookshelfReorderRequest,
):
    ids = [item.id for item in payload.items]
    bookshelves = {
        bookshelf.id: bookshelf
        for bookshelf in db.query(Bookshelf)
        .filter(Bookshelf.id.in_(ids))
        .all()
    }
    missing = set(ids) - set(bookshelves)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist bookshelf: {sorted(missing)}",
        )

    for item in payload.items:
        bookshelves[item.id].order = item.order
    db.commit()
    return True


# Book CRUD
def get_all_books(db: Session):
    books = (
        db.query(Book)
        .join(Bookshelf, Book.bookshelf_id == Bookshelf.id)
        .order_by(
            Bookshelf.order,
            Bookshelf.id,
            Book.order,
            Book.id,
        )
        .all()
    )
    return [_serialize_book(book) for book in books]


def get_book(db: Session, book_id: int):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )
    return _serialize_book(book)


def _get_bookshelf_or_404(db: Session, bookshelf_id: int) -> Bookshelf:
    bookshelf = (
        db.query(Bookshelf).filter(Bookshelf.id == bookshelf_id).first()
    )
    if not bookshelf:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="존재하지 않는 책장입니다.",
        )
    return bookshelf


def _next_book_order(db: Session, bookshelf_id: int) -> int:
    max_order = (
        db.query(func.max(Book.order))
        .filter(Book.bookshelf_id == bookshelf_id)
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


def create_book(db: Session, payload: BookCreate):
    _get_bookshelf_or_404(db, payload.bookshelf_id)
    book = Book(**payload.model_dump())
    db.add(book)
    db.commit()
    db.refresh(book)
    return _serialize_book(book)


def update_book(db: Session, book_id: int, payload: BookUpdate):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )

    data = payload.model_dump(exclude_unset=True)
    if "bookshelf_id" in data and data["bookshelf_id"] is not None:
        _get_bookshelf_or_404(db, data["bookshelf_id"])

    for key, value in data.items():
        setattr(book, key, value)

    db.commit()
    db.refresh(book)
    return _serialize_book(book)


def delete_book(db: Session, book_id: int):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )

    db.delete(book)
    db.commit()
    return True


def reorder_books(db: Session, payload: BookReorderRequest):
    ids = [item.id for item in payload.items]
    books = {
        book.id: book
        for book in db.query(Book).filter(Book.id.in_(ids)).all()
    }
    missing = set(ids) - set(books)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist book: {sorted(missing)}",
        )

    shelf_ids = {
        item.bookshelf_id for item in payload.items if item.bookshelf_id
    }
    if shelf_ids:
        existing_shelves = {
            shelf.id
            for shelf in db.query(Bookshelf)
            .filter(Bookshelf.id.in_(shelf_ids))
            .all()
        }
        missing_shelves = shelf_ids - existing_shelves
        if missing_shelves:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Does not exist bookshelf: {sorted(missing_shelves)}",
            )

    for item in payload.items:
        book = books[item.id]
        book.order = item.order
        if item.bookshelf_id is not None:
            book.bookshelf_id = item.bookshelf_id
    db.commit()
    return True
