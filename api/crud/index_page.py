from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.html_sanitizer import sanitize_index_html
from core.index_page import (
    DEFAULT_COPYRIGHT_NAME,
    DEFAULT_INDEX_BODY_HTML,
    DEFAULT_INDEX_SUBTITLE,
    DEFAULT_INDEX_TITLE,
    MAX_COPYRIGHT_NAME_LENGTH,
    MAX_FAVICON_URL_LENGTH,
    MAX_SUBTITLE_LENGTH,
    MAX_TITLE_LENGTH,
    clean_index_text,
)
from models.index_page import IndexPage


def _serialize(page: IndexPage | None, scope: str, user_id: int | None) -> dict:
    return {
        "scope": scope,
        "user_id": user_id,
        "title": (
            page.title if page is not None and page.title is not None
            else DEFAULT_INDEX_TITLE
        ),
        "subtitle": (
            page.subtitle if page is not None and page.subtitle is not None
            else DEFAULT_INDEX_SUBTITLE
        ),
        "copyright_name": (
            page.copyright_name
            if page is not None and page.copyright_name is not None
            else DEFAULT_COPYRIGHT_NAME
        ),
        "favicon_url": page.favicon_url if page is not None else None,
        "content_html": sanitize_index_html(
            page.content_html if page else DEFAULT_INDEX_BODY_HTML
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
        title=integrated.title,
        subtitle=integrated.subtitle,
        copyright_name=integrated.copyright_name,
        favicon_url=integrated.favicon_url,
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
    return sanitize_index_html(
        page.content_html if page else DEFAULT_INDEX_BODY_HTML
    )


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
    title: str | None = None,
    subtitle: str | None = None,
    copyright_name: str | None = None,
    favicon_url: str | None = None,
) -> dict:
    page = get_index_page(db, scope=scope, user_id=user_id)
    safe_html = sanitize_index_html(content_html)
    clean_title = (
        None if title is None
        else clean_index_text(title, MAX_TITLE_LENGTH)
    )
    clean_subtitle = (
        None if subtitle is None
        else clean_index_text(subtitle, MAX_SUBTITLE_LENGTH)
    )
    clean_copyright_name = (
        None if copyright_name is None
        else clean_index_text(copyright_name, MAX_COPYRIGHT_NAME_LENGTH)
    )
    clean_favicon_url = (
        None
        if favicon_url is None
        else clean_index_text(favicon_url, MAX_FAVICON_URL_LENGTH) or None
    )

    if page is None:
        page = IndexPage(
            scope=scope,
            user_id=user_id if scope == "author" else None,
            title=clean_title,
            subtitle=clean_subtitle,
            copyright_name=clean_copyright_name,
            favicon_url=clean_favicon_url,
            content_html=safe_html,
        )
        db.add(page)
    else:
        if title is not None:
            page.title = clean_title
        if subtitle is not None:
            page.subtitle = clean_subtitle
        if copyright_name is not None:
            page.copyright_name = clean_copyright_name
        if favicon_url is not None:
            page.favicon_url = clean_favicon_url
        page.content_html = safe_html
    db.commit()
    db.refresh(page)
    return _serialize(page, scope, page.user_id)
