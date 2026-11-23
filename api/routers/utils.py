import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Request, Response, Depends, HTTPException, status
import jwt
from sqlalchemy.orm import Session

from core.config import (
    ENVIRONMENT,
    AUTH_COOKIE_MAX_AGE,
    GALLERY_COOKIE_NAME,
    REFRESH_TOKEN_EXPIRE_DAYS,
    REFRESH_TOKEN_GRACE_SECONDS,
)
from core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_gallery_token,
    hash_refresh_token,
    is_refresh_token_hash,
)
from crud import gallery as gallery_crud
from crud.users import (
    delete_user_session,
    get_user,
    get_user_session,
    get_user_session_by_token,
)
from db.session import get_db
from models.users import User, UserSession


def _refresh_token_jti(session_id: int, expires_at: datetime) -> str:
    """Derive a stable jti from the session and its expiry."""
    raw = f"{session_id}:{expires_at.isoformat()}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def create_session_refresh_token(
    session_id: int,
    username: str,
    expires_at: datetime,
) -> str:
    """Create the one refresh token that is valid for this session expiry."""
    return create_refresh_token(
        data={"sub": username, "sid": session_id},
        expires_at=expires_at,
        jti=_refresh_token_jti(session_id, expires_at),
    )


def get_default_author_id(db: Session) -> int | None:
    """Return the author whose content currently powers the public site.

    The multi-author public routing is not in place yet, so public views stay
    on one author. ``DEFAULT_AUTHOR_ID`` can pin it explicitly; otherwise the
    first account (the existing admin author) is used.
    """
    configured = (os.getenv("DEFAULT_AUTHOR_ID") or "").strip()
    if configured:
        try:
            configured_id = int(configured)
        except ValueError:
            configured_id = None
        if configured_id is not None:
            user = db.query(User).filter(User.id == configured_id).first()
            if user is not None:
                return user.id

    user = db.query(User).order_by(User.id.asc()).first()
    return user.id if user is not None else None


def filter_by_author(
    items: list[dict],
    author_id: int | None,
) -> list[dict]:
    """Keep public payloads that belong to the selected author."""
    if author_id is None:
        return []
    return [item for item in items if item.get("user_id") == author_id]


@dataclass(frozen=True)
class GalleryGrants:
    """Resources unlocked by the browser's gallery cookie."""

    illustrations: frozenset[int] = frozenset()
    chapters: frozenset[int] = frozenset()
    books: frozenset[int] = frozenset()


def get_gallery_grants(request: Request, db: Session) -> GalleryGrants:
    """Resolve the gallery session grants carried by this request.

    Protected pages are rendered by Next.js server components, so the API
    cannot rely on the browser calling it directly. The server forwards the
    gallery cookie and this helper turns it into resource ids.
    """
    token = request.cookies.get(GALLERY_COOKIE_NAME)
    if not token:
        return GalleryGrants()

    session = gallery_crud.get_session_by_hash(
        db,
        hash_gallery_token(token),
    )
    if (
        session is None
        or session.revoked_at is not None
        or gallery_crud.session_is_expired(session)
    ):
        return GalleryGrants()

    grants = session.grants
    return GalleryGrants(
        illustrations=frozenset(
            grant.illustration_id
            for grant in grants
            if grant.illustration_id is not None
        ),
        chapters=frozenset(
            grant.chapter_id
            for grant in grants
            if grant.chapter_id is not None
        ),
        books=frozenset(
            grant.book_id
            for grant in grants
            if grant.book_id is not None
        ),
    )


