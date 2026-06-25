from datetime import datetime
from pydantic import BaseModel, Field


class ProfileBase(BaseModel):
    """Base model for Profile"""
    title: str = "Profile"
    profile: str


class ProfileCreate(ProfileBase):
    """Model for creating a new Profile."""
    created_at: datetime = Field(default_factory=datetime.now)


class ProfileUpdate(ProfileBase):
    """Model for updating an existing Profile."""
    title: str | None = None
    profile: str | None = None
    updated_at: datetime = Field(default_factory=datetime.now)
