import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.mastodon import maybe_notify_chapter
from models.books import Book, BookCategory, Chapter, ChapterView
from schemas.books import (
    BookCategoryCreate,
    BookCategoryReorderRequest,
    BookCategoryUpdate,
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
    category = book.category_relation
    return {
        "id": book.id,
        "title": book.title,
        "description": book.description,
        "tags": book.tags or [],
        "category_id": book.category_id,
        "category": (
            {
                "id": category.id,
                "name": category.name,
                "order": category.order,
            }
            if category
            else None
        ),
        "order": book.order,
        "visible": book.visible,
        "protected": bool(book.protected),
        "created_at": _iso_utc(book.created_at),
        "updated_at": _iso_utc(book.updated_at),
    }


def _serialize_book_category(category: BookCategory) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "order": category.order,
    }


def _get_book_category_or_404(
    db: Session, category_id: int
) -> BookCategory:
    category = (
        db.query(BookCategory)
        .filter(BookCategory.id == category_id)
        .first()
    )
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book category",
        )
    return category


def _next_book_category_order(db: Session) -> int:
    max_order = db.query(func.max(BookCategory.order)).scalar()
    return 0 if max_order is None else max_order + 1


# Book Categories CRUD
def get_all_book_categories(db: Session):
    categories = (
        db.query(BookCategory)
        .order_by(BookCategory.order, BookCategory.id)
        .all()
    )
    return [
        _serialize_book_category(category) for category in categories
    ]


def create_book_category(db: Session, payload: BookCategoryCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="카테고리 이름을 입력해주세요.",
        )

    order = (
        payload.order
        if payload.order is not None
        else _next_book_category_order(db)
    )
    category = BookCategory(name=name, order=order)
    db.add(category)
    db.commit()
    db.refresh(category)
    return _serialize_book_category(category)


def update_book_category(
    db: Session, category_id: int, payload: BookCategoryUpdate
):
    category = _get_book_category_or_404(db, category_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="카테고리 이름을 입력해주세요.",
            )
        data["name"] = name

    for key, value in data.items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return _serialize_book_category(category)


def delete_book_category(db: Session, category_id: int):
    category = _get_book_category_or_404(db, category_id)
    book_count = (
        db.query(Book).filter(Book.category_id == category_id).count()
    )
    if book_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "이 카테고리에 책이 남아 있어 삭제할 수 없습니다. "
                "책의 카테고리를 먼저 변경해주세요."
            ),
        )

    db.delete(category)
    db.commit()
    return True


def reorder_book_categories(
    db: Session, payload: BookCategoryReorderRequest
):
    ids = [item.id for item in payload.items]
    categories = {
        category.id: category
        for category in db.query(BookCategory)
        .filter(BookCategory.id.in_(ids))
        .all()
    }
    missing = set(ids) - set(categories)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist book category: {sorted(missing)}",
        )

    for item in payload.items:
        categories[item.id].order = item.order
    db.commit()
    return True


def _serialize_chapter(chapter: Chapter, locked: bool = False) -> dict:
    book = chapter.book
    return {
        "id": chapter.id,
        "book_id": chapter.book_id,
        "title": chapter.title,
        "subtitle": chapter.subtitle,
        "body": None if locked else chapter.body,
        "tags": chapter.tags or [],
        "order": chapter.order,
        "visible": chapter.visible,
        "protected": bool(chapter.protected),
        "locked": locked,
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
def get_all_books(
    db: Session,
    *,
    include_hidden: bool = False,
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
):
    query = db.query(Book)
    if owner_user_id is not None:
        query = query.filter(Book.user_id == owner_user_id)
    elif not include_hidden:
        query = query.filter(Book.visible.is_(True))
    elif viewer_user_id is not None:
        # Public viewers see all public books plus only their own hidden ones.
        query = query.filter(
            or_(
                Book.visible.is_(True),
                Book.user_id == viewer_user_id,
            )
        )
    books = query.order_by(Book.order, Book.id).all()
    return [_serialize_book(book) for book in books]


def get_book(
    db: Session,
    book_id: int,
    *,
    include_hidden: bool = False,
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
):
    query = db.query(Book).filter(Book.id == book_id)
    if owner_user_id is not None:
        query = query.filter(Book.user_id == owner_user_id)
    elif not include_hidden:
        query = query.filter(Book.visible.is_(True))
    elif viewer_user_id is not None:
        query = query.filter(
            or_(
                Book.visible.is_(True),
                Book.user_id == viewer_user_id,
            )
        )
    book = query.first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )
    return _serialize_book(book)


