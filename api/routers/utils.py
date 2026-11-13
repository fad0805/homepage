import hmac
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
)
from crud import gallery as gallery_crud
from crud.users import (
    delete_user_session,
    get_user,
    get_user_session,
    get_user_session_by_token,
)
from db.session import get_db
from models.users import UserSession


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
        or session.expires_at <= datetime.utcnow()
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
    return hmac.compare_digest(stored.encode(), token.encode())


def _rotated_token_is_in_grace(
    session: UserSession, token: Optional[str]
) -> bool:
    """Accept the previous refresh token briefly after a rotation."""
    if not _token_matches(session.previous_refresh_token, token):
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
    new_refresh_token: str,
) -> None:
    _set_auth_cookie(response, "access_token", new_access_token)
    _set_auth_cookie(response, "refresh_token", new_refresh_token)


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

    # A delayed tab can still present the token from just before a rotation.
    if not _token_matches(session.refresh_token, refresh_token):
        if _rotated_token_is_in_grace(session, refresh_token):
            return username, new_access_token, session.refresh_token
        # Do not revoke the active session for a stale token. An old tab must
        # not be able to sign out the current browser/device.
        raise credentials_exception

    new_refresh_token = create_refresh_token(
        data={"sub": username, "sid": session.id}
    )
    now = datetime.utcnow()

    # Only rotate when the presented token is still the current one for this
    # session. The condition is evaluated by the database, so concurrent
    # refreshes cannot both win the race.
    rotated = (
        db.query(UserSession)
        .filter(
            UserSession.id == session.id,
            UserSession.refresh_token == refresh_token,
        )
        .update(
            {
                UserSession.previous_refresh_token: refresh_token,
                UserSession.refresh_token: new_refresh_token,
                UserSession.refresh_token_rotated_at: now,
                UserSession.last_used_at: now,
                UserSession.expires_at: now
                + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
            },
            synchronize_session=False,
        )
    )
    db.commit()

    if rotated:
        return username, new_access_token, new_refresh_token

    # Another request just rotated this session's token. Reuse the stored
    # token so every response writes the same cookie value.
    db.refresh(session)
    if (
        session.refresh_token
        and _rotated_token_is_in_grace(session, refresh_token)
    ):
        return username, new_access_token, session.refresh_token

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
            _token_matches(session.refresh_token, refresh_token)
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
    """
    user = get_current_user_from_token(db, request, response, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


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
