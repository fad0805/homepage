from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ScheduleType = Literal["single", "range"]
TaskStatus = Literal["active", "inactive", "trashed"]


class PlannerCompletedCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    completed_on: date


class PlannerTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    color_id: int | None = None
    schedule_type: ScheduleType = "single"
    start_date: date | None = None
    end_date: date | None = None
    deadline_days: int | None = Field(default=7, ge=1, le=365)
    pinned: bool = False


class PlannerTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    color_id: int | None = None
    schedule_type: ScheduleType | None = None
    start_date: date | None = None
    end_date: date | None = None
    deadline_days: int | None = Field(default=None, ge=1, le=365)
    pinned: bool | None = None


class PlannerTaskRead(BaseModel):
    id: int
    title: str
    notes: str | None = None
    color_id: int | None = None
    color: str | None = None
    schedule_type: ScheduleType
    start_date: date
    end_date: date
    deadline_days: int | None = None
    status: TaskStatus
    pinned: bool
    created_at: datetime
    updated_at: datetime
    inactive_at: datetime | None = None
    trashed_at: datetime | None = None

    class Config:
        from_attributes = True


class PlannerTasksResponse(BaseModel):
    today: date
    tasks: list[PlannerTaskRead] = Field(default_factory=list)


class PlannerColorCreate(BaseModel):
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    name: str | None = Field(default=None, max_length=80)


class PlannerColorUpdate(BaseModel):
    color: str | None = Field(
        default=None,
        pattern=r"^#[0-9a-fA-F]{6}$",
    )
    name: str | None = Field(default=None, max_length=80)


class PlannerColorReorder(BaseModel):
    ids: list[int] = Field(default_factory=list)


class PlannerColorRead(BaseModel):
    id: int
    color: str
    name: str | None = None
    position: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class PlannerColorsResponse(BaseModel):
    colors: list[PlannerColorRead] = Field(default_factory=list)


class PlannerEventRead(BaseModel):
    id: int
    entity_type: str
    entity_id: int | None = None
    action: str
    title: str | None = None
    notes: str | None = None
    changes: list[dict] | None = None
    occurred_at: datetime

    class Config:
        from_attributes = True


class PlannerEventsResponse(BaseModel):
    events: list[PlannerEventRead] = Field(default_factory=list)


class PlannerSearchResponse(BaseModel):
    tasks: list[PlannerTaskRead] = Field(default_factory=list)
    events: list[PlannerEventRead] = Field(default_factory=list)


class PlannerEventPreview(BaseModel):
    available: bool
    entity_type: str
    title: str | None = None
    summary: str | None = None
    content_html: str | None = None
    detail_url: str | None = None
    fields: dict[str, str | None] = Field(default_factory=dict)
