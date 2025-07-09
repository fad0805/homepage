from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime

from db.base import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    refresh_token = Column(String(255), nullable=True)


class UserSigninHistory(Base):
    __tablename__ = "user_signin_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    signin_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    ip_address = Column(String(45), nullable=False)
    success = Column(Integer, nullable=False, default=1)
    device_info = Column(String(255), nullable=False)
