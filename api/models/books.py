from sqlalchemy import (
    JSON,
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
from sqlalchemy.orm import relationship

from db.base import Base


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(JSON, nullable=False, default=list)
    order = Column(Integer, nullable=False, default=0)
    visible = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    chapters = relationship(
        "Chapter",
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="Chapter.order, Chapter.id",
    )


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    book_id = Column(
        Integer,
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String, nullable=False)
    subtitle = Column(String, nullable=True)
    body = Column(Text, nullable=True)
    tags = Column(JSON, nullable=False, default=list)
    order = Column(Integer, nullable=False, default=0)
    visible = Column(Boolean, nullable=False, default=True)
    view_count = Column(Integer, nullable=False, default=0, server_default="0")
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    book = relationship("Book", back_populates="chapters")


class ChapterView(Base):
    __tablename__ = "chapter_views"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    chapter_id = Column(
        Integer,
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ip_hash = Column(String(64), nullable=False)
    last_viewed_at = Column(DateTime, nullable=False, default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "chapter_id",
            "ip_hash",
            name="uq_chapter_views_chapter_ip",
        ),
    )
