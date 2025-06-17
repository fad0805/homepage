from datetime import datetime
from pydantic import BaseModel

class User(BaseModel):
    """Basic user model"""
    username: str
    hashed_password: str
    created_at: datetime
    updated_at: datetime


class UserSigninHistory(BaseModel):
    """Model for user sign-in history"""
    user_id: int
    signin_time: datetime
    ip_address: str
    success: bool
    device_info: str

    class Config:
        orm_mode = True
