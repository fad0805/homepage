from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func

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
    instance_url = Column(String(255), nullable=True)
    access_token = Column(Text, nullable=True)
    site_url = Column(String(255), nullable=True)
    visibility = Column(
        String(20),
        nullable=False,
        default="public",
        server_default="public",
    )
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
