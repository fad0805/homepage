from datetime import datetime
from pydantic import BaseModel, Field

class UserBase(BaseModel):
    """Basic user model"""
    username: str
    password: str
    created_at: datetime
    updated_at: datetime


class UserCreate(UserBase):
    """Model for creating a new user"""
    username: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Config:
        from_attributes = True


class UserUpdate(UserBase):
    """Model for updating an existing user"""
    username: str | None = None
    password: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class UserSigninHistory(BaseModel):
    """Model for user sign-in history"""
    user_id: int
    signin_time: datetime
    ip_address: str
    success: bool
    device_info: str

    class Config:
        from_attributes = True
