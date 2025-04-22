from pydantic import BaseModel

class LinkBase(BaseModel):
    """Base model for Link."""
    name: str
    category: str
    url: str
    banner: str | None = None
    description: str | None = None


class LinkCreate(LinkBase):
    """Model for creating a new Link."""
    pass
