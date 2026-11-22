from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.orm import relationship

from db.base import Base
from db.types import ImageUrl
from models.users import User


class Category(Base):
    __tablename__ = "links-categories"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    banner_url = Column(ImageUrl(255), nullable=True)
    description = Column(Text, nullable=True)
    is_special = Column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    order = Column(Integer, nullable=False, default=0, server_default="0")

    links = relationship("Link", back_populates="category_relation")
    user = relationship(User)

class Link(Base):
    __tablename__ = "links"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Legacy username column kept until older data is fully retired.
    owner = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    url = Column(String(255), nullable=False)
    banner_url = Column(ImageUrl(255), nullable=True)
    category = Column(Integer, ForeignKey("links-categories.id"), nullable=False, index=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    order = Column(Integer, nullable=False, default=0, server_default="0")

    category_relation = relationship("Category", back_populates="links")
    user = relationship(User)

    def __repr__(self):
        return f"<Link(id={self.id}, name='{self.name}', url='{self.url}')>"
