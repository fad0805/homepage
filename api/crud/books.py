import html
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.orm import Session, contains_eager, load_only

from core.mastodon import maybe_notify_chapter
from core.search import like_pattern, search_tokens
from crud import serial_nodes as serial_node_crud
from crud.tags import sync_chapter_tags
from models.books import Book, BookCategory, Chapter, ChapterView
from models.tags import ChapterTag, Tag
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

# Columns needed to build a list row. ``body`` is intentionally absent so
# metadata-only list requests never read the large text column from the DB.
CHAPTER_LIST_COLUMNS = (
    Chapter.id,
    Chapter.user_id,
    Chapter.book_id,
    Chapter.title,
    Chapter.subtitle,
    Chapter.tags,
    Chapter.order,
    Chapter.visible,
    Chapter.pinned,
    Chapter.protected,
    Chapter.view_count,
    Chapter.published_at,
    Chapter.created_at,
    Chapter.updated_at,
)
MAX_PINNED_CHAPTERS = 5


def _clean_tags(tags: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for tag in tags or []:
        value = tag.strip()[:255]
        key = value.lower()
        if value and key not in seen:
            seen.add(key)
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
        "user_id": book.user_id,
        "title": book.title,
        "description": book.description,
        "tags": book.tags or [],
        "category_id": book.category_id,
        "category": (
            {
                "id": category.id,
                "name": category.name,
                "order": category.order,
                "visible": category.visible,
                "protected": bool(category.protected),
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
        "visible": category.visible,
        "protected": bool(category.protected),
    }


def _category_is_visible_to(
    book: Book,
    *,
    viewer_user_id: int | None,
    can_view_hidden: bool,
) -> bool:
    """Whether this viewer may see a book filed under its category."""
    if can_view_hidden:
        return True
    if book.category_relation is None:
        return True
    if book.category_relation.visible is not False:
        return True
    return viewer_user_id is not None and book.user_id == viewer_user_id


def _chapter_counts_for_books(
    db: Session,
    books: list[Book],
    *,
    viewer_user_id: int | None,
    owner_user_id: int | None,
    is_admin: bool,
) -> dict[int, int]:
    """Count the chapters each viewer can see in the given books.

    The books board shows a per-book count without loading every chapter row.
    """
    if not books:
        return {}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    query = db.query(
        Chapter.book_id,
        func.count(Chapter.id),
    ).filter(
        Chapter.book_id.in_([book.id for book in books]),
        or_(
            Chapter.published_at.is_(None),
            Chapter.published_at <= now,
        ),
    )
    if not (is_admin or owner_user_id is not None):
        query = query.join(Book, Book.id == Chapter.book_id)
        if viewer_user_id is None:
            query = query.filter(Chapter.visible.is_(True))
        else:
            query = query.filter(
                or_(
                    Chapter.visible.is_(True),
                    Book.user_id == viewer_user_id,
                )
            )
    rows = query.group_by(Chapter.book_id).all()
    return {book_id: count for book_id, count in rows}


def _serialize_books_with_counts(
    books: list[Book],
    counts: dict[int, int],
) -> list[dict]:
    return [
        {
            **_serialize_book(book),
            "chapter_count": counts.get(book.id, 0),
        }
        for book in books
    ]


def _get_book_category_or_404(
    db: Session, category_id: int, user_id: int
) -> BookCategory:
    category = (
        db.query(BookCategory)
        .filter(
            BookCategory.id == category_id,
            BookCategory.user_id == user_id,
        )
        .first()
    )
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book category",
        )
    return category


def _next_book_category_order(db: Session, user_id: int) -> int:
    max_order = (
        db.query(func.max(BookCategory.order))
        .filter(BookCategory.user_id == user_id)
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


# Book Categories CRUD
def get_all_book_categories(db: Session, user_id: int):
    categories = (
        db.query(BookCategory)
        .filter(BookCategory.user_id == user_id)
        .order_by(BookCategory.order, BookCategory.id)
        .all()
    )
    return [
        _serialize_book_category(category) for category in categories
    ]


def create_book_category(
    db: Session,
    payload: BookCategoryCreate,
    user_id: int,
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="카테고리 이름을 입력해주세요.",
        )

    order = (
        payload.order
        if payload.order is not None
        else _next_book_category_order(db, user_id)
    )
    category = BookCategory(
        user_id=user_id,
        name=name,
        order=order,
        visible=payload.visible,
        protected=payload.protected,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return _serialize_book_category(category)


def update_book_category(
    db: Session,
    category_id: int,
    payload: BookCategoryUpdate,
    user_id: int,
):
    category = _get_book_category_or_404(db, category_id, user_id)
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


def delete_book_category(
    db: Session,
    category_id: int,
    user_id: int,
):
    category = _get_book_category_or_404(db, category_id, user_id)
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
    db: Session,
    payload: BookCategoryReorderRequest,
    user_id: int,
):
    ids = [item.id for item in payload.items]
    categories = {
        category.id: category
        for category in db.query(BookCategory)
        .filter(
            BookCategory.id.in_(ids),
            BookCategory.user_id == user_id,
        )
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


def _serialize_chapter(
    chapter: Chapter,
    locked: bool = False,
    include_body: bool = True,
) -> dict:
    book = chapter.book
    return {
        "id": chapter.id,
        "user_id": chapter.user_id,
        "book_id": chapter.book_id,
        "title": chapter.title,
        "subtitle": chapter.subtitle,
        "body": None if locked or not include_body else chapter.body,
        "tags": chapter.tags or [],
        "order": chapter.order,
        "visible": chapter.visible,
        "pinned": bool(chapter.pinned),
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
def _book_tag_match(db: Session, pattern: str):
    """Match a tag substring without materializing book rows in Python."""
    dialect = db.bind.dialect.name if db.bind is not None else None
    if dialect == "sqlite":
        # SQLAlchemy's JSON serializer escapes non-ASCII tags in SQLite text,
        # so a plain cast cannot match Korean tags. json_each decodes them.
        tags = func.json_each(Book.tags).table_valued("value").alias("book_tag")
    elif dialect == "postgresql":
        # The same escaping can be present in stored json text, so expand the
        # array instead of matching the serialized JSON blob.
        tags = (
            func.json_array_elements_text(Book.tags)
            .table_valued("value")
            .alias("book_tag")
        )
    else:
        return func.cast(Book.tags, String).ilike(pattern, escape="\\")
    return Book.id.in_(
        select(Book.id)
        .select_from(tags)
        .where(func.lower(tags.c.value).like(pattern, escape="\\"))
    )


def _build_book_query(
    db: Session,
    *,
    include_hidden: bool = False,
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    is_admin: bool = False,
    author_user_id: int | None = None,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    include_chapter_matches: bool = False,
    query: str | None = None,
):
    books_query = (
        db.query(Book)
        .outerjoin(BookCategory, Book.category_id == BookCategory.id)
        .options(contains_eager(Book.category_relation))
    )
    if author_user_id is not None:
        books_query = books_query.filter(Book.user_id == author_user_id)
    if owner_user_id is not None:
        books_query = books_query.filter(Book.user_id == owner_user_id)
    elif not include_hidden:
        books_query = books_query.filter(Book.visible.is_(True))
    elif viewer_user_id is not None:
        # Public viewers see all public books plus only their own hidden ones.
        books_query = books_query.filter(
            or_(
                Book.visible.is_(True),
                Book.user_id == viewer_user_id,
            )
        )
    if owner_user_id is None and not is_admin:
        visible_category = or_(
            Book.category_id.is_(None),
            BookCategory.visible.is_(True),
        )
        if viewer_user_id is not None:
            books_query = books_query.filter(
                or_(visible_category, Book.user_id == viewer_user_id)
            )
        else:
            books_query = books_query.filter(visible_category)

    # Metadata-only by default for global search. The books page sidebar opts
    # in to chapter matches so its book list also follows chapter searches.
    tokens = search_tokens(query)
    if tokens:
        chapter_book_ids: set[int] = set()
        if include_chapter_matches:
            chapter_match_query = _build_chapter_query(
                db,
                include_hidden=include_hidden,
                granted_chapters=granted_chapters,
                granted_books=granted_books,
                viewer_user_id=viewer_user_id,
                owner_user_id=owner_user_id,
                author_user_id=author_user_id,
                query=query,
                include_body=False,
                ids_only=True,
                published_only=True,
            )
            chapter_book_ids = {
                book_id
                for (book_id,) in chapter_match_query.with_entities(
                    Chapter.book_id
                )
                .order_by(None)
                .distinct()
                .all()
            }
        for token in tokens:
            pattern = like_pattern(token)
            field_match = or_(
                Book.title.ilike(pattern, escape="\\"),
                Book.description.ilike(pattern, escape="\\"),
                BookCategory.name.ilike(pattern, escape="\\"),
                _book_tag_match(db, pattern),
            )
            if chapter_book_ids:
                field_match = or_(field_match, Book.id.in_(chapter_book_ids))
            books_query = books_query.filter(field_match)

    return books_query.order_by(Book.order, Book.id)


def _get_books_page(
    db: Session,
    *,
    page: int | None,
    page_size: int,
    include_hidden: bool = False,
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    is_admin: bool = False,
    author_user_id: int | None = None,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    include_chapter_matches: bool = False,
    query: str | None = None,
) -> tuple[list[dict], int]:
    books_query = _build_book_query(
        db,
        include_hidden=include_hidden,
        viewer_user_id=viewer_user_id,
        owner_user_id=owner_user_id,
        is_admin=is_admin,
        author_user_id=author_user_id,
        granted_chapters=granted_chapters,
        granted_books=granted_books,
        include_chapter_matches=include_chapter_matches,
        query=query,
    )
    total = books_query.order_by(None).count()
    if page is not None:
        page_size = max(1, min(page_size, 100))
        max_page = max(1, (total + page_size - 1) // page_size)
        page = min(max(1, page), max_page)
        books_query = books_query.offset((page - 1) * page_size).limit(
            page_size
        )
    books = books_query.all()
    counts = _chapter_counts_for_books(
        db,
        books,
        viewer_user_id=viewer_user_id,
        owner_user_id=owner_user_id,
        is_admin=is_admin,
    )
    return _serialize_books_with_counts(books, counts), total


def get_all_books(
    db: Session,
    *,
    include_hidden: bool = False,
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    is_admin: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    include_chapter_matches: bool = False,
    query: str | None = None,
):
    books, _ = _get_books_page(
        db,
        page=None,
        page_size=20,
        include_hidden=include_hidden,
        viewer_user_id=viewer_user_id,
        owner_user_id=owner_user_id,
        is_admin=is_admin,
        author_user_id=None,
        granted_chapters=granted_chapters,
        granted_books=granted_books,
        include_chapter_matches=include_chapter_matches,
        query=query,
    )
    return books


def get_books_page(
    db: Session,
    *,
    page: int | None,
    page_size: int = 20,
    include_hidden: bool = False,
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    is_admin: bool = False,
    author_user_id: int | None,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    include_chapter_matches: bool = False,
    query: str | None = None,
) -> tuple[list[dict], int]:
    """Return one page of books and the total, both computed in the database."""
    return _get_books_page(
        db,
        page=page,
        page_size=page_size,
        include_hidden=include_hidden,
        viewer_user_id=viewer_user_id,
        owner_user_id=owner_user_id,
        is_admin=is_admin,
        author_user_id=author_user_id,
        granted_chapters=granted_chapters,
        granted_books=granted_books,
        include_chapter_matches=include_chapter_matches,
        query=query,
    )


def get_book(
    db: Session,
    book_id: int,
    *,
    include_hidden: bool = False,
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    is_admin: bool = False,
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
    if (
        book is not None
        and owner_user_id is None
        and not is_admin
        and not _category_is_visible_to(
            book,
            viewer_user_id=viewer_user_id,
            can_view_hidden=False,
        )
    ):
        book = None
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
        _get_book_category_or_404(db, data["category_id"], user_id)
    book = Book(**data)
    db.add(book)
    db.commit()
    db.refresh(book)
    return _serialize_book(book)


def update_book(
    db: Session,
    book_id: int,
    payload: BookUpdate,
    owner_user_id: int | None,
):
    query = db.query(Book).filter(Book.id == book_id)
    if owner_user_id is not None:
        query = query.filter(Book.user_id == owner_user_id)
    book = query.first()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )

    data = payload.model_dump(exclude_unset=True)
    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])
    if data.get("category_id") is not None:
        _get_book_category_or_404(
            db,
            data["category_id"],
            book.user_id,
        )
    for key, value in data.items():
        setattr(book, key, value)
    db.commit()
    db.refresh(book)
    return _serialize_book(book)


def delete_book(
    db: Session,
    book_id: int,
    owner_user_id: int | None,
):
    query = db.query(Book).filter(Book.id == book_id)
    if owner_user_id is not None:
        query = query.filter(Book.user_id == owner_user_id)
    book = query.first()
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
    owner_user_id: int | None,
):
    ids = [item.id for item in payload.items]
    query = db.query(Book).filter(Book.id.in_(ids))
    if owner_user_id is not None:
        query = query.filter(Book.user_id == owner_user_id)
    books = {book.id: book for book in query.all()}
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


def _build_chapter_query(
    db: Session,
    *,
    include_hidden: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    author_user_id: int | None = None,
    book_id: int | None = None,
    pinned: bool | None = None,
    query: str | None = None,
    include_body: bool = True,
    ids_only: bool = False,
    newest_first: bool = False,
    published_only: bool = False,
):
    chapters_query = db.query(Chapter)
    if ids_only:
        chapters_query = chapters_query.options(
            load_only(
                Chapter.id,
                Chapter.user_id,
                Chapter.book_id,
                Chapter.visible,
                Chapter.protected,
                Chapter.published_at,
            )
        )
    else:
        # Chapter serialization only needs the book id/title for the response,
        # plus owner/protected to resolve locks. Loading the whole book row here
        # would read columns the chapter list never uses.
        chapters_query = chapters_query.options(
            contains_eager(Chapter.book).load_only(
                Book.id,
                Book.title,
                Book.user_id,
                Book.protected,
            )
        )
        if not include_body:
            chapters_query = chapters_query.options(
                load_only(*CHAPTER_LIST_COLUMNS)
            )
    chapters_query = chapters_query.join(
        Book, Chapter.book_id == Book.id
    ).outerjoin(
        BookCategory, Book.category_id == BookCategory.id
    )
    if newest_first:
        chapters_query = chapters_query.order_by(
            Chapter.created_at.desc().nullslast(),
            Chapter.id.desc(),
        )
    else:
        chapters_query = chapters_query.order_by(
            Book.order,
            Book.id,
            Chapter.order,
            Chapter.id,
        )
    if owner_user_id is not None:
        chapters_query = chapters_query.filter(
            Chapter.user_id == owner_user_id
        )
    if author_user_id is not None:
        # Public chapter lists only expose the default author. Filtering here
        # keeps searches from scanning every author's rows.
        chapters_query = chapters_query.filter(
            Chapter.user_id == author_user_id
        )
    if book_id is not None:
        chapters_query = chapters_query.filter(Chapter.book_id == book_id)
    if pinned is not None:
        chapters_query = chapters_query.filter(Chapter.pinned.is_(pinned))

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    include_all = (
        include_hidden
        and owner_user_id is None
        and viewer_user_id is None
    )
    if not include_all and owner_user_id is None:
        public_condition = and_(
            Chapter.visible.is_(True),
            Book.visible.is_(True),
            or_(
                Chapter.published_at.is_(None),
                Chapter.published_at <= now,
            ),
            # Hidden categories stay out of public search for guests and for
            # signed-in viewers without ownership. Owned books are still
            # allowed through the separate own_condition below, and admins
            # skip this whole public branch.
            or_(
                Book.category_id.is_(None),
                BookCategory.visible.is_(True),
            ),
        )
        if viewer_user_id is not None:
            own_condition = or_(
                Chapter.user_id == viewer_user_id,
                Book.user_id == viewer_user_id,
            )
            chapters_query = chapters_query.filter(
                or_(public_condition, own_condition)
            )
        else:
            chapters_query = chapters_query.filter(public_condition)
    if published_only:
        chapters_query = chapters_query.filter(
            or_(
                Chapter.published_at.is_(None),
                Chapter.published_at <= now,
            )
        )

    tokens = search_tokens(query)
    # Protected bodies must never influence public search results, since even
    # returning a locked chapter would reveal that its contents contain the
    # query. Owners, admins, and granted readers may still search the bodies
    # they are allowed to open.
    body_unrestricted = owner_user_id is not None or include_all
    body_access = [
        and_(Book.protected.is_(False), Chapter.protected.is_(False)),
    ]
    if granted_books:
        body_access.append(Book.id.in_(granted_books))
    if granted_chapters:
        body_access.append(
            and_(
                Book.protected.is_(False),
                Chapter.id.in_(granted_chapters),
            )
        )
    if viewer_user_id is not None:
        body_access.extend(
            [
                Chapter.user_id == viewer_user_id,
                Book.user_id == viewer_user_id,
            ]
        )
    for token in tokens:
        pattern = like_pattern(token)
        tag_match = (
            db.query(ChapterTag.chapter_id)
            .join(Tag, Tag.id == ChapterTag.tag_id)
            .filter(
                ChapterTag.chapter_id == Chapter.id,
                Tag.name.ilike(pattern, escape="\\"),
            )
            .exists()
        )
        body_match = Chapter.body.ilike(pattern, escape="\\")
        if not body_unrestricted:
            body_match = and_(body_match, or_(*body_access))
        chapters_query = chapters_query.filter(
            or_(
                Chapter.title.ilike(pattern, escape="\\"),
                Chapter.subtitle.ilike(pattern, escape="\\"),
                tag_match,
                body_match,
            )
        )
    return chapters_query


def _serialize_chapter_rows(
    chapters: list[Chapter],
    *,
    include_hidden: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    include_body: bool = True,
    ids_only: bool = False,
):
    include_all = (
        include_hidden
        and owner_user_id is None
        and viewer_user_id is None
    )
    result = []
    for chapter in chapters:
        if ids_only:
            result.append(chapter.id)
            continue

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
        unlocked = include_all or owner_user_id is not None or (
            include_hidden and is_own
        )
        locked = (
            False
            if unlocked
            else _chapter_is_locked(chapter, granted_chapters, granted_books)
        )
        result.append(
            _serialize_chapter(
                chapter,
                locked=locked,
                include_body=include_body,
            )
        )
    return result


def get_all_chapters(
    db: Session,
    *,
    include_hidden: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    author_user_id: int | None = None,
    book_id: int | None = None,
    pinned: bool | None = None,
    query: str | None = None,
    include_body: bool = True,
    ids_only: bool = False,
):
    chapters_query = _build_chapter_query(
        db,
        include_hidden=include_hidden,
        granted_chapters=granted_chapters,
        granted_books=granted_books,
        viewer_user_id=viewer_user_id,
        owner_user_id=owner_user_id,
        author_user_id=author_user_id,
        book_id=book_id,
        pinned=pinned,
        query=query,
        include_body=include_body,
        ids_only=ids_only,
    )
    return _serialize_chapter_rows(
        chapters_query.all(),
        include_hidden=include_hidden,
        granted_chapters=granted_chapters,
        granted_books=granted_books,
        viewer_user_id=viewer_user_id,
        owner_user_id=owner_user_id,
        include_body=include_body,
        ids_only=ids_only,
    )


def get_chapters_page(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    include_hidden: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    author_user_id: int | None = None,
    book_id: int | None = None,
    pinned: bool | None = None,
    query: str | None = None,
    include_body: bool = True,
    ids_only: bool = False,
):
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    chapters_query = _build_chapter_query(
        db,
        include_hidden=include_hidden,
        granted_chapters=granted_chapters,
        granted_books=granted_books,
        viewer_user_id=viewer_user_id,
        owner_user_id=owner_user_id,
        author_user_id=author_user_id,
        book_id=book_id,
        pinned=pinned,
        query=query,
        include_body=include_body,
        ids_only=ids_only,
        newest_first=True,
        published_only=True,
    )
    total = chapters_query.order_by(None).count()
    max_page = max(1, (total + page_size - 1) // page_size)
    page = min(page, max_page)
    chapters = (
        chapters_query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return (
        _serialize_chapter_rows(
            chapters,
            include_hidden=include_hidden,
            granted_chapters=granted_chapters,
            granted_books=granted_books,
            viewer_user_id=viewer_user_id,
            owner_user_id=owner_user_id,
            include_body=include_body,
            ids_only=ids_only,
        ),
        total,
    )


def get_chapter(
    db: Session,
    chapter_id: int,
    *,
    include_hidden: bool = False,
    granted_chapters: frozenset[int] = frozenset(),
    granted_books: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    include_body: bool = True,
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
    include_all = (
        include_hidden
        and owner_user_id is None
        and viewer_user_id is None
    )
    if (
        not include_all
        and owner_user_id is None
        and not is_own
        and not _chapter_is_public(chapter)
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )

    unlocked = include_all or owner_user_id is not None or (
        include_hidden and is_own
    )
    locked = (
        False
        if unlocked
        else _chapter_is_locked(chapter, granted_chapters, granted_books)
    )
    return _serialize_chapter(chapter, locked=locked, include_body=include_body)


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


def _check_pinned_chapter_limit(
    db: Session,
    book_id: int,
    *,
    exclude_chapter_id: int | None = None,
) -> None:
    query = db.query(Chapter).filter(
        Chapter.book_id == book_id,
        Chapter.pinned.is_(True),
    )
    if exclude_chapter_id is not None:
        query = query.filter(Chapter.id != exclude_chapter_id)
    if query.count() >= MAX_PINNED_CHAPTERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"고정 게시글은 책당 최대 {MAX_PINNED_CHAPTERS}개까지 "
                "가능합니다."
            ),
        )


def create_chapter(
    db: Session,
    payload: ChapterCreate,
    user_id: int,
):
    _get_book_or_404(db, payload.book_id, owner_user_id=user_id)
    data = payload.model_dump(exclude={"notify_mastodon", "toc_parent_id"})
    data["tags"] = _clean_tags(data.get("tags"))
    data["user_id"] = user_id
    if data.get("pinned"):
        _check_pinned_chapter_limit(db, payload.book_id)
    chapter = Chapter(**data)
    db.add(chapter)
    db.flush()
    serial_node_crud.ensure_post(
        db,
        user_id,
        payload.book_id,
        chapter.id,
        payload.toc_parent_id,
        set_parent=True,
    )
    sync_chapter_tags(db, chapter)
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
    owner_user_id: int | None,
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

    data = payload.model_dump(exclude_unset=True)
    toc_parent_set = "toc_parent_id" in data
    toc_parent_id = data.pop("toc_parent_id", None)
    if "book_id" in data and data["book_id"] is not None:
        _get_book_or_404(
            db,
            data["book_id"],
            owner_user_id=owner_user_id,
        )
    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])

    next_pinned = data.get("pinned", chapter.pinned)
    next_book_id = data.get("book_id", chapter.book_id)
    if next_pinned and (
        not chapter.pinned or next_book_id != chapter.book_id
    ):
        _check_pinned_chapter_limit(
            db,
            next_book_id,
            exclude_chapter_id=chapter.id,
        )

    was_public = _chapter_is_public(chapter)
    previous_book_id = chapter.book_id
    for key, value in data.items():
        setattr(chapter, key, value)

    target_book_id = data.get("book_id", chapter.book_id) or chapter.book_id
    if target_book_id != previous_book_id:
        # Moving a chapter re-sorts both books so their order always follows
        # the original creation time.
        db.flush()
        _reorder_chapters_by_created_at(db, previous_book_id)
        _reorder_chapters_by_created_at(db, target_book_id)

    db.flush()
    serial_node_crud.ensure_post(
        db,
        chapter.user_id,
        target_book_id,
        chapter.id,
        toc_parent_id,
        set_parent=toc_parent_set,
    )
    sync_chapter_tags(db, chapter)
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
    owner_user_id: int | None,
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
    serial_node = (
        db.query(serial_node_crud.SerialNode)
        .filter(serial_node_crud.SerialNode.chapter_id == chapter_id)
        .first()
    )
    if serial_node is not None:
        db.delete(serial_node)
    db.delete(chapter)
    db.commit()
    return True


def reorder_chapters(
    db: Session,
    payload: ChapterReorderRequest,
    owner_user_id: int | None,
):
    ids = [item.id for item in payload.items]
    query = db.query(Chapter).filter(Chapter.id.in_(ids))
    if owner_user_id is not None:
        query = query.filter(Chapter.user_id == owner_user_id)
    chapters = {chapter.id: chapter for chapter in query.all()}
    missing = set(ids) - set(chapters)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist chapter: {sorted(missing)}",
        )

    book_ids = {item.book_id for item in payload.items if item.book_id}
    if book_ids:
        book_query = db.query(Book).filter(Book.id.in_(book_ids))
        if owner_user_id is not None:
            book_query = book_query.filter(Book.user_id == owner_user_id)
        existing_books = {book.id for book in book_query.all()}
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
        serial_node_crud.ensure_post(
            db,
            chapter.user_id,
            chapter.book_id,
            chapter.id,
            None,
            set_parent=False,
        )
    db.commit()
    return True


