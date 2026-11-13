from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MastodonVisibility = Literal["public", "unlisted", "private"]
MastodonNotifyScope = Literal["all", "books", "book", "illustrations"]
MastodonProvider = Literal["mastodon", "misskey"]


class MastodonSettingsRead(BaseModel):
    """Admin-facing Mastodon settings without exposing the access token."""

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


class MastodonSettingsUpdate(BaseModel):
    """Fields the admin can change on the Mastodon integration."""

    enabled: bool | None = None
    instance_url: str | None = Field(default=None, max_length=255)
    access_token: str | None = Field(default=None, max_length=2000)
    site_url: str | None = Field(default=None, max_length=255)
    visibility: MastodonVisibility | None = None
    notify_scope: MastodonNotifyScope | None = None
    notify_book_id: int | None = None


class MastodonTestRequest(BaseModel):
    """Unsaved credentials to test before storing them."""

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
