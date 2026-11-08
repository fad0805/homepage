import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.books import Book, Chapter, ChapterView
from schemas.books import (
    BookCreate,
    BookReorderRequest,
    BookUpdate,
    ChapterCreate,
    ChapterReorderRequest,
    ChapterUpdate,
)


CHAPTER_VIEW_DEDUP_MINUTES = int(
    os.getenv("CHAPTER_VIEW_DEDUP_MINUTES", "60")
)


def _clean_tags(tags: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    for tag in tags or []:
        value = tag.strip()
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned[:20]


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
        "tags": book.tags or [],
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
        "tags": chapter.tags or [],
        "order": chapter.order,
        "visible": chapter.visible,
        "view_count": chapter.view_count or 0,
        "published_at": _iso_utc(chapter.published_at),
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
    data = payload.model_dump()
    data["tags"] = _clean_tags(data.get("tags"))
    book = Book(**data)
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
    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])
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
    data = payload.model_dump()
    data["tags"] = _clean_tags(data.get("tags"))
    chapter = Chapter(**data)
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
    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])

    for key, value in data.items():
        setattr(chapter, key, value)
    db.commit()
    db.refresh(chapter)
    return _serialize_chapter(chapter)


def register_chapter_view(
    db: Session,
    chapter_id: int,
    ip_hash: str,
    count: bool = True,
):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )

    now = datetime.utcnow()
    if chapter.visible is False or (
        chapter.published_at is not None and chapter.published_at > now
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )

    if not count:
        return {"view_count": chapter.view_count or 0}

    view = (
        db.query(ChapterView)
        .filter(
            ChapterView.chapter_id == chapter_id,
            ChapterView.ip_hash == ip_hash,
        )
        .first()
    )

    counted = False
    if view is None:
        db.add(
            ChapterView(
                chapter_id=chapter_id,
                ip_hash=ip_hash,
                last_viewed_at=now,
            )
        )
        counted = True
    elif now - view.last_viewed_at >= timedelta(
        minutes=CHAPTER_VIEW_DEDUP_MINUTES
    ):
        view.last_viewed_at = now
        counted = True

    if counted:
        chapter.view_count = (chapter.view_count or 0) + 1
        db.commit()
        db.refresh(chapter)

    return {"view_count": chapter.view_count or 0}


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
