from datetime import datetime, timezone

from pydantic import BaseModel, Field, computed_field


class MemoCreate(BaseModel):
    """Model for creating a one-line memo."""
    content: str = Field(default="", max_length=500)


class MemoUpdate(BaseModel):
    """Model for updating a one-line memo.

    Both fields are optional so the same endpoint can update the text, pin or
    unpin a memo, or do both at once.
    """
    content: str | None = Field(default=None, max_length=500)
    pinned: bool | None = None


class MemoRead(BaseModel):
    """Model for a one-line memo response."""
    id: int
    content: str
    pinned: bool
    expires_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @computed_field
    @property
    def expires_in_seconds(self) -> int | None:
        """Seconds left before an unpinned memo is removed."""
        if self.pinned:
            return None

        expires_at = self.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
        return max(0, int(remaining))
