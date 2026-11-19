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


class CombinedSaveRequest(BaseModel):
    """Persist a folder's combined view in one atomic database commit."""

    bodies: dict[int, str] = Field(default_factory=dict)
    subtitle: str | None = None
    synopsis: str | None = None
    notes: str | None = None


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
    manuscript node. ``toc_parent_id`` explicitly places the post in the
    public table of contents; omitting it keeps the current placement.
    """

    target_book_id: int | None = None
    toc_parent_id: int | None = None
    # Kept for API compatibility; the editor now places posts explicitly.
    sync_structure: bool = False


class TocFolderCreate(BaseModel):
    label: str
    parent_id: int | None = None


class TocNodeUpdate(BaseModel):
    label: str | None = None
    parent_id: int | None = None


class TocPostCreate(BaseModel):
    chapter_id: int
    parent_id: int | None = None
    position: int | None = None


class TocNodeMoveRequest(BaseModel):
    parent_id: int | None = None
    position: int
