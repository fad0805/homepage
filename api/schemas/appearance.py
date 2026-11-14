from typing import Literal

from pydantic import BaseModel

LayoutKey = Literal["editorial", "side", "collapsible", "drawer"]


class AppearanceRead(BaseModel):
    """Public site-wide appearance settings."""

    layout_key: LayoutKey


class AppearanceUpdate(BaseModel):
    """Editable site-wide appearance settings."""

    layout_key: LayoutKey
