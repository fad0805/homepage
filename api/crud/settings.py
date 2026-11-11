from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from core.mastodon import (
    MastodonError,
    get_mastodon_settings,
    get_or_create_mastodon_settings,
    normalize_instance_url,
    normalize_site_url,
    serialize_mastodon_settings,
)
from schemas.settings import MastodonSettingsUpdate


def read_mastodon_settings(db: Session) -> dict:
    return serialize_mastodon_settings(get_mastodon_settings(db))


def update_mastodon_settings(
    db: Session,
    payload: MastodonSettingsUpdate,
) -> dict:
    settings = get_or_create_mastodon_settings(db)

    if payload.enabled is not None:
        settings.enabled = payload.enabled

    if payload.visibility is not None:
        settings.visibility = payload.visibility

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
    if token:
        settings.access_token = token

    if settings.enabled and (
        not settings.instance_url or not settings.access_token
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "마스토돈 자동 게시를 켜려면 인스턴스 주소와 액세스 "
                "토큰을 모두 입력해주세요."
            ),
        )

    db.commit()
    db.refresh(settings)
    return serialize_mastodon_settings(settings)
