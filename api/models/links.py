from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from db.base import Base


class Category(Base):
    __tablename__ = "links-categories"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    order = Column(Integer, nullable=False, default=0, server_default="0")

    links = relationship("Link", back_populates="category_relation")

class Link(Base):
    __tablename__ = "links"
    id = Column(Integer, primary_key=True, autoincrement=True)
    owner = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    url = Column(String(255), nullable=False)
    banner_url = Column(String(255), nullable=True)
    category = Column(Integer, ForeignKey("links-categories.id"), nullable=False, index=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    order = Column(Integer, nullable=False, default=0, server_default="0")

    category_relation = relationship("Category", back_populates="links")

    def __repr__(self):
        return f"<Link(id={self.id}, name='{self.name}', url='{self.url}')>"