def get_client_ip(request: Request) -> str:
    """Resolve the originating client IP, preferring proxy headers.

    Cloudflare overwrites ``CF-Connecting-IP`` with the address it saw, so it
    is more trustworthy than a client-supplied ``X-Forwarded-For`` value when
    the site is behind the Cloudflare proxy.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _set_auth_cookie(response: Response, key: str, token: str) -> None:
    response.set_cookie(
        key=key,
        value=token,
        httponly=True,
        secure=True if ENVIRONMENT == 'production' else False,
        samesite="Strict",
        max_age=AUTH_COOKIE_MAX_AGE,
    )


def get_access_token_from_cookie(request: Request) -> Optional[str]:
    return request.cookies.get("access_token")


def get_refresh_token_from_cookie(request: Request) -> Optional[str]:
    return request.cookies.get("refresh_token")


def _token_matches(stored: Optional[str], token: Optional[str]) -> bool:
    if not stored or not token:
        return False
    if is_refresh_token_hash(stored):
        return hmac.compare_digest(
            stored.encode(),
            hash_refresh_token(token).encode(),
        )
    # Compatibility with a plaintext row from an older process.
    return hmac.compare_digest(stored.encode(), token.encode())


def _rotated_token_is_in_grace(
    session: UserSession, token: Optional[str]
) -> bool:
    """Accept the previous refresh token briefly after a rotation."""
    if not _token_matches(session.previous_refresh_token_hash, token):
        return False
    if session.refresh_token_rotated_at is None:
        return False
    return datetime.utcnow() - session.refresh_token_rotated_at <= timedelta(
        seconds=REFRESH_TOKEN_GRACE_SECONDS
    )


def _session_expired(session: UserSession) -> bool:
    return session.expires_at <= datetime.utcnow()


def get_session_id_from_payload(payload: dict) -> Optional[int]:
    """Read the integer session id from a token payload."""
    session_id = payload.get("sid")
    if session_id is None:
        return None
    try:
        return int(session_id)
    except (TypeError, ValueError):
        return None


def _find_refresh_session(
    db: Session,
    session_id: Optional[int],
    refresh_token: Optional[str],
) -> Optional[UserSession]:
    if session_id is not None:
        return get_user_session(db, session_id)
    # Tokens issued before the multi-session migration have no session id.
    return get_user_session_by_token(db, refresh_token)


def _refresh_auth_cookies(
    response: Response,
    new_access_token: str,
    new_refresh_token: str | None = None,
) -> None:
    _set_auth_cookie(response, "access_token", new_access_token)
    if new_refresh_token is not None:
        _set_auth_cookie(response, "refresh_token", new_refresh_token)


def _rotate_session_token(
    db: Session,
    session: UserSession,
    username: str,
) -> str | None:
    """Store a new token digest only if the current row did not change."""
    current_stored = session.refresh_token_hash
    if not current_stored:
        return None

    previous_hash = (
        current_stored
        if is_refresh_token_hash(current_stored)
        else hash_refresh_token(current_stored)
    )
    now = datetime.utcnow()
    new_expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    new_refresh_token = create_session_refresh_token(
        session.id,
        username,
        new_expires_at,
    )
    rotated = (
        db.query(UserSession)
        .filter(
            UserSession.id == session.id,
            UserSession.refresh_token_hash == current_stored,
        )
        .update(
            {
                UserSession.previous_refresh_token_hash: previous_hash,
                UserSession.refresh_token_hash: hash_refresh_token(
                    new_refresh_token
                ),
                UserSession.refresh_token_rotated_at: now,
                UserSession.last_used_at: now,
                UserSession.expires_at: new_expires_at,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return new_refresh_token if rotated else None


def refresh_access_token(
    db: Session,
    refresh_token: str = Depends(get_refresh_token_from_cookie)
):
    """
    Refresh one browser/device session using its own refresh token.

    Each sign-in has an independent UserSession, so signing in on a phone no
    longer replaces the desktop's token. Rotation is still atomic per session,
    and the previous token is accepted briefly so concurrent requests (for
    example several tabs restored after sleep) do not invalidate each other.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not refresh_token:
        raise credentials_exception

    try:
        payload = decode_refresh_token(refresh_token)
    except jwt.ExpiredSignatureError:
        raise credentials_exception
    except jwt.InvalidTokenError:
        raise credentials_exception

    username = payload.get("sub")
    session_id = get_session_id_from_payload(payload)
    if not username:
        raise credentials_exception

    try:
        user = get_user(db, username)
    except ValueError:
        raise credentials_exception

    session = _find_refresh_session(db, session_id, refresh_token)
    if not session or session.user_id != user.id:
        raise credentials_exception
    if _session_expired(session):
        delete_user_session(db, session)
        raise credentials_exception

    new_access_token = create_access_token(
        data={"sub": username, "sid": session.id}
    )

    current_matches = _token_matches(
        session.refresh_token_hash,
        refresh_token,
    )
    previous_matches = _rotated_token_is_in_grace(
        session,
        refresh_token,
    )

    if not current_matches and not previous_matches:
        # Do not revoke the active session for a stale token. An old tab must
        # not be able to sign out the current browser/device.
        raise credentials_exception

    if current_matches:
        new_refresh_token = _rotate_session_token(db, session, username)
        if new_refresh_token:
            return username, new_access_token, new_refresh_token

    # A delayed tab may present the previous token, or a concurrent refresh may
    # have won the rotation. Rebuild the token that is current now so every
    # response writes the same cookie value instead of starting a new rotation
    # chain that depends on response arrival order.
    db.refresh(session)
    if current_matches or _rotated_token_is_in_grace(session, refresh_token):
        current_refresh_token = create_session_refresh_token(
            session.id, username, session.expires_at
        )
        if _token_matches(session.refresh_token_hash, current_refresh_token):
            return username, new_access_token, current_refresh_token

    # Legacy sessions with a random jti cannot be rebuilt. Leave the refresh
    # cookie untouched so the winning response's cookie is not overwritten.
    if current_matches or previous_matches:
        return username, new_access_token, None

    raise credentials_exception