# Owner-only chapter search. Unlike the public list endpoint this searches
# body text too, but it returns only a short snippet instead of the whole body.
_TAG_PATTERN = re.compile(r"<[^>]*>")
_WHITESPACE_PATTERN = re.compile(r"\s+")
SNIPPET_BEFORE = 60
SNIPPET_AFTER = 80


def _body_snippet(body: str | None, tokens: list[str]) -> str:
    text = _WHITESPACE_PATTERN.sub(
        " ", html.unescape(_TAG_PATTERN.sub(" ", body or ""))
    ).strip()
    if not text:
        return ""

    lowered = text.lower()
    hits = [lowered.find(token) for token in tokens]
    hits = [hit for hit in hits if hit >= 0]
    if hits:
        center = min(hits)
        start = max(0, center - SNIPPET_BEFORE)
        end = min(len(text), center + SNIPPET_AFTER)
    else:
        start, end = 0, SNIPPET_BEFORE + SNIPPET_AFTER

    snippet = text[start:end].strip()
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet = snippet + "…"
    return snippet


def search_chapters_for_owner(
    db: Session,
    *,
    owner_user_id: int,
    query: str | None,
    limit: int = 50,
) -> list[dict]:
    tokens = search_tokens(query)
    if not tokens:
        return []

    chapters_query = db.query(Chapter).filter(
        Chapter.user_id == owner_user_id
    )
    for token in tokens:
        pattern = like_pattern(token)
        tag_match = (
            db.query(ChapterTag.chapter_id)
            .join(Tag, Tag.id == ChapterTag.tag_id)
            .filter(
                ChapterTag.chapter_id == Chapter.id,
                Tag.name.ilike(pattern, escape="\\"),
            )
            .exists()
        )
        chapters_query = chapters_query.filter(
            or_(
                Chapter.title.ilike(pattern, escape="\\"),
                Chapter.subtitle.ilike(pattern, escape="\\"),
                Chapter.body.ilike(pattern, escape="\\"),
                tag_match,
            )
        )

    chapters = (
        chapters_query.order_by(
            Chapter.created_at.desc(), Chapter.id.desc()
        )
        .limit(limit)
        .all()
    )
    return [
        {
            "id": chapter.id,
            "book_id": chapter.book_id,
            "title": chapter.title,
            "subtitle": chapter.subtitle,
            "created_at": _iso_utc(chapter.created_at),
            "book": (
                {
                    "id": chapter.book.id,
                    "title": chapter.book.title,
                }
                if chapter.book
                else None
            ),
            "snippet": _body_snippet(chapter.body, tokens),
        }
        for chapter in chapters
    ]
