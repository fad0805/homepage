from pydantic import BaseModel, Field


class Category(BaseModel):
    """Model for Link's Category."""
    name: str
    order: int | None = None


class LinkBase(BaseModel):
    """Base model for Link."""
    name: str
    category: int
    url: str
    banner_url: str | None = None
    description: str | None = None
    order: int | None = None


class LinkCreate(LinkBase):
    """Model for creating a new Link."""
    owner: str | None = None


class LinkUpdate(BaseModel):
    """Model for updating an existing Link."""
    name: str | None = None
    category: int | None = None
    url: str | None = None
    banner_url: str | None = None
    description: str | None = None
    order: int | None = None


class ReorderItem(BaseModel):
    """A single link position inside a reorder request."""
    id: int
    order: int
    category: int | None = None


class ReorderRequest(BaseModel):
    """Payload for reordering links."""
    items: list[ReorderItem] = Field(default_factory=list)


class CategoryReorderItem(BaseModel):
    """A single category position inside a reorder request."""
    id: int
    order: int


class CategoryReorderRequest(BaseModel):
    """Payload for reordering link categories."""
    items: list[CategoryReorderItem] = Field(default_factory=list)


class UploadResponse(BaseModel):
    """Result of a banner upload."""
    url: str
