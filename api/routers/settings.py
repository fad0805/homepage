from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.mastodon import (
    MastodonError,
    detect_service,
    normalize_instance_url,
    post_status,
)
from crud.settings import (
    create_mastodon_settings,
    delete_mastodon_settings,
    get_mastodon_settings_by_id,
    list_mastodon_settings,
    update_mastodon_settings,
)
from db.session import get_db
from models.settings import MastodonSettings
from schemas.settings import (
    MastodonSettingsCreate,
    MastodonSettingsRead,
    MastodonSettingsUpdate,
    MastodonTestRequest,
    MastodonTestResult,
    MastodonTestStatusResult,
)

from .utils import require_admin

router = APIRouter()


@router.get("/mastodon", response_model=list[MastodonSettingsRead])
@router.get("/mastodon/", response_model=list[MastodonSettingsRead], include_in_schema=False)
def get_mastodon_profiles(
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Return the signed-in admin's notification profiles."""
    return list_mastodon_settings(db, user.id)


@router.post("/mastodon", response_model=MastodonSettingsRead)
@router.post("/mastodon/", response_model=MastodonSettingsRead, include_in_schema=False)
def create_mastodon_profile(
    payload: MastodonSettingsCreate,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Create a new notification profile."""
    return create_mastodon_settings(db, payload, user.id)


@router.post("/mastodon/test", response_model=MastodonTestResult)
def test_mastodon(
    payload: MastodonTestRequest,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Verify credentials without changing any saved profile."""
    saved = (
        get_mastodon_settings_by_id(
            db,
            payload.settings_id,
            user.id,
        )
        if payload.settings_id is not None
        else None
    )
    instance_url = payload.instance_url or (
        saved.instance_url if saved is not None else None
    )
    access_token = (payload.access_token or "").strip()
    if not access_token and saved is not None:
        access_token = (saved.access_token or "").strip()

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


@router.post(
    "/mastodon/{settings_id}/test-status",
    response_model=MastodonTestStatusResult,
)
def test_mastodon_status(
    settings_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Post a visible test status using one saved profile."""
    settings = get_mastodon_settings_by_id(db, settings_id, user.id)
    if not settings.instance_url or not settings.access_token:
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


@router.put("/mastodon/{settings_id}", response_model=MastodonSettingsRead)
def put_mastodon_profile(
    settings_id: int,
    payload: MastodonSettingsUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Update one of the signed-in admin's notification profiles."""
    return update_mastodon_settings(
        db,
        settings_id,
        payload,
        user.id,
    )


@router.delete("/mastodon/{settings_id}")
def remove_mastodon_profile(
    settings_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_admin),
):
    """Delete one of the signed-in admin's notification profiles."""
    delete_mastodon_settings(db, settings_id, user.id)
    return {"success": True}
