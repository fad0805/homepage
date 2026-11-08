from sqlalchemy import Column, Date, DateTime, Integer, String, func

from db.base import Base


class SiteVisit(Base):
    __tablename__ = "site_visits"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ip_hash = Column(String(64), nullable=False, index=True)
    source = Column(String(255), nullable=False, default="direct")
    referrer = Column(String(1024), nullable=True)
    path = Column(String(512), nullable=True)
    visited_on = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=func.now())
