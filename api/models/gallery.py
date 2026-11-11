from sqlalchemy import Column, DateTime, Integer, String, func

from db.base import Base


class GalleryInvite(Base):
    """A single-use code that unlocks the gallery in one browser."""

    __tablename__ = "gallery_invites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code_hash = Column(String(64), unique=True, index=True, nullable=False)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True)
    used_ip = Column(String(45), nullable=True)
    revoked_at = Column(DateTime, nullable=True)


class GallerySession(Base):
    """One unlocked browser. The cookie holds the token whose hash is here."""

    __tablename__ = "gallery_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    last_seen_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
