from pydantic import BaseModel


class AdminVisibilityUpdate(BaseModel):
    """Administrator-only public visibility setting."""

    visible: bool
