from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from core.mastodon import (
    MastodonError,
    clear_pending_chapters_outside_scope,
    detect_service,
    get_mastodon_settings,
    get_or_create_mastodon_settings,
    normalize_instance_url,
    normalize_site_url,
    serialize_mastodon_settings,
)
from models.books import Book
from schemas.settings import MastodonSettingsUpdate


def read_mastodon_settings(db: Session, user_id: int) -> dict:
    return serialize_mastodon_settings(
        get_mastodon_settings(db, user_id)
    )


def update_mastodon_settings(
    db: Session,
    payload: MastodonSettingsUpdate,
    user_id: int,
) -> dict:
    settings = get_or_create_mastodon_settings(db, user_id)

    if payload.enabled is not None:
        settings.enabled = payload.enabled

    if payload.visibility is not None:
        settings.visibility = payload.visibility

    if payload.notify_scope is not None:
        settings.notify_scope = payload.notify_scope

    if settings.notify_scope == "book":
        if "notify_book_id" in payload.model_fields_set:
            target_book_id = payload.notify_book_id
        else:
            target_book_id = settings.notify_book_id

        if target_book_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="알림 대상을 특정 책으로 설정하려면 책을 선택해주세요.",
            )

        target_book = db.get(Book, target_book_id)
        if target_book is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="알림 대상 책을 찾을 수 없습니다.",
            )
        settings.notify_book_id = target_book.id
    else:
        settings.notify_book_id = None

    if payload.instance_url is not None:
        try:
            settings.instance_url = normalize_instance_url(
                payload.instance_url
            )
        except MastodonError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error

    if payload.site_url is not None:
        try:
            settings.site_url = normalize_site_url(payload.site_url)
        except MastodonError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error

    token = (payload.access_token or "").strip()
    credentials_changed = bool(token) or payload.instance_url is not None
    if token:
        settings.access_token = token

    if (
        (credentials_changed or payload.enabled is True)
        and settings.instance_url
        and settings.access_token
    ):
        try:
            provider, _account = detect_service(settings)
        except MastodonError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error
        settings.provider = provider

    if settings.enabled and (
        not settings.instance_url or not settings.access_token
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "마스토돈/미스키 자동 게시를 켜려면 인스턴스 주소와 "
                "액세스 토큰을 모두 입력해주세요."
            ),
        )

    clear_pending_chapters_outside_scope(db, settings)

    db.commit()
    db.refresh(settings)
    return serialize_mastodon_settings(settings)
