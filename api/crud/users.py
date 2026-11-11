from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.config import REFRESH_TOKEN_EXPIRE_DAYS
from models.users import User, UserSession, UserSigninHistory
from core.security import hash_password
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


def create_user_session(
    db: Session,
    user_id: int,
    refresh_token: str,
    device_info: str | None = None,
    ip_address: str | None = None,
) -> UserSession:
    """
    Add a session row for a freshly signed-in device.

    A sign-in never touches other rows, so logging in on one device does
    not invalidate the sessions of every other device.
    """
    session = UserSession(
        user_id=user_id,
        refresh_token=refresh_token,
        device_info=(device_info or "")[:255] or None,
        ip_address=(ip_address or "unknown")[:45],
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    db.commit()
    return session


def delete_user_session_by_token(
    db: Session,
    user_id: int,
    refresh_token: str,
) -> None:
    """Remove the session a refresh token belongs to (sign-out)."""
    db.query(UserSession).filter(
        UserSession.user_id == user_id,
        or_(
            UserSession.refresh_token == refresh_token,
            UserSession.previous_refresh_token == refresh_token,
        ),
    ).delete(synchronize_session=False)
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
