from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MastodonVisibility = Literal["public", "unlisted", "private"]
MastodonNotifyScope = Literal["all", "books", "book", "illustrations"]
MastodonProvider = Literal["mastodon", "misskey", "writ"]


class MastodonSettingsRead(BaseModel):
    """Admin-facing notification profile without exposing its token."""

    id: int
    name: str = "알림 설정"
    enabled: bool
    provider: MastodonProvider = "mastodon"
    instance_url: str | None = None
    site_url: str | None = None
    visibility: MastodonVisibility = "public"
    notify_scope: MastodonNotifyScope = "all"
    notify_book_id: int | None = None
    has_access_token: bool = False
    access_token_hint: str | None = None
    updated_at: datetime | None = None


class MastodonSettingsCreate(BaseModel):
    """A new notification profile."""

    name: str = Field(default="알림 설정", max_length=100)


class MastodonSettingsUpdate(BaseModel):
    """Fields the admin can change on one notification profile."""

    name: str | None = Field(default=None, max_length=100)
    enabled: bool | None = None
    instance_url: str | None = Field(default=None, max_length=255)
    access_token: str | None = Field(default=None, max_length=2000)
    site_url: str | None = Field(default=None, max_length=255)
    visibility: MastodonVisibility | None = None
    notify_scope: MastodonNotifyScope | None = None
    notify_book_id: int | None = None


class MastodonTestRequest(BaseModel):
    """Credentials to test, optionally using a saved profile's token."""

    settings_id: int | None = None
    instance_url: str | None = Field(default=None, max_length=255)
    access_token: str | None = Field(default=None, max_length=2000)


class MastodonTestResult(BaseModel):
    ok: bool
    provider: MastodonProvider = "mastodon"
    account: str | None = None
    display_name: str | None = None
    message: str | None = None


class MastodonTestStatusResult(BaseModel):
    ok: bool
    status_id: str
    message: str
