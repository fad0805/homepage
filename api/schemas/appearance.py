from typing import Literal

from pydantic import BaseModel

LayoutKey = Literal["editorial", "side", "collapsible", "drawer"]
SidePosition = Literal["left", "right"]


class AppearanceRead(BaseModel):
    """Public site-wide appearance settings."""

    layout_key: LayoutKey
    side_position: SidePosition


class AppearanceUpdate(BaseModel):
    """Editable site-wide appearance settings."""

    layout_key: LayoutKey
    side_position: SidePosition = "left"
