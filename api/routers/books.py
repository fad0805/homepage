from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from crud.books import (
    create_book,
    create_book_category,
    delete_book,
    delete_book_category,
    get_all_book_categories,
    get_book,
    get_books_page,
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
from .utils import (
    get_default_author_id,
    get_gallery_grants,
    get_optional_user,
    is_admin,
    require_auth,
)

router = APIRouter()


@router.get("/")
@router.get("")
def get_books(
    request: Request,
    response: Response,
    mine: bool = False,
    q: str | None = None,
    tag: str | None = None,
    include_chapter_matches: bool = False,
    page: int | None = None,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    filters: dict = {
        "query": q,
        "tag": tag,
        "include_chapter_matches": include_chapter_matches,
    }
    if mine:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        filters.update(include_hidden=True, owner_user_id=current_user.id)
    elif current_user is not None and is_admin(current_user):
        filters.update(include_hidden=True, is_admin=True)
    else:
        grants = get_gallery_grants(request, db)
        filters.update(
            include_hidden=current_user is not None,
            viewer_user_id=current_user.id if current_user else None,
            granted_chapters=grants.chapters,
            granted_books=grants.books,
        )

    author_id = get_default_author_id(db)
    if author_id is None:
        books, total = [], 0
    else:
        books, total = get_books_page(
            db,
            page=page,
            page_size=page_size,
            author_user_id=author_id,
            **filters,
        )
    response.headers["X-Total-Count"] = str(total)
    return books


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
    return reorder_books(db, payload, user.id)


# Book categories. Static paths must be declared before "/{book_id}".
@router.get("/categories")
def get_book_categories(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return get_all_book_categories(db, user.id)


@router.post("/categories")
def post_book_category(
    payload: BookCategoryCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return create_book_category(db, payload, user.id)


@router.put("/categories/reorder")
def put_book_category_order(
    payload: BookCategoryReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return reorder_book_categories(db, payload, user.id)


@router.put("/categories/{category_id}")
def put_book_category(
    category_id: int,
    payload: BookCategoryUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return update_book_category(db, category_id, payload, user.id)


@router.delete("/categories/{category_id}")
def remove_book_category(
    category_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return delete_book_category(db, category_id, user.id)


@router.get("/{book_id}")
def get_book_detail(
    book_id: int,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
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
    if current_user is not None and is_admin(current_user):
        book = get_book(db, book_id, include_hidden=True, is_admin=True)
    else:
        book = get_book(
            db,
            book_id,
            include_hidden=current_user is not None,
            viewer_user_id=current_user.id if current_user else None,
        )
    if book.get("user_id") != get_default_author_id(db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )
    return book


@router.put("/{book_id}")
def put_book(
    book_id: int,
    payload: BookUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return update_book(db, book_id, payload, user.id)


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
