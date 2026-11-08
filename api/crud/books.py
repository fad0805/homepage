from datetime import timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.books import Book, Chapter
from schemas.books import (
    BookCreate,
    BookReorderRequest,
    BookUpdate,
    ChapterCreate,
    ChapterReorderRequest,
    ChapterUpdate,
)


def _iso_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _serialize_book(book: Book) -> dict:
    return {
        "id": book.id,
        "title": book.title,
        "description": book.description,
        "order": book.order,
        "visible": book.visible,
        "created_at": _iso_utc(book.created_at),
        "updated_at": _iso_utc(book.updated_at),
    }


def _serialize_chapter(chapter: Chapter) -> dict:
    book = chapter.book
    return {
        "id": chapter.id,
        "book_id": chapter.book_id,
        "title": chapter.title,
        "subtitle": chapter.subtitle,
        "body": chapter.body,
        "order": chapter.order,
        "visible": chapter.visible,
        "created_at": _iso_utc(chapter.created_at),
        "updated_at": _iso_utc(chapter.updated_at),
        "book": (
            {
                "id": book.id,
                "title": book.title,
            }
            if book
            else None
        ),
    }


# Book CRUD
def get_all_books(db: Session):
    books = db.query(Book).order_by(Book.order, Book.id).all()
    return [_serialize_book(book) for book in books]


def get_book(db: Session, book_id: int):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )
    return _serialize_book(book)


def create_book(db: Session, payload: BookCreate):
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

    for key, value in payload.model_dump(exclude_unset=True).items():
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

    for item in payload.items:
        books[item.id].order = item.order
    db.commit()
    return True


# Chapter CRUD
def get_all_chapters(db: Session):
    chapters = (
        db.query(Chapter)
        .join(Book, Chapter.book_id == Book.id)
        .order_by(
            Book.order,
            Book.id,
            Chapter.order,
            Chapter.id,
        )
        .all()
    )
    return [_serialize_chapter(chapter) for chapter in chapters]


def get_chapter(db: Session, chapter_id: int):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )
    return _serialize_chapter(chapter)


def _get_book_or_404(db: Session, book_id: int) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="존재하지 않는 책입니다.",
        )
    return book


def create_chapter(db: Session, payload: ChapterCreate):
    _get_book_or_404(db, payload.book_id)
    chapter = Chapter(**payload.model_dump())
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return _serialize_chapter(chapter)


def update_chapter(db: Session, chapter_id: int, payload: ChapterUpdate):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )

    data = payload.model_dump(exclude_unset=True)
    if "book_id" in data and data["book_id"] is not None:
        _get_book_or_404(db, data["book_id"])

    for key, value in data.items():
        setattr(chapter, key, value)
    db.commit()
    db.refresh(chapter)
    return _serialize_chapter(chapter)


def delete_chapter(db: Session, chapter_id: int):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )
    db.delete(chapter)
    db.commit()
    return True


def reorder_chapters(db: Session, payload: ChapterReorderRequest):
    ids = [item.id for item in payload.items]
    chapters = {
        chapter.id: chapter
        for chapter in db.query(Chapter).filter(Chapter.id.in_(ids)).all()
    }
    missing = set(ids) - set(chapters)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist chapter: {sorted(missing)}",
        )

    book_ids = {item.book_id for item in payload.items if item.book_id}
    if book_ids:
        existing_books = {
            book.id
            for book in db.query(Book).filter(Book.id.in_(book_ids)).all()
        }
        missing_books = book_ids - existing_books
        if missing_books:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Does not exist book: {sorted(missing_books)}",
            )

    for item in payload.items:
        chapter = chapters[item.id]
        chapter.order = item.order
        if item.book_id is not None:
            chapter.book_id = item.book_id
    db.commit()
    return True
