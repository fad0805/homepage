from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from db.base import Base


class IndexPage(Base):
    """Rich main-index content for the integrated or one author's page."""

    __tablename__ = "index_pages"

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String(16), nullable=False, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    content_html = Column(Text, nullable=False, default="", server_default="")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")
