from typing import Optional
from sqlalchemy.orm import Session

from fastapi import Request, Response, Depends, HTTPException, status
import jwt

from core.config import ENVIRONMENT
from core.security import create_access_token, create_refresh_token, decode_access_token, decode_refresh_token
from crud.users import get_user, update_refresh_token
from db.session import get_db


def get_access_token_from_cookie(request: Request) -> Optional[str]:
    access_token = request.cookies.get("access_token")
    if access_token:
        return access_token
    raise ValueError("No access token found in cookies")

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
        payload = None
        try:
            payload = decode_refresh_token(refresh_token)
        except jwt.ExpiredSignatureError:
            raise credentials_exception
        except jwt.InvalidTokenError:
            raise credentials_exception

        if not payload:
            raise credentials_exception

        username = payload.get("sub")
        if not username:
            raise credentials_exception

        user = get_user(db, username)
        if not user:
            raise credentials_exception

        new_access_token = create_access_token(data={"sub": username})

        # Rotate refresh token when refresh access token
        new_refresh_token = create_refresh_token(data={"sub": username})
        update_refresh_token(db, username, new_refresh_token)
        return username, new_access_token
    except HTTPException as e:
        raise e
    except jwt.exceptions.InvalidTokenError as e:
        raise credentials_exception
    except Exception as e:
        raise e


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
        username = None
        try:
            payload = decode_access_token(token)
            username = payload.get("sub")
        except jwt.ExpiredSignatureError:
            refresh_token = get_refresh_token_from_cookie(request)
            if not refresh_token:
                raise credentials_exception

            username, new_access_token = refresh_access_token(db, refresh_token=refresh_token)
            response.delete_cookie("access_token")
            response.set_cookie(
                key="access_token",
                value=new_access_token,
                httponly=True,
                secure=True if ENVIRONMENT == 'production' else False,
                samesite="Strict"
            )
        except jwt.InvalidTokenError:
            raise credentials_exception

        if not username:
            raise credentials_exception

        user = get_user(db, username)
        if not user:
            raise credentials_exception
        return user
    except HTTPException as e:
        raise e
    except jwt.InvalidTokenError:
        raise credentials_exception
    except Exception as e:
        raise e


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
