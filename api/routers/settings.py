from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.mastodon import (
    MastodonError,
    detect_service,
    get_mastodon_settings,
    normalize_instance_url,
    post_status,
)
from crud.settings import read_mastodon_settings, update_mastodon_settings
from db.session import get_db
from models.settings import MastodonSettings
from schemas.settings import (
    MastodonSettingsRead,
    MastodonSettingsUpdate,
    MastodonTestRequest,
    MastodonTestResult,
    MastodonTestStatusResult,
)

from .utils import require_admin

router = APIRouter()


@router.get("/mastodon", response_model=MastodonSettingsRead)
def get_mastodon(
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Return the signed-in admin's social integration settings."""
    return read_mastodon_settings(db, user.id)


@router.put("/mastodon", response_model=MastodonSettingsRead)
def put_mastodon(
    payload: MastodonSettingsUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Save the Mastodon/Misskey instance and access token."""
    return update_mastodon_settings(db, payload, user.id)


@router.post("/mastodon/test", response_model=MastodonTestResult)
def test_mastodon(
    payload: MastodonTestRequest,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Verify the credentials without changing the saved settings."""
    settings = get_mastodon_settings(db, user.id)
    instance_url = payload.instance_url
    if instance_url is None and settings is not None:
        instance_url = settings.instance_url
    access_token = (payload.access_token or "").strip()
    if not access_token and settings is not None:
        access_token = (settings.access_token or "").strip()

    try:
        normalized_instance = normalize_instance_url(instance_url)
    except MastodonError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    if not normalized_instance or not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인스턴스 주소와 액세스 토큰을 입력해주세요.",
        )

    probe = MastodonSettings(
        instance_url=normalized_instance,
        access_token=access_token,
    )

    try:
        provider, account = detect_service(probe)
    except MastodonError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    service_name = "미스키" if provider == "misskey" else "마스토돈"
    return {
        "ok": True,
        "provider": provider,
        "account": account.get("account"),
        "display_name": account.get("display_name"),
        "message": f"{service_name} 계정에 연결되었습니다.",
    }


@router.post("/mastodon/test-status", response_model=MastodonTestStatusResult)
def test_mastodon_status(
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Post a visible test status using the saved credentials."""
    settings = get_mastodon_settings(db, user.id)
    if not settings or not settings.instance_url or not settings.access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="연결 정보를 먼저 저장해주세요.",
        )

    try:
        status_id = post_status(
            settings,
            "소셜 알림 연결 테스트입니다.",
        )
    except MastodonError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    return {
        "ok": True,
        "status_id": status_id,
        "message": "테스트 알림을 게시했습니다.",
    }
