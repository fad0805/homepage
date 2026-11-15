import re
from typing import Literal

from pydantic import BaseModel, field_validator

LayoutKey = Literal["editorial", "side", "collapsible", "drawer"]
SidePosition = Literal["left", "right"]
ColorThemeKey = Literal[
    "mint",
    "sepia",
    "blue",
    "rose",
    "mono",
    "aromantic",
    "agender",
    "asexual",
]
ThemeMode = Literal["light", "dark"]

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _clean_color(value: str | None) -> str | None:
    """Normalize optional #RRGGBB overrides and reject other formats."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
    if not value:
        return None
    if not isinstance(value, str) or not _HEX_COLOR.fullmatch(value):
        raise ValueError("색상은 #RRGGBB 형식이어야 합니다.")
    return value.lower()


class AppearanceRead(BaseModel):
    """Public site-wide appearance settings."""

    layout_key: LayoutKey
    side_position: SidePosition
    default_theme: ThemeMode = "light"
    color_theme: ColorThemeKey
    color_background: str | None = None
    color_content: str | None = None
    color_accent: str | None = None
    color_background_dark: str | None = None
    color_content_dark: str | None = None
    color_accent_dark: str | None = None


class AppearanceUpdate(BaseModel):
    """Editable site-wide appearance settings."""

    layout_key: LayoutKey
    side_position: SidePosition = "left"
    default_theme: ThemeMode = "light"
    color_theme: ColorThemeKey = "mint"
    color_background: str | None = None
    color_content: str | None = None
    color_accent: str | None = None
    color_background_dark: str | None = None
    color_content_dark: str | None = None
    color_accent_dark: str | None = None

    @field_validator(
        "color_background",
        "color_content",
        "color_accent",
        "color_background_dark",
        "color_content_dark",
        "color_accent_dark",
        mode="before",
    )
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        return _clean_color(value)
