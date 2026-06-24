from sqlalchemy import Column, String, Integer, Text, DateTime, func

from db.base import Base


class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255))
    profile = Column(Text)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

