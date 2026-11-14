import re
from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.config import REFRESH_TOKEN_EXPIRE_DAYS
from models.users import AuthorSettings, User, UserSession, UserSigninHistory
from core.security import hash_password, verify_password
from schemas.users import UserCreate, UserUpdate


def get_user(db: Session, username: str):
    """
    Get user from the database
    """
    query = db.query(User).filter(User.username == username)
    user = query.first()
    if not user:
        raise ValueError("User not found")
    return user


def create_user(db: Session, user: UserCreate):
    """
    Create a new user in the database
    """
    db_user = User(
        username=user.username,
        hashed_password=hash_password(user.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return get_user(db, user.username)


def update_user(db: Session, username: str, user_update: UserUpdate):
    """
    Update an existing user in the database
    """
    user = get_user(db, username)
    for key, value in user_update.model_dump(exclude_unset=True).items():
        if key == "password":
            key = "hashed_password"
            value = hash_password(value)
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return True if user else False


def change_user_password(
    db: Session,
    user: User,
    current_password: str,
    new_password: str,
) -> bool:
    """Change one user's password after verifying the current one."""
    if not verify_password(current_password, user.hashed_password):
        raise ValueError("invalid_current_password")

    user.hashed_password = hash_password(new_password)
    db.commit()
    db.refresh(user)
    return True


SLUG_MAX_LENGTH = 48


def _slug_base(username: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", username.lower()).strip("-")
    return (slug or "author")[:SLUG_MAX_LENGTH]


def _unique_slug(db: Session, username: str, user_id: int) -> str:
    base = _slug_base(username)
    candidate = base
    suffix = 2
    while (
        db.query(AuthorSettings)
        .filter(
            AuthorSettings.slug == candidate,
            AuthorSettings.user_id != user_id,
        )
        .first()
    ):
        suffix_text = f"-{suffix}"
        candidate = f"{base[:SLUG_MAX_LENGTH - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return candidate


def get_author_settings(db: Session, user_id: int) -> AuthorSettings | None:
    """Return the public author settings for one user."""
    return (
        db.query(AuthorSettings)
        .filter(AuthorSettings.user_id == user_id)
        .first()
    )


def ensure_author_settings(db: Session, user: User) -> AuthorSettings:
    """Create default settings for accounts created before author settings.

    New accounts are normally created together with settings by the CLI, but
    this keeps an account usable if its settings row is missing.
    """
    settings = get_author_settings(db, user.id)
    if settings is not None:
        return settings

    settings = AuthorSettings(
        user_id=user.id,
        slug=_unique_slug(db, user.username, user.id),
        nickname=user.username,
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update_author_settings(
    db: Session,
    user: User,
    *,
    nickname: str,
    slug: str,
) -> AuthorSettings:
    """Update the signed-in author's public account settings."""
    settings = ensure_author_settings(db, user)
    conflict = (
        db.query(AuthorSettings)
        .filter(
            AuthorSettings.slug == slug,
            AuthorSettings.user_id != user.id,
        )
        .first()
    )
    if conflict is not None:
        raise ValueError("slug_conflict")

    settings.nickname = nickname
    settings.slug = slug
    db.commit()
    db.refresh(settings)
    return settings


def update_author_layout(
    db: Session,
    user: User,
    *,
    layout_key: str,
    side_position: str,
) -> AuthorSettings:
    """Update the signed-in author's layout."""
    settings = ensure_author_settings(db, user)
    settings.layout_key = layout_key
    settings.side_position = side_position
    db.commit()
    db.refresh(settings)
    return settings


def create_user_session(
    db: Session,
    user_id: int,
    device_info: str | None = None,
    ip_address: str | None = None,
) -> UserSession:
    """
    Start a session row for a freshly signed-in device.

    The row is flushed first so its integer id can be embedded in the access
    and refresh tokens as the session id. The caller sets the refresh token
    and commits once both tokens have been created.
    """
    now = datetime.utcnow()
    session = UserSession(
        user_id=user_id,
        refresh_token="",
        device_info=(device_info or "")[:255] or None,
        ip_address=(ip_address or "unknown")[:45],
        created_at=now,
        last_used_at=now,
        expires_at=now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    db.flush()
    return session


def get_user_session(db: Session, session_id: int | None) -> UserSession | None:
    """Find one device session by the id embedded in its tokens."""
    if session_id is None:
        return None
    return (
        db.query(UserSession)
        .filter(UserSession.id == session_id)
        .first()
    )


def get_user_session_by_token(
    db: Session, refresh_token: str | None
) -> UserSession | None:
    """Find a session by its current or recently rotated refresh token."""
    if not refresh_token:
        return None
    return (
        db.query(UserSession)
        .filter(
            or_(
                UserSession.refresh_token == refresh_token,
                UserSession.previous_refresh_token == refresh_token,
            )
        )
        .first()
    )


def delete_user_session(db: Session, session: UserSession | None) -> None:
    """Delete only this device's session, leaving other devices signed in."""
    if not session:
        return
    db.delete(session)
    db.commit()


def delete_expired_user_sessions(db: Session, user_id: int) -> None:
    """Drop sessions whose sliding expiry has passed (housekeeping)."""
    db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.expires_at < datetime.utcnow(),
    ).delete(synchronize_session=False)
    db.commit()


def record_signin_history(
    db: Session,
    user_id: int,
    ip_address: str | None,
    device_info: str | None,
    success: bool,
) -> None:
    """Record a sign-in attempt for later auditing."""
    db.add(
        UserSigninHistory(
            user_id=user_id,
            ip_address=(ip_address or "unknown")[:45],
            device_info=(device_info or "unknown")[:255],
            success=1 if success else 0,
        )
    )
    db.commit()
