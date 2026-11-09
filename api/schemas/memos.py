from datetime import datetime

from pydantic import BaseModel, Field


class MemoCreate(BaseModel):
    """Model for creating a one-line memo."""
    content: str = Field(default="", max_length=500)


class MemoUpdate(BaseModel):
    """Model for updating a one-line memo."""
    content: str = Field(default="", max_length=500)


class MemoRead(BaseModel):
    """Model for a one-line memo response."""
    id: int
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