def create_book(db: Session, payload: BookCreate, user_id: int):
    data = payload.model_dump()
    data["tags"] = _clean_tags(data.get("tags"))
    data["user_id"] = user_id
    if data.get("category_id") is not None:
        _get_book_category_or_404(db, data["category_id"])
    book = Book(**data)
    db.add(book)
    db.commit()
    db.refresh(book)
    return _serialize_book(book)


def update_book(
    db: Session,
    book_id: int,
    payload: BookUpdate,
    owner_user_id: int,
):
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.user_id == owner_user_id)
        .first()
    )
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )

    data = payload.model_dump(exclude_unset=True)
    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])
    if data.get("category_id") is not None:
        _get_book_category_or_404(db, data["category_id"])
    for key, value in data.items():
        setattr(book, key, value)
    db.commit()
    db.refresh(book)
    return _serialize_book(book)


def delete_book(db: Session, book_id: int, owner_user_id: int):
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.user_id == owner_user_id)
        .first()
    )
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )
    db.delete(book)
    db.commit()
    return True


def reorder_books(
    db: Session,
    payload: BookReorderRequest,
    owner_user_id: int,
):
    ids = [item.id for item in payload.items]
    books = {
        book.id: book
        for book in (
            db.query(Book)
            .filter(
                Book.id.in_(ids),
                Book.user_id == owner_user_id,
            )
            .all()
        )
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
def _chapter_is_locked(
    chapter: Chapter,
    granted_chapters: frozenset[int],
    granted_books: frozenset[int],
) -> bool:
    """Mirror the web UI rule: a book grant unlocks every chapter in it."""
    book = chapter.book
    if book is not None and book.protected:
        return chapter.book_id not in granted_books
    return bool(chapter.protected) and chapter.id not in granted_chapters


def get_all_chapters(
    db: Session,
    *,
    include_hidden: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
):
    query = (
        db.query(Chapter)
        .join(Book, Chapter.book_id == Book.id)
        .order_by(
            Book.order,
            Book.id,
            Chapter.order,
            Chapter.id,
        )
    )
    if owner_user_id is not None:
        query = query.filter(Chapter.user_id == owner_user_id)

    result = []
    for chapter in query.all():
        is_own = (
            viewer_user_id is not None
            and (
                chapter.user_id == viewer_user_id
                or (
                    chapter.book is not None
                    and chapter.book.user_id == viewer_user_id
                )
            )
        )
        if owner_user_id is None and not is_own and not _chapter_is_public(
            chapter
        ):
            continue

        unlocked = owner_user_id is not None or (
            include_hidden and is_own
        )
        locked = (
            False
            if unlocked
            else _chapter_is_locked(chapter, granted_chapters, granted_books)
        )
        result.append(_serialize_chapter(chapter, locked=locked))
    return result


def get_chapter(
    db: Session,
    chapter_id: int,
    *,
    include_hidden: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
):
    query = db.query(Chapter).filter(Chapter.id == chapter_id)
    if owner_user_id is not None:
        query = query.filter(Chapter.user_id == owner_user_id)
    chapter = query.first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )

    is_own = (
        viewer_user_id is not None
        and (
            chapter.user_id == viewer_user_id
            or (
                chapter.book is not None
                and chapter.book.user_id == viewer_user_id
            )
        )
    )
    if owner_user_id is None and not is_own and not _chapter_is_public(
        chapter
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )

    unlocked = owner_user_id is not None or (include_hidden and is_own)
    locked = (
        False
        if unlocked
        else _chapter_is_locked(chapter, granted_chapters, granted_books)
    )
    return _serialize_chapter(chapter, locked=locked)


