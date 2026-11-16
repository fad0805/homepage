from typing import Literal

from pydantic import BaseModel


class IndexPageRead(BaseModel):
    scope: Literal["author", "integrated"]
    user_id: int | None = None
    content_html: str = ""


class IndexPageUpdate(BaseModel):
    scope: Literal["author", "integrated"] = "author"
    content_html: str = ""
