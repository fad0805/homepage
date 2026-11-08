import hmac
from typing import Optional
from sqlalchemy.orm import Session

from fastapi import Request, Response, Depends, HTTPException, status
import jwt

from core.config import ENVIRONMENT, AUTH_COOKIE_MAX_AGE
from core.security import create_access_token, create_refresh_token, decode_access_token, decode_refresh_token
from crud.users import get_user, update_refresh_token
from db.session import get_db


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


def refresh_access_token(
    db: Session,
    refresh_token: str = Depends(get_refresh_token_from_cookie)
):
    """
    Refresh the access token using the provided refresh token.
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

    # Only the most recently issued refresh token stays valid. Comparing
    # against the stored token makes rotation actually revoke older tokens.
    stored_token = user.refresh_token
    if not stored_token or not hmac.compare_digest(
        stored_token.encode(), refresh_token.encode()
    ):
        raise credentials_exception

    new_access_token = create_access_token(data={"sub": username})
    new_refresh_token = create_refresh_token(data={"sub": username})
    update_refresh_token(db, username, new_refresh_token)
    return username, new_access_token, new_refresh_token


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

        response.delete_cookie("access_token")
        _set_auth_cookie(response, "access_token", new_access_token)
        response.delete_cookie("refresh_token")
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
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                username = None

    if not username:
        return None

    try:
        return get_user(db, username)
    except ValueError:
        return None


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
