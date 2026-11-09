from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator


class ChapterDraftSave(BaseModel):
    """Payload for creating or overwriting a chapter draft."""

    title: str = Field(default="", max_length=500)
    subtitle: str | None = None
    body: str | None = None
    tags: list[str] = Field(default_factory=list)
    visible: bool = True
    published_at: datetime | None = None
    target_book_id: int | None = None


class ChapterDraftRead(ChapterDraftSave):
    """Serialized chapter draft."""

    id: int
    draft_key: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator(
        "created_at",
        "updated_at",
        "published_at",
        mode="before",
    )
    @classmethod
    def _ensure_utc(cls, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
