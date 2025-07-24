from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

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
    category = Column(Integer, ForeignKey("links-categories.id"), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    order = Column(Integer, nullable=False, default=0, server_default="0")

    category_relation = relationship("Category", back_populates="links")

    def __repr__(self):
        return f"""
            <Link
                className="links-banner"
                href={self.url}
                target="_blank"
            >
                <Image
                    src={self.banner_url}
                    alt={self.description}
                    radius="none"
                />
                <p>{self.name}</p>
            </Link>
        """
