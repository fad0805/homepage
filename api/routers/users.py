import os

from contextlib import closing
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi import Form
import jwt
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from core.config import ENVIRONMENT, AUTH_COOKIE_MAX_AGE
from core.rate_limit import FailureRateLimiter
from core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    verify_password,
)
from routers.utils import (
    get_client_ip,
    get_current_user_from_token,
    get_optional_user,
    get_session_id_from_payload,
)
from crud.users import (
    create_user,
    create_user_session,
    delete_expired_user_sessions,
    delete_user_session,
    get_user,
    get_user_session,
    get_user_session_by_token,
    record_signin_history,
)
from db.session import get_db
from schemas.users import UserCreate

router = APIRouter()

# Password guessing is slowed down per client IP. A successful sign-in clears
# the bucket so a person who mistyped a few times is not punished later.
_signin_limiter = FailureRateLimiter(
    max_failures=5,
    message="로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
)


def create_admin_for_dev():
    # Only seed the default account in explicit development mode. Any other
    # value (including a missing/misspelled ENVIRONMENT) must fail closed.
    if ENVIRONMENT != 'development':
        return

    # Require an explicit opt-in as well. This prevents an accidental
    # development-mode start from creating the default admin account in a
    # database that is not meant for it.
    if os.getenv('DEV_ADMIN_SEED', '').strip().lower() not in (
        '1',
        'true',
        'yes',
        'on',
    ):
        return

    with closing(next(get_db())) as db:
        try:
            signup(username='admin', password='admin', db=db)
        except HTTPException as e:
            if e.status_code == 400:
                pass
            else:
                raise e

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
    ip_address = get_client_ip(request)
    _signin_limiter.check(ip_address)

    try:
        user = get_user(db, username)
    except ValueError:
        _signin_limiter.record_failure(ip_address)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    hashed_password = user.hashed_password
    verified = verify_password(password, hashed_password)

    device_info = (request.headers.get("user-agent") or "")[:255] or None

    if not verified:
        record_signin_history(db, user.id, ip_address, device_info, success=False)
        _signin_limiter.record_failure(ip_address)
        raise HTTPException(status_code=400, detail="Invalid username or password")

    # A sign-in starts a new per-device session instead of replacing the
    # user's single stored token, so other devices stay logged in.
    try:
        delete_expired_user_sessions(db, user.id)
        session = create_user_session(db, user.id, device_info, ip_address)
        access_token = create_access_token(
            data={"sub": username, "sid": session.id}
        )
        refresh_token = create_refresh_token(
            data={"sub": username, "sid": session.id}
        )
        session.refresh_token = refresh_token
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save refresh token")

    record_signin_history(db, user.id, ip_address, device_info, success=True)
    _signin_limiter.reset(ip_address)

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


@router.post("/signout")
def signout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Clear this browser/device's cookies and invalidate only its session.

    Other devices keep their own sessions.
    """
    refresh_token = request.cookies.get("refresh_token")
    session = None

    if refresh_token:
        try:
            payload = decode_refresh_token(refresh_token)
            session_id = get_session_id_from_payload(payload)
        except jwt.InvalidTokenError:
            session_id = None

        if session_id is not None:
            session = get_user_session(db, session_id)
        if not session:
            session = get_user_session_by_token(db, refresh_token)

    if not session:
        access_token = request.cookies.get("access_token")
        if access_token:
            try:
                payload = decode_access_token(access_token)
                session_id = get_session_id_from_payload(payload)
            except jwt.InvalidTokenError:
                session_id = None
            if session_id is not None:
                session = get_user_session(db, session_id)

    delete_user_session(db, session)

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"success": True, "message": "Logout successful"}


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
    user = get_current_user_from_token(
        db,
        request,
        response,
        token=request.cookies.get("access_token"),
    )
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
