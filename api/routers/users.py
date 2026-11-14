import os
import re

from contextlib import closing
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi import Form
import jwt
from sqlalchemy.orm import Session, joinedload
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
    require_admin,
    require_auth,
)
from crud.users import (
    change_user_password,
    create_user,
    create_user_session,
    delete_expired_user_sessions,
    delete_user_session,
    ensure_author_settings,
    get_user,
    get_user_session,
    get_user_session_by_token,
    record_signin_history,
    update_author_layout,
    update_author_settings,
)
from db.session import get_db
from models.users import User
from schemas.appearance import AppearanceRead, AppearanceUpdate
from schemas.users import (
    AccountRead,
    AccountUpdate,
    PasswordUpdate,
    UserCreate,
)

router = APIRouter()

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

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
            if e.status_code != 400:
                raise e

        # The development seed account is always an administrator.
        admin = db.query(User).filter(User.username == 'admin').first()
        if admin is not None and admin.role != 'admin':
            admin.role = 'admin'
            db.commit()


@router.get("")
@router.get("/")
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """List users with public account details for admin management."""
    users = (
        db.query(User)
        .options(joinedload(User.author_settings))
        .order_by(User.id)
        .all()
    )
    return [
        {
            "id": user.id,
            "username": user.username,
            "nickname": (
                user.author_settings.nickname
                if user.author_settings
                else user.username
            ),
            "slug": user.author_settings.slug if user.author_settings else None,
            "role": user.role,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
            "is_self": user.id == current_user.id,
        }
        for user in users
    ]


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
    return {
        "success": True,
        "user": user.username,
        "role": user.role,
    }


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
    return {
        "success": True,
        "user": user.username,
        "role": user.role,
    }


@router.get("/me/account", response_model=AccountRead)
def get_my_account(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Return the signed-in author's public account settings."""
    settings = ensure_author_settings(db, user)
    return {
        "username": user.username,
        "role": user.role,
        "nickname": settings.nickname,
        "slug": settings.slug,
    }


@router.put("/me/account", response_model=AccountRead)
def update_my_account(
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Update the signed-in author's nickname and public URL slug."""
    nickname = payload.nickname.strip()
    slug = payload.slug.strip().lower()

    if not nickname:
        raise HTTPException(status_code=400, detail="닉네임을 입력해주세요.")
    if len(nickname) > 80:
        raise HTTPException(
            status_code=400,
            detail="닉네임은 80자 이하로 입력해주세요.",
        )
    if not slug:
        raise HTTPException(
            status_code=400,
            detail="URL 표시명을 입력해주세요.",
        )
    if len(slug) > 48:
        raise HTTPException(
            status_code=400,
            detail="URL 표시명은 48자 이하로 입력해주세요.",
        )
    if not SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(
            status_code=400,
            detail=(
                "URL 표시명은 영문 소문자, 숫자, 하이픈만 사용할 수 "
                "있습니다."
            ),
        )

    try:
        settings = update_author_settings(
            db,
            user,
            nickname=nickname,
            slug=slug,
        )
    except ValueError:
        raise HTTPException(
            status_code=409,
            detail="이미 사용 중인 URL 표시명입니다.",
        )

    return {
        "username": user.username,
        "role": user.role,
        "nickname": settings.nickname,
        "slug": settings.slug,
    }


@router.put("/me/password")
def update_my_password(
    payload: PasswordUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Change the signed-in user's password."""
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="새 비밀번호는 8자 이상 입력해주세요.",
        )
    if len(payload.new_password) > 128:
        raise HTTPException(
            status_code=400,
            detail="새 비밀번호는 128자 이하로 입력해주세요.",
        )

    try:
        change_user_password(
            db,
            user,
            payload.current_password,
            payload.new_password,
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="현재 비밀번호가 올바르지 않습니다.",
        )

    return {"success": True}


@router.get("/me/appearance", response_model=AppearanceRead)
def get_my_appearance(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Return the signed-in author's appearance settings."""
    settings = ensure_author_settings(db, user)
    return {
        "layout_key": settings.layout_key,
        "side_position": settings.side_position,
    }


@router.put("/me/appearance", response_model=AppearanceRead)
def update_my_appearance(
    payload: AppearanceUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Update the signed-in author's site layout."""
    settings = update_author_layout(
        db,
        user,
        layout_key=payload.layout_key,
        side_position=payload.side_position,
    )
    return {
        "layout_key": settings.layout_key,
        "side_position": settings.side_position,
    }