def get_current_user_from_token(
    db: Session,
    request: Request,
    response: Response,
    token: Optional[str] = Depends(get_access_token_from_cookie)
):
    """
    Get the current user from the access token.

    If the access token is missing or expired, the browser's own refresh token
    is used and the rotated cookies are written to the response.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid access token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        refresh_token = get_refresh_token_from_cookie(request)
        if not refresh_token:
            raise credentials_exception
        username, new_access_token, new_refresh_token = refresh_access_token(
            db, refresh_token=refresh_token
        )
        _refresh_auth_cookies(
            response,
            new_access_token,
            new_refresh_token,
        )
        return _get_user_or_401(db, username, credentials_exception)

    session_id = None
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        session_id = get_session_id_from_payload(payload)
    except jwt.ExpiredSignatureError:
        refresh_token = get_refresh_token_from_cookie(request)
        if not refresh_token:
            raise credentials_exception
        username, new_access_token, new_refresh_token = refresh_access_token(
            db, refresh_token=refresh_token
        )
        _refresh_auth_cookies(
            response,
            new_access_token,
            new_refresh_token,
        )
        return _get_user_or_401(db, username, credentials_exception)
    except jwt.InvalidTokenError:
        raise credentials_exception

    if not username:
        raise credentials_exception

    user = _get_user_or_401(db, username, credentials_exception)

    # Access tokens issued before the multi-session migration have no sid and
    # remain valid until they expire.
    if session_id is not None:
        session = get_user_session(db, session_id)
        if not session or session.user_id != user.id:
            raise credentials_exception
        if _session_expired(session):
            delete_user_session(db, session)
            raise credentials_exception

    return user


def _get_user_or_401(db: Session, username: str, credentials_exception):
    try:
        return get_user(db, username)
    except ValueError:
        raise credentials_exception


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(get_access_token_from_cookie),
):
    """
    Return the authenticated user when possible, otherwise None.

    Used by public endpoints that need to know whether the request comes from
    an administrator without rejecting anonymous visitors.
    """
    username = None
    session_id = None
    refresh_token = None
    used_refresh_token = False

    if token:
        try:
            payload = decode_access_token(token)
            username = payload.get("sub")
            session_id = get_session_id_from_payload(payload)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            username = None
            session_id = None

    if not username:
        refresh_token = get_refresh_token_from_cookie(request)
        if refresh_token:
            try:
                payload = decode_refresh_token(refresh_token)
                username = payload.get("sub")
                session_id = get_session_id_from_payload(payload)
                used_refresh_token = True
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                username = None
                session_id = None

    if not username:
        return None

    try:
        user = get_user(db, username)
    except ValueError:
        return None

    if used_refresh_token:
        session = _find_refresh_session(db, session_id, refresh_token)
        if not session or session.user_id != user.id:
            return None
        if _session_expired(session):
            return None
        if not (
            _token_matches(session.refresh_token_hash, refresh_token)
            or _rotated_token_is_in_grace(session, refresh_token)
        ):
            return None
    elif session_id is not None:
        session = get_user_session(db, session_id)
        if not session or session.user_id != user.id:
            return None
        if _session_expired(session):
            return None

    return user


async def require_auth(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(get_access_token_from_cookie)
):
    """
    Dependency to require authentication for a route.

    The signed-in user is also exposed through a context variable so the
    planner audit listener can record who changed another author's content.
    """
    from core.audit import reset_audit_actor, set_audit_actor

    user = get_current_user_from_token(db, request, response, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_handle = set_audit_actor(user.id)
    try:
        yield user
    finally:
        reset_audit_actor(token_handle)


def is_admin(user) -> bool:
    """True when the signed-in user can manage every user's content."""
    return getattr(user, "role", None) == "admin"


async def require_admin(user=Depends(require_auth)):
    """Dependency for global management endpoints."""
    if not is_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다.",
        )
    return user
