import secrets
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from core.config import (
    ENVIRONMENT,
    GALLERY_COOKIE_MAX_AGE,
    GALLERY_COOKIE_NAME,
    GALLERY_INVITE_HOURS,
    GALLERY_SESSION_DAYS,
)
from core.security import (
    generate_gallery_code,
    hash_gallery_code,
    hash_gallery_token,
    normalize_gallery_code,
)
from crud import gallery as gallery_crud
from db.session import get_db
from routers.utils import get_client_ip, require_auth
from schemas.gallery import (
    GalleryInviteCreate,
    GalleryInviteCreated,
    GalleryInviteRead,
    GallerySessionRead,
    GalleryUnlockRequest,
)

router = APIRouter()

_unlock_attempts: dict[str, list[datetime]] = defaultdict(list)
MAX_ATTEMPTS_PER_MINUTE = 10


def _rate_limit(request: Request) -> None:
    now = datetime.utcnow()
    ip = get_client_ip(request)
    _unlock_attempts[ip] = [
        attempt
        for attempt in _unlock_attempts[ip]
        if now - attempt < timedelta(minutes=1)
    ]
    if len(_unlock_attempts[ip]) >= MAX_ATTEMPTS_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="시도 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.",
        )
    _unlock_attempts[ip].append(now)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=GALLERY_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=ENVIRONMENT == "production",
        samesite="lax",
        max_age=GALLERY_COOKIE_MAX_AGE,
        path="/",
    )


def _invite_status(invite, now: datetime) -> str:
    if invite.revoked_at is not None:
        return "revoked"
    if invite.used_at is not None:
        return "used"
    if invite.expires_at <= now:
        return "expired"
    return "unused"


def _session_status(session, now: datetime) -> str:
    if session.revoked_at is not None:
        return "revoked"
    if session.expires_at <= now:
        return "expired"
    return "active"


@router.post("/unlock")
def unlock_gallery(
    payload: GalleryUnlockRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Consume a one-time code and issue a browser access cookie."""
    _rate_limit(request)

    normalized = normalize_gallery_code(payload.code)
    if not normalized:
        raise HTTPException(
            status_code=401,
            detail="비밀번호가 올바르지 않거나 만료되었습니다.",
        )

    now = datetime.utcnow()
    invite = gallery_crud.get_invite_by_hash(
        db,
        hash_gallery_code(normalized),
    )
    if (
        invite is None
        or invite.used_at is not None
        or invite.revoked_at is not None
        or invite.expires_at <= now
    ):
        raise HTTPException(
            status_code=401,
            detail="비밀번호가 올바르지 않거나 만료되었습니다.",
        )

    # Only one concurrent request can mark the invite used.
    if not gallery_crud.consume_invite(
        db,
        invite.id,
        now,
        get_client_ip(request),
    ):
        db.rollback()
        raise HTTPException(
            status_code=401,
            detail="비밀번호가 올바르지 않거나 만료되었습니다.",
        )

    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(days=GALLERY_SESSION_DAYS)
    user_agent = (request.headers.get("user-agent") or "")[:255] or None
    gallery_crud.create_session(
        db,
        hash_gallery_token(token),
        expires_at,
        get_client_ip(request),
        user_agent,
    )
    db.commit()

    _set_cookie(response, token)
    return {"success": True, "expires_at": expires_at}


@router.get("/status")
def gallery_status(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Tell the web app whether this browser still has access."""
    token = request.cookies.get(GALLERY_COOKIE_NAME)
    if not token:
        return {"unlocked": False}

    now = datetime.utcnow()
    session = gallery_crud.get_session_by_hash(
        db,
        hash_gallery_token(token),
    )
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at <= now
    ):
        response.delete_cookie(GALLERY_COOKIE_NAME, path="/")
        return {"unlocked": False}

    # Avoid a write on every page view.
    if (
        session.last_seen_at is None
        or now - session.last_seen_at > timedelta(minutes=5)
    ):
        session.last_seen_at = now
        db.commit()

    return {"unlocked": True, "expires_at": session.expires_at}


@router.post(
    "/invites",
    response_model=GalleryInviteCreated,
)
def create_gallery_invite(
    payload: GalleryInviteCreate,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Generate a one-time code. The plaintext is returned only once."""
    code = generate_gallery_code()
    hours = payload.expires_in_hours or GALLERY_INVITE_HOURS
    note = (payload.note or "").strip() or None
    expires_at = datetime.utcnow() + timedelta(hours=hours)

    invite = gallery_crud.create_invite(
        db,
        hash_gallery_code(code),
        note,
        expires_at,
    )
    db.commit()

    return {
        "id": invite.id,
        "code": code,
        "note": invite.note,
        "expires_at": invite.expires_at,
    }


@router.get(
    "/invites",
    response_model=list[GalleryInviteRead],
)
def read_gallery_invites(
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    now = datetime.utcnow()
    return [
        {
            "id": invite.id,
            "note": invite.note,
            "created_at": invite.created_at,
            "expires_at": invite.expires_at,
            "used_at": invite.used_at,
            "revoked_at": invite.revoked_at,
            "status": _invite_status(invite, now),
        }
        for invite in gallery_crud.list_invites(db)
    ]


@router.delete("/invites/{invite_id}")
def revoke_gallery_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    if not gallery_crud.revoke_invite(
        db,
        invite_id,
        datetime.utcnow(),
    ):
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail="초대를 찾을 수 없습니다.",
        )
    db.commit()
    return {"success": True}


@router.get(
    "/sessions",
    response_model=list[GallerySessionRead],
)
def read_gallery_sessions(
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    now = datetime.utcnow()
    return [
        {
            "id": session.id,
            "created_at": session.created_at,
            "expires_at": session.expires_at,
            "last_seen_at": session.last_seen_at,
            "revoked_at": session.revoked_at,
            "ip_address": session.ip_address,
            "user_agent": session.user_agent,
            "status": _session_status(session, now),
        }
        for session in gallery_crud.list_sessions(db)
    ]


@router.delete("/sessions/{session_id}")
def revoke_gallery_session(
    session_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    """Force one unlocked browser to sign in again."""
    if not gallery_crud.revoke_session(
        db,
        session_id,
        datetime.utcnow(),
    ):
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail="세션을 찾을 수 없습니다.",
        )
    db.commit()
    return {"success": True}
