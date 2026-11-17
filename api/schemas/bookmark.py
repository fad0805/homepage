from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field

BookmarkPeriodType = Literal["year", "quarter", "month", "week", "day"]
BookmarkRoutineFrequency = Literal[
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "yearly",
]
BookmarkTrackingMode = Literal["count", "date"]
BookmarkSpecialDateKind = Literal["yearly", "dday"]


class BookmarkSpecialDateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    kind: BookmarkSpecialDateKind = "yearly"
    event_date: date | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    day: int | None = Field(default=None, ge=1, le=31)
    pinned: bool = False


class BookmarkSpecialDateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    kind: BookmarkSpecialDateKind | None = None
    event_date: date | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    day: int | None = Field(default=None, ge=1, le=31)
    pinned: bool | None = None


class BookmarkSpecialDateRead(BaseModel):
    id: int
    title: str
    kind: BookmarkSpecialDateKind
    event_date: date | None = None
    month: int | None = None
    day: int | None = None
    pinned: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkSpecialDatesResponse(BaseModel):
    special_dates: list[BookmarkSpecialDateRead] = Field(
        default_factory=list
    )


class BookmarkRoutineCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class BookmarkRoutineCategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class BookmarkRoutineCategoryReorder(BaseModel):
    ids: list[int] = Field(min_length=1)


class BookmarkRoutineCategoryRead(BaseModel):
    id: int
    name: str
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkRoutineCreate(BaseModel):
    frequency: BookmarkRoutineFrequency
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    category_id: int | None = None
    tracking_mode: BookmarkTrackingMode = "count"
    target_count: int = Field(default=1, ge=1, le=1000)
    weekday: int | None = Field(default=None, ge=0, le=6)
    weekdays: list[int] | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    nth_week: int | None = Field(default=None, ge=1, le=5)
    month: int | None = Field(default=None, ge=1, le=12)


class BookmarkRoutineUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    category_id: int | None = None
    tracking_mode: BookmarkTrackingMode | None = None
    target_count: int | None = Field(default=None, ge=1, le=1000)
    weekday: int | None = Field(default=None, ge=0, le=6)
    weekdays: list[int] | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    nth_week: int | None = Field(default=None, ge=1, le=5)
    month: int | None = Field(default=None, ge=1, le=12)
    active: bool | None = None


class BookmarkRoutineReorder(BaseModel):
    ids: list[int] = Field(min_length=1)


class BookmarkRoutineRead(BaseModel):
    id: int
    title: str
    notes: str | None = None
    frequency: BookmarkRoutineFrequency
    category_id: int | None = None
    start_date: date
    end_date: date | None = None
    tracking_mode: BookmarkTrackingMode
    target_count: int
    weekday: int | None = None
    weekdays: list[int] | None = None
    day_of_month: int | None = None
    nth_week: int | None = None
    month: int | None = None
    active: bool
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkRoutineOccurrenceRead(BaseModel):
    date: date
    done: bool


class BookmarkRoutinePeriodRead(BookmarkRoutineRead):
    category_name: str | None = None
    period_type: BookmarkPeriodType
    period_start: date
    completed_count: int = 0
    occurrences: list[BookmarkRoutineOccurrenceRead] = Field(
        default_factory=list
    )
    next_date: date | None = None


class BookmarkRoutineCheckUpdate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    count: int = Field(ge=0, le=1000)


class BookmarkRoutineHistoryDayRead(BaseModel):
    date: date
    scheduled: bool
    done: bool


class BookmarkRoutineHistoryMonthRead(BaseModel):
    month_start: date
    completed_count: int
    expected_count: int

    class Config:
        from_attributes = True


class BookmarkRoutineHistoryRead(BaseModel):
    daily: list[BookmarkRoutineHistoryDayRead] = Field(default_factory=list)
    monthly: list[BookmarkRoutineHistoryMonthRead] = Field(
        default_factory=list
    )


class BookmarkMoodTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class BookmarkMoodTagUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class BookmarkMoodTagReorder(BaseModel):
    ids: list[int] = Field(min_length=1)


class BookmarkMoodTagRead(BaseModel):
    id: int
    name: str
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkRoutineStatBucketRead(BaseModel):
    period_start: date
    completed_count: int
    expected_count: int


class BookmarkRoutineStatRead(BaseModel):
    id: int
    title: str
    frequency: BookmarkRoutineFrequency
    tracking_mode: BookmarkTrackingMode
    category_id: int | None = None
    category_name: str | None = None
    start_date: date
    end_date: date | None = None
    target_count: int
    active: bool
    aggregation: Literal["week", "month", "quarter", "year"]
    retention_label: str
    buckets: list[BookmarkRoutineStatBucketRead] = Field(
        default_factory=list
    )


class BookmarkStatisticsRead(BaseModel):
    categories: list[BookmarkRoutineCategoryRead] = Field(
        default_factory=list
    )
    routines: list[BookmarkRoutineStatRead] = Field(
        default_factory=list
    )


class BookmarkGoalUpdate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    content: str = Field(max_length=20000)


class BookmarkDayMetaUpdate(BaseModel):
    period_start: date
    wake_time: time | None = None
    mood_tag_id: int | None = None


class BookmarkGoalRead(BaseModel):
    id: int
    period_type: BookmarkPeriodType
    period_start: date
    content: str
    wake_time: time | None = None
    mood_tag_id: int | None = None
    mood_tag_name: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkRatingUpdate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    rating: int = Field(ge=0, le=5)


class BookmarkRatingRead(BaseModel):
    id: int
    period_type: BookmarkPeriodType
    period_start: date
    rating: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkReviewUpdate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    content: str = Field(max_length=20000)


class BookmarkReviewRead(BaseModel):
    id: int
    period_type: BookmarkPeriodType
    period_start: date
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkPeriodRead(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    routines: list[BookmarkRoutinePeriodRead] = Field(default_factory=list)
    goal: BookmarkGoalRead | None = None
    rating: BookmarkRatingRead | None = None
    review: BookmarkReviewRead | None = None
