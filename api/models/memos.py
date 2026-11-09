from sqlalchemy import Boolean, Column, Integer, String, DateTime, func

from db.base import Base


class Memo(Base):
    __tablename__ = "memos"
    id = Column(Integer, primary_key=True, autoincrement=True)
    owner = Column(String(50), nullable=False, index=True)
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

    def __repr__(self):
        return f"<Memo(id={self.id}, owner='{self.owner}')>"
