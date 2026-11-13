from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from db.base import Base
from models.books import Book, Chapter
from models.illustrations import Illustration
from models.users import User


class GalleryInvite(Base):
    """A single-use code that unlocks one illustration, chapter or book."""

    __tablename__ = "gallery_invites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_hash = Column(String(64), unique=True, index=True, nullable=False)
    illustration_id = Column(
        Integer,
        ForeignKey("illustrations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    chapter_id = Column(
        Integer,
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    book_id = Column(
        Integer,
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True)
    used_ip = Column(String(45), nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    illustration = relationship(Illustration)
    chapter = relationship(Chapter)
    book = relationship(Book)
    user = relationship(User)


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

    grants = relationship(
        "GallerySessionGrant",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class GallerySessionGrant(Base):
    """One resource this browser is allowed to open."""

    __tablename__ = "gallery_session_grants"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "illustration_id",
            name="uq_gallery_session_grant",
        ),
        UniqueConstraint(
            "session_id",
            "chapter_id",
            name="uq_gallery_session_chapter",
        ),
        UniqueConstraint(
            "session_id",
            "book_id",
            name="uq_gallery_session_book",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        Integer,
        ForeignKey("gallery_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    illustration_id = Column(
        Integer,
        ForeignKey("illustrations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    chapter_id = Column(
        Integer,
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    book_id = Column(
        Integer,
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=func.now(), nullable=False)

    session = relationship("GallerySession", back_populates="grants")
    illustration = relationship(Illustration)
    chapter = relationship(Chapter)
    book = relationship(Book)
