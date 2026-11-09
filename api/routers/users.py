# rate limit
from collections import defaultdict
from datetime import datetime, timedelta

_signin_attempts: dict[str, list[datetime]] = defaultdict(list)

# import
import os

from contextlib import closing
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi import Form
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from core.config import ENVIRONMENT, AUTH_COOKIE_MAX_AGE
from core.security import verify_password, create_access_token, create_refresh_token
from routers.utils import get_current_user_from_token, get_optional_user
from crud.users import get_user, create_user, update_refresh_token
from db.session import get_db
from schemas.users import UserCreate

router = APIRouter()


def create_admin_for_dev():
    # Only seed the default account in explicit development mode. Any other
    # value (including a missing/misspelled ENVIRONMENT) must fail closed.
    if ENVIRONMENT != 'development':
        return

    with closing(next(get_db())) as db:
        try:
            signup(username='admin', password='admin', db=db)
        except HTTPException as e:
            if e.status_code == 400:
                pass
            else:
                raise e

def rate_limit(request: Request):
    now = datetime.now()
    ip = request.client.host
    _signin_attempts[ip] = [t for t in _signin_attempts[ip] if now - t < timedelta(minutes=1)]

    if len(_signin_attempts[ip]) >= 5:
        raise HTTPException(status_code=429, detail="Too many requests")
    _signin_attempts[ip].append(now)


@router.post("/signin")
async def signin(
    request: Request,
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Endpoint to handle user login.
    """
    rate_limit(request)

    try:
        user = get_user(db, username)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    hashed_password = user.hashed_password
    verified = verify_password(password, hashed_password)

    if not verified:
        raise HTTPException(status_code=400, detail="Invalid username or password")

    access_token = create_access_token(data={"sub": username})
    refresh_token = create_refresh_token(data={"sub": username})

    try:
        update_refresh_token(db, username, refresh_token)
    except SQLAlchemyError:
        raise HTTPException(status_code=500, detail="Failed to save refresh token")

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True if ENVIRONMENT == 'production' else False,
        samesite="Strict",
        max_age=AUTH_COOKIE_MAX_AGE,
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True if ENVIRONMENT == 'production' else False,
        samesite="Strict",
        max_age=AUTH_COOKIE_MAX_AGE,
    )

    return {"success": True, "message": "Login successful"}


def signup(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """
    Endpoint to handle user registration.
    """
    try:
        existing_user = get_user(db, username)
    except ValueError:
        existing_user = None
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = UserCreate(username=username, password=password)
    user = create_user(db, new_user)

    return {"message": "User created successfully", "user": user.username}


@router.get("/me")
def get_current_user(
    response: Response,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Endpoint to get the current logged-in user's information.
    """
    access_token = request.cookies.get("access_token")
    
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = get_current_user_from_token(db, request, response, token=access_token)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "user": user.username}


@router.get("/me/status")
def get_current_user_status(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Lightweight authentication check used by server-rendered pages.

    Unlike /me, this endpoint never rotates tokens, so it is safe to call from
    a Next.js server component that cannot propagate Set-Cookie headers.
    """
    user = get_optional_user(
        request,
        db,
        token=request.cookies.get("access_token"),
    )
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"success": True, "user": user.username}
