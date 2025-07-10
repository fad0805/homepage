import os
from typing import Optional

from fastapi import Request, Response, Depends, HTTPException, status

from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext

from crud.users import get_user

SECRET_KEY = os.getenv('SECRET_KEY')
ALGORITHM = os.getenv('ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', 7))

if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set.")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password):
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, "your_secret_key", algorithm="HS256")
    return encoded_jwt


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_refresh_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")


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
        if payload.get("exp") < datetime.utcnow().timestamp():
            raise credentials_exception

        user_id = payload.get("sub")
        if not user_id:
            raise credentials_exception

        user = get_user(user_id)
        if not user:
            raise credentials_exception

        new_access_token = create_access_token(data={"sub": user_id})
        return new_access_token
    except HTTPException as e:
        raise e
    except jwt.exceptions.InvalidTokenError as e:
        raise ValueError("Invalid refresh token") from e
    except Exception as e:
        raise e


def get_current_user_from_token(
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
        if payload.get("exp") < datetime.utcnow().timestamp():
            new_access_token = refresh_access_token()
            response.delete_cookie("access_token")
            response.set_cookie(
                key="access_token",
                value=new_access_token,
                httponly=True,
                secure=True,
                samesite="Strict"
            )

        user_id = payload.get("sub")
        if not user_id:
            raise credentials_exception

        user = get_user(user_id)
        if not user:
            raise credentials_exception
        return user
    except HTTPException as e:
        raise e
    except jwt.exceptions.InvalidTokenError as e:
        raise ValueError("Invalid access token") from e
    except Exception as e:
        raise e
