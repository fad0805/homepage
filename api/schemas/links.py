from datetime import datetime
from pydantic import BaseModel


class Category(BaseModel):
    """Model for Link's Category."""
    name: str


class LinkBase(BaseModel):
    """Base model for Link."""
    owner: str
    name: str
    category: int
    url: str
    banner_url: str | None = None
    description: str | None = None


class LinkCreate(LinkBase):
    """Model for creating a new Link."""
    created_at: datetime = datetime.now()


class LinkUpdate(LinkBase):
    """Model for updating an existing Link."""
    updated_at: datetime = datetime.now()