def _get_book_or_404(
    db: Session,
    book_id: int,
    owner_user_id: int | None = None,
) -> Book:
    query = db.query(Book).filter(Book.id == book_id)
    if owner_user_id is not None:
        query = query.filter(Book.user_id == owner_user_id)
    book = query.first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="존재하지 않는 책입니다.",
        )
    return book


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _chapter_is_public(chapter: Chapter) -> bool:
    if chapter.visible is False:
        return False
    if chapter.book is not None and chapter.book.visible is False:
        return False
    published_at = _naive_utc(chapter.published_at)
    if published_at is None:
        return True
    return published_at <= datetime.utcnow()


def create_chapter(db: Session, payload: ChapterCreate, user_id: int):
    _get_book_or_404(db, payload.book_id, owner_user_id=user_id)
    data = payload.model_dump(exclude={"notify_mastodon"})
    data["tags"] = _clean_tags(data.get("tags"))
    data["user_id"] = user_id
    chapter = Chapter(**data)
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    if payload.notify_mastodon:
        maybe_notify_chapter(db, chapter)
    return _serialize_chapter(chapter)


def _reorder_chapters_by_created_at(db: Session, book_id: int) -> None:
    """Reassign chapter order chronologically inside one book."""
    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.created_at.asc(), Chapter.id.asc())
        .all()
    )
    for index, chapter in enumerate(chapters):
        chapter.order = index


def update_chapter(
    db: Session,
    chapter_id: int,
    payload: ChapterUpdate,
    owner_user_id: int,
):
    chapter = (
        db.query(Chapter)
        .filter(
            Chapter.id == chapter_id,
            Chapter.user_id == owner_user_id,
        )
        .first()
    )
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )

    data = payload.model_dump(exclude_unset=True)
    if "book_id" in data and data["book_id"] is not None:
        _get_book_or_404(
            db,
            data["book_id"],
            owner_user_id=owner_user_id,
        )
    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])

    was_public = _chapter_is_public(chapter)
    previous_book_id = chapter.book_id
    for key, value in data.items():
        setattr(chapter, key, value)

    next_book_id = data.get("book_id")
    if next_book_id is not None and next_book_id != previous_book_id:
        # Moving a chapter re-sorts both books so their order always follows
        # the original creation time.
        db.flush()
        _reorder_chapters_by_created_at(db, previous_book_id)
        _reorder_chapters_by_created_at(db, next_book_id)

    db.commit()
    db.refresh(chapter)

    if not was_public:
        maybe_notify_chapter(db, chapter)
    elif not _chapter_is_public(chapter) and chapter.mastodon_pending:
        chapter.mastodon_pending = False
        db.commit()

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
    if not _chapter_is_public(chapter):
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


def delete_chapter(
    db: Session,
    chapter_id: int,
    owner_user_id: int,
):
    chapter = (
        db.query(Chapter)
        .filter(
            Chapter.id == chapter_id,
            Chapter.user_id == owner_user_id,
        )
        .first()
    )
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )
    db.delete(chapter)
    db.commit()
    return True


def reorder_chapters(
    db: Session,
    payload: ChapterReorderRequest,
    owner_user_id: int,
):
    ids = [item.id for item in payload.items]
    chapters = {
        chapter.id: chapter
        for chapter in (
            db.query(Chapter)
            .filter(
                Chapter.id.in_(ids),
                Chapter.user_id == owner_user_id,
            )
            .all()
        )
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
            for book in (
                db.query(Book)
                .filter(
                    Book.id.in_(book_ids),
                    Book.user_id == owner_user_id,
                )
                .all()
            )
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
