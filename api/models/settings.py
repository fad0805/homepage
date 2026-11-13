from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)

from db.base import Base


class MastodonSettings(Base):
    __tablename__ = "mastodon_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    enabled = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    provider = Column(
        String(20),
        nullable=False,
        default="mastodon",
        server_default="mastodon",
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    instance_url = Column(String(255), nullable=True)
    access_token = Column(Text, nullable=True)
    site_url = Column(String(255), nullable=True)
    visibility = Column(
        String(20),
        nullable=False,
        default="public",
        server_default="public",
    )
    notify_scope = Column(
        String(20),
        nullable=False,
        default="all",
        server_default="all",
    )
    notify_book_id = Column(
        Integer,
        ForeignKey("books.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
