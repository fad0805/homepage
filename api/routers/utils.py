import hmac
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session

from fastapi import Request, Response, Depends, HTTPException, status
import jwt

from core.config import (
    ENVIRONMENT,
    AUTH_COOKIE_MAX_AGE,
    REFRESH_TOKEN_GRACE_SECONDS,
)
from core.security import create_access_token, create_refresh_token, decode_access_token, decode_refresh_token
from crud.users import get_user
from db.session import get_db
from models.users import User


def get_client_ip(request: Request) -> str:
    """Resolve the originating client IP, preferring proxy headers."""
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
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        return refresh_token
    return None


def _token_matches(stored: Optional[str], token: Optional[str]) -> bool:
    if not stored or not token:
        return False
    return hmac.compare_digest(stored.encode(), token.encode())


def _rotated_token_is_in_grace(user: User, token: Optional[str]) -> bool:
    """Accept the previous refresh token briefly after a rotation."""
    if not _token_matches(user.previous_refresh_token, token):
        return False
    if user.refresh_token_rotated_at is None:
        return False
    return datetime.utcnow() - user.refresh_token_rotated_at <= timedelta(
        seconds=REFRESH_TOKEN_GRACE_SECONDS
    )


def refresh_access_token(
    db: Session,
    refresh_token: str = Depends(get_refresh_token_from_cookie)
):
    """
    Refresh the access token using the provided refresh token.

    Refresh tokens rotate on use, but concurrent requests can present the same
    token (multiple tabs, or a batch of API calls after the access token has
    expired). The rotation is applied with an atomic conditional update so only
    one request advances the stored token; the others reuse that new token
    during a short grace period instead of being rejected. Reusing the previous
    token after the grace window revokes the token family.
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
    if not username:
        raise credentials_exception

    try:
        user = get_user(db, username)
    except ValueError:
        raise credentials_exception

    new_access_token = create_access_token(data={"sub": username})
    new_refresh_token = create_refresh_token(data={"sub": username})

    # Only rotate when the presented token is still the current one. The
    # condition is evaluated by the database, so concurrent refreshes cannot
    # both win the race.
    rotated = (
        db.query(User)
        .filter(
            User.id == user.id,
            User.refresh_token == refresh_token,
        )
        .update(
            {
                User.previous_refresh_token: refresh_token,
                User.refresh_token: new_refresh_token,
                User.refresh_token_rotated_at: datetime.utcnow(),
            },
            synchronize_session=False,
        )
    )
    db.commit()

    if rotated:
        return username, new_access_token, new_refresh_token

    # Another request just rotated the token. Reuse the stored token so every
    # response writes the same cookie value.
    db.refresh(user)
    if user.refresh_token and _rotated_token_is_in_grace(
        user, refresh_token
    ):
        return username, new_access_token, user.refresh_token

    # The token is a valid previous-generation token, but the grace window has
    # passed. Treat this as possible reuse/theft and revoke the whole token
    # family so the stale token cannot keep minting access tokens.
    if _token_matches(user.previous_refresh_token, refresh_token):
        user.refresh_token = None
        user.previous_refresh_token = None
        user.refresh_token_rotated_at = None
        db.commit()

    raise credentials_exception


def get_current_user_from_token(
    db: Session,
    request: Request,
    response: Response,
    token: str = Depends(get_access_token_from_cookie)
):
    """
    Get the current user from the access token.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid access token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
    except jwt.ExpiredSignatureError:
        refresh_token = get_refresh_token_from_cookie(request)
        if not refresh_token:
            raise credentials_exception

        (
            username,
            new_access_token,
            new_refresh_token,
        ) = refresh_access_token(db, refresh_token=refresh_token)

        _set_auth_cookie(response, "access_token", new_access_token)
        _set_auth_cookie(response, "refresh_token", new_refresh_token)
    except jwt.InvalidTokenError:
        raise credentials_exception

    if not username:
        raise credentials_exception

    try:
        user = get_user(db, username)
    except ValueError:
        raise credentials_exception
    return user


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(get_access_token_from_cookie),
):
    """
    Return the authenticated user when possible, otherwise None.

    Used by public endpoints that need to know whether the request comes from
    an administrator without rejecting anonymous visitors.
    """
    username = None
    used_refresh_token = False

    if token:
        try:
            payload = decode_access_token(token)
            username = payload.get("sub")
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            username = None

    if not username:
        refresh_token = get_refresh_token_from_cookie(request)
        if refresh_token:
            try:
                payload = decode_refresh_token(refresh_token)
                username = payload.get("sub")
                used_refresh_token = True
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                username = None

    if not username:
        return None

    try:
        user = get_user(db, username)
    except ValueError:
        return None

    if used_refresh_token:
        refresh_token = get_refresh_token_from_cookie(request)
        if not (
            _token_matches(user.refresh_token, refresh_token)
            or _rotated_token_is_in_grace(user, refresh_token)
        ):
            return None

    return user


async def require_auth(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    token: str = Depends(get_access_token_from_cookie)
):
    """
    Dependency to require authentication for a route.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = get_current_user_from_token(db, request, response, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
