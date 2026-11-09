from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)

from db.base import Base


class ChapterDraft(Base):
    __tablename__ = "chapter_drafts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner = Column(String(50), nullable=False)
    draft_key = Column(String(120), nullable=False)
    title = Column(String, nullable=False, default="")
    subtitle = Column(String, nullable=True)
    body = Column(Text, nullable=True)
    tags = Column(JSON, nullable=False, default=list)
    visible = Column(Boolean, nullable=False, default=True)
    published_at = Column(DateTime, nullable=True)
    target_book_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "owner",
            "draft_key",
            name="uq_chapter_drafts_owner_key",
        ),
    )

    def __repr__(self):
        return (
            f"<ChapterDraft(id={self.id}, owner='{self.owner}', "
            f"draft_key='{self.draft_key}')>"
        )
