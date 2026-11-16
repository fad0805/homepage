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
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    nth_week: int | None = Field(default=None, ge=1, le=5)
    month: int | None = Field(default=None, ge=1, le=12)


class BookmarkRoutineUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    weekday: int | None = Field(default=None, ge=0, le=6)
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
    day_of_month: int | None = None
    nth_week: int | None = None
    month: int | None = None
    active: bool
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkRoutinePeriodRead(BookmarkRoutineRead):
    done: bool
    period_type: BookmarkPeriodType
    period_start: date


class BookmarkRoutineCheckUpdate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    done: bool


class BookmarkGoalCreate(BaseModel):
    period_type: BookmarkPeriodType
    period_start: date
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    done: bool = False


class BookmarkGoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    done: bool | None = None


class BookmarkGoalRead(BaseModel):
    id: int
    period_type: BookmarkPeriodType
    period_start: date
    title: str
    notes: str | None = None
    done: bool
    position: int
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
    goals: list[BookmarkGoalRead] = Field(default_factory=list)
    review: BookmarkReviewRead | None = None
