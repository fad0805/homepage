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
    # NULL means "not customized yet", so the public defaults are used.
    # An empty string is an intentional choice to hide the field.
    title = Column(String(120), nullable=True)
    subtitle = Column(String(160), nullable=True)
    content_html = Column(Text, nullable=False, default="", server_default="")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")
