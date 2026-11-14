from datetime import datetime
from pydantic import BaseModel


class UserBase(BaseModel):
    """Basic user model (public fields only)"""
    username: str


class UserCreate(UserBase):
    """Model for creating a new user"""
    password: str


class UserUpdate(BaseModel):
    """Model for updating an existing user"""
    username: str | None = None
    password: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AccountRead(BaseModel):
    """Public account settings for the signed-in author."""

    username: str
    role: str
    nickname: str
    slug: str


class AccountUpdate(BaseModel):
    """Editable account settings."""

    nickname: str
    slug: str


class UserRead(UserBase):
    """Model for user response"""
    id: int
    created_at: datetime
    updated_at: datetime

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