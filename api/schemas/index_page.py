from typing import Literal

from pydantic import BaseModel, Field


class IndexPageRead(BaseModel):
    scope: Literal["author", "integrated"]
    user_id: int | None = None
    title: str
    subtitle: str
    content_html: str = ""


class IndexPageUpdate(BaseModel):
    scope: Literal["author", "integrated"] = "author"
    # Omitting a field leaves it unchanged; an empty string clears it.
    title: str | None = Field(default=None, max_length=2000)
    subtitle: str | None = Field(default=None, max_length=2000)
    content_html: str = ""
