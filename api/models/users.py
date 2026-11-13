from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func

from db.base import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(128), nullable=False)
    # "admin" can manage every user's content; "user" is limited to its own.
    role = Column(
        String(20),
        nullable=False,
        default="user",
        server_default="user",
    )
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class UserSession(Base):
    """A refresh-token session belonging to one signed-in device.

    Every sign-in inserts a row, so several devices can stay logged in at
    the same time; rotating or revoking a token only affects its own row.
    """

    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    refresh_token = Column(String(255), nullable=False)
    # The most recently rotated token stays valid for a short grace period so
    # concurrent refreshes (e.g. several restored tabs waking from sleep) do
    # not invalidate each other's cookies.
    previous_refresh_token = Column(String(255), nullable=True)
    refresh_token_rotated_at = Column(DateTime, nullable=True)
    device_info = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    last_used_at = Column(DateTime, default=func.now(), nullable=False)
    # Sliding expiry: each rotation pushes it another full period out.
    expires_at = Column(DateTime, nullable=False)


class UserSigninHistory(Base):
    __tablename__ = "user_signin_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    signin_time = Column(DateTime, default=func.now(), nullable=False)
    ip_address = Column(String(45), nullable=False)
    success = Column(Integer, nullable=False, default=1)
    device_info = Column(String(255), nullable=False)
