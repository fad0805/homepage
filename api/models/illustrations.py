from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from db.base import Base


class Illustration(Base):
    __tablename__ = "illustrations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner = Column(String(50), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(JSON, nullable=False, default=list)
    taken_at = Column(Date, nullable=True)
    representative_image_id = Column(Integer, nullable=True)
    representative_url = Column(String(1000), nullable=True)
    representative_original_name = Column(String(255), nullable=True)
    order = Column(Integer, nullable=False, default=0)
    visible = Column(Boolean, nullable=False, default=True)
    # visible + protected: public, protected (code required), or private.
    protected = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    view_count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    mastodon_status_id = Column(String(255), nullable=True)
    mastodon_posted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    images = relationship(
        "IllustrationImage",
        back_populates="illustration",
        cascade="all, delete-orphan",
        order_by="IllustrationImage.order, IllustrationImage.id",
    )

    def __repr__(self):
        return f"<Illustration(id={self.id}, owner='{self.owner}')>"


class IllustrationImage(Base):
    __tablename__ = "illustration_images"

    id = Column(Integer, primary_key=True, autoincrement=True)
    illustration_id = Column(
        Integer,
        ForeignKey("illustrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url = Column(String(1000), nullable=False)
    original_name = Column(String(255), nullable=True)
    order = Column(Integer, nullable=False, default=0)

    illustration = relationship("Illustration", back_populates="images")

    def __repr__(self):
        return f"<IllustrationImage(id={self.id}, url='{self.url}')>"


class IllustrationView(Base):
    __tablename__ = "illustration_views"
    __table_args__ = (
        UniqueConstraint(
            "illustration_id",
            "ip_hash",
            name="uq_illustration_views_illustration_ip",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    illustration_id = Column(
        Integer,
        ForeignKey("illustrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ip_hash = Column(String(64), nullable=False)
    last_viewed_at = Column(DateTime, nullable=False, default=func.now())
