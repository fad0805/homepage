from typing import Literal

from pydantic import BaseModel, Field

NodeType = Literal["folder", "chapter"]


class ProjectCreate(BaseModel):
    title: str
    linked_book_id: int | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    linked_book_id: int | None = None


class NodeCreate(BaseModel):
    project_id: int
    parent_id: int | None = None
    node_type: NodeType
    title: str
    subtitle: str | None = None
    synopsis: str | None = None
    status: str | None = None
    notes: str | None = None
    body: str | None = None
    target_chars: int | None = None
    position: int = 0


class NodeUpdate(BaseModel):
    parent_id: int | None = None
    node_type: NodeType | None = None
    title: str | None = None
    subtitle: str | None = None
    synopsis: str | None = None
    status: str | None = None
    notes: str | None = None
    body: str | None = None
    target_chars: int | None = None
    position: int | None = None


class NodeMoveRequest(BaseModel):
    parent_id: int | None = None
    position: int = 0


class NodeReorderItem(BaseModel):
    id: int
    parent_id: int | None = None
    position: int


class NodeReorderRequest(BaseModel):
    items: list[NodeReorderItem] = Field(default_factory=list)


class RestoreRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)


class PublishRequest(BaseModel):
    """Publish a manuscript chapter into a book's table of contents.

    ``target_book_id`` defaults to the project's linked book. Publishing to
    another book creates a chapter there without linking it back to the
    manuscript node. ``sync_structure`` explicitly pushes the manuscript
    folder path into the public serial tree.
    """

    target_book_id: int | None = None
    sync_structure: bool = False
