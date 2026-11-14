from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ResourceType = Literal["illustration", "chapter", "book"]


class GalleryResourceRead(BaseModel):
    type: ResourceType
    id: int
    title: str
    owner_id: int | None = None
    owner_name: str | None = None


class GalleryUnlockRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class GalleryInviteCreate(BaseModel):
    resource_type: ResourceType
    resource_id: int
    note: str | None = Field(default=None, max_length=255)
    expires_in_hours: int | None = Field(default=None, ge=1, le=720)


class GalleryInviteCreated(BaseModel):
    id: int
    resource: GalleryResourceRead
    code: str
    note: str | None
    expires_at: datetime


class GalleryInviteRead(BaseModel):
    id: int
    resource: GalleryResourceRead | None
    note: str | None
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None
    revoked_at: datetime | None
    status: str


class GallerySessionRead(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    last_seen_at: datetime | None
    revoked_at: datetime | None
    ip_address: str | None
    user_agent: str | None
    status: str
    resources: list[GalleryResourceRead]
