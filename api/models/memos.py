from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from db.base import Base
from models.users import User


class Memo(Base):
    __tablename__ = "memos"
    id = Column(Integer, primary_key=True, autoincrement=True)
    # Legacy username string. New rows use user_id; this stays until the
    # existing data has been mapped to users.
    owner = Column(String(50), nullable=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content = Column(String(500), nullable=False, default="")
    pinned = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship(User)

    def __repr__(self):
        return f"<Memo(id={self.id}, owner='{self.owner}')>"
