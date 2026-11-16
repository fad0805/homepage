from datetime import date, datetime
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


class BookmarkRoutineCreate(BaseModel):
    frequency: BookmarkRoutineFrequency
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    weekday: int | None = Field(default=None, ge=0, le=6)
    weekdays: list[int] | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    nth_week: int | None = Field(default=None, ge=1, le=5)
    month: int | None = Field(default=None, ge=1, le=12)


class BookmarkRoutineUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    weekday: int | None = Field(default=None, ge=0, le=6)
    weekdays: list[int] | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    nth_week: int | None = Field(default=None, ge=1, le=5)
    month: int | None = Field(default=None, ge=1, le=12)
    active: bool | None = None


class BookmarkRoutineRead(BaseModel):
    id: int
    title: str
    notes: str | None = None
    frequency: BookmarkRoutineFrequency
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
    period_type: BookmarkPeriodType
    period_start: date
    occurrences: list[BookmarkRoutineOccurrenceRead] = Field(
        default_factory=list
    )


class BookmarkRoutineCheckUpdate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    done: bool


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


class BookmarkGoalUpdate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    content: str = Field(max_length=20000)


class BookmarkGoalRead(BaseModel):
    id: int
    period_type: BookmarkPeriodType
    period_start: date
    content: str
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
