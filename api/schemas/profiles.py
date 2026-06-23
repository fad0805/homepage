from datetime import datetime
from pydantic import BaseModel


class ProfileBase(BaseModel):
    """Base model for Profile"""
    title: str = str(datetime.now())
    profile: str


class ProfileCreate(ProfileBase):
    """Model for creating a new Profile."""
    created_at: datetime = datetime.now()


class ProfileUpdate(ProfileBase):
    """Model for updating an existing Profile."""
    updated_at: datetime = datetime.now()
