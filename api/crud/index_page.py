from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.html_sanitizer import sanitize_index_html
from models.index_page import IndexPage


def _serialize(page: IndexPage | None, scope: str, user_id: int | None) -> dict:
    return {
        "scope": scope,
        "user_id": user_id,
        "content_html": sanitize_index_html(
            page.content_html if page else ""
        ),
    }


def _query_index_page(
    db: Session,
    *,
    scope: str,
    user_id: int | None = None,
) -> IndexPage | None:
    query = db.query(IndexPage).filter(IndexPage.scope == scope)
    if scope == "author":
        if user_id is None:
            return None
        query = query.filter(IndexPage.user_id == user_id)
    else:
        query = query.filter(IndexPage.user_id.is_(None))
    return query.first()


def get_index_page(
    db: Session,
    *,
    scope: str,
    user_id: int | None = None,
) -> IndexPage | None:
    """Return an index page, copying the integrated seed to a new author."""
    page = _query_index_page(db, scope=scope, user_id=user_id)
    if page is not None or scope != "author" or user_id is None:
        return page

    integrated = _query_index_page(db, scope="integrated")
    if integrated is None:
        return None

    page = IndexPage(
        scope="author",
        user_id=user_id,
        content_html=integrated.content_html,
    )
    db.add(page)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request may have created the row first.
        db.rollback()
        return _query_index_page(db, scope=scope, user_id=user_id)
    db.refresh(page)
    return page


def get_index_page_content(
    db: Session,
    *,
    scope: str,
    user_id: int | None = None,
) -> str:
    page = get_index_page(db, scope=scope, user_id=user_id)
    return sanitize_index_html(page.content_html if page else "")


def get_index_page_read(
    db: Session,
    *,
    scope: str,
    user_id: int | None = None,
) -> dict:
    page = get_index_page(db, scope=scope, user_id=user_id)
    return _serialize(page, scope, user_id)


def update_index_page(
    db: Session,
    *,
    scope: str,
    user_id: int | None,
    content_html: str,
) -> dict:
    page = get_index_page(db, scope=scope, user_id=user_id)
    safe_html = sanitize_index_html(content_html)
    if page is None:
        page = IndexPage(
            scope=scope,
            user_id=user_id if scope == "author" else None,
            content_html=safe_html,
        )
        db.add(page)
    else:
        page.content_html = safe_html
    db.commit()
    db.refresh(page)
    return _serialize(page, scope, page.user_id)
