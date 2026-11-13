from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
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
    name = Column(
        String(100),
        nullable=False,
        default="알림 설정",
        server_default="알림 설정",
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


class NotificationDelivery(Base):
    """One successful notification sent to one connection profile."""

    __tablename__ = "notification_deliveries"
    __table_args__ = (
        UniqueConstraint(
            "settings_id",
            "content_type",
            "content_id",
            name="uq_notification_deliveries_target",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    settings_id = Column(
        Integer,
        ForeignKey("mastodon_settings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content_type = Column(String(20), nullable=False, index=True)
    content_id = Column(Integer, nullable=False, index=True)
    status_id = Column(String(255), nullable=True)
    posted_at = Column(DateTime, default=func.now(), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
