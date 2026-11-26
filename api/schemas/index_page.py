from typing import Literal

from pydantic import BaseModel, Field


class IndexPageRead(BaseModel):
    scope: Literal["author", "integrated"]
    user_id: int | None = None
    title: str
    subtitle: str
    copyright_name: str
    favicon_url: str | None = None
    favicon_192_url: str | None = None
    favicon_maskable_url: str | None = None
    content_html: str = ""


class IndexPageUpdate(BaseModel):
    scope: Literal["author", "integrated"] = "author"
    # Omitting a field leaves it unchanged; an empty string clears it.
    title: str | None = Field(default=None, max_length=2000)
    subtitle: str | None = Field(default=None, max_length=2000)
    copyright_name: str | None = Field(default=None, max_length=2000)
    favicon_url: str | None = Field(default=None, max_length=2000)
    favicon_192_url: str | None = Field(default=None, max_length=2000)
    favicon_maskable_url: str | None = Field(
        default=None, max_length=2000
    )
    content_html: str = ""
