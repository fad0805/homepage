from datetime import date, datetime, timedelta, timezone

from pydantic import BaseModel, Field, field_validator

KST = timezone(timedelta(hours=9))


def today_kst() -> date:
    return datetime.now(KST).date()


def validate_taken_at(value: date | None) -> date | None:
    if value is not None and value > today_kst():
        raise ValueError("촬영 일자는 오늘 이후로 지정할 수 없습니다.")
    return value


class IllustrationImageRead(BaseModel):
    """One image inside an illustration group."""

    id: int
    url: str
    original_name: str | None = None
    order: int

    class Config:
        from_attributes = True


class IllustrationSummary(BaseModel):
    """List-level illustration data with its representative image."""

    id: int
    title: str
    description: str | None = None
    taken_at: date | None = None
    visible: bool
    representative_image_id: int | None = None
    representative_url: str | None = None
    representative_original_name: str | None = None
    image_count: int
    order: int
    created_at: datetime
    updated_at: datetime


class IllustrationDetail(IllustrationSummary):
    """Full illustration data including every uploaded image."""

    images: list[IllustrationImageRead] = Field(default_factory=list)


class IllustrationUpdate(BaseModel):
    """Fields the admin can change after uploading an illustration."""

    title: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    taken_at: date | None = None
    representative_image_id: int | None = None
    visible: bool | None = None

    @field_validator("taken_at")
    @classmethod
    def check_taken_at(cls, value: date | None) -> date | None:
        return validate_taken_at(value)


class IllustrationBulkUpdate(BaseModel):
    """Fields applied to several illustration groups at once."""

    ids: list[int] = Field(default_factory=list)
    visible: bool | None = None
    taken_at: date | None = None

    @field_validator("taken_at")
    @classmethod
    def check_taken_at(cls, value: date | None) -> date | None:
        return validate_taken_at(value)


class IllustrationBulkDelete(BaseModel):
    """Illustration groups selected for bulk deletion."""

    ids: list[int] = Field(default_factory=list)


class IllustrationReorderItem(BaseModel):
    """A single illustration position inside a reorder request."""

    id: int
    order: int


class IllustrationReorderRequest(BaseModel):
    """Payload for reordering illustration groups."""

    items: list[IllustrationReorderItem] = Field(default_factory=list)


class IllustrationImageReorderItem(BaseModel):
    """A single image position inside an illustration."""

    id: int
    order: int


class IllustrationImageReorderRequest(BaseModel):
    """Payload for reordering images inside one illustration."""

    items: list[IllustrationImageReorderItem] = Field(
        default_factory=list
    )
