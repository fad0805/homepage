"""Defaults and helpers shared by the integrated/author index pages."""

from __future__ import annotations

import html
import re

import bleach


DEFAULT_INDEX_TITLE = "어디에도 없는 섬"
DEFAULT_INDEX_SUBTITLE = "Missing Island"
DEFAULT_COPYRIGHT_NAME = "Rimien Siarte"
DEFAULT_INDEX_BODY_HTML = (
    "<p>Missing Island · Story Archive</p>"
    "<h2>당신은 어떤<br><em>이야기</em>를<br>가지고 있나요?</h2>"
    "<p>어서오세요.<br>이 곳은 어디에나 있지만, 어디에도 없는 섬.</p>"
)

MAX_TITLE_LENGTH = 120
MAX_SUBTITLE_LENGTH = 160
MAX_COPYRIGHT_NAME_LENGTH = 120

_LINE_BREAK = re.compile(r"(?i)<br\s*/?>")
_TAG = re.compile(r"<[^>]+>")
_WHITESPACE = re.compile(r"\s+")


def clean_index_text(value: str | None, max_length: int) -> str:
    """Turn rich editor text into a safe, single-line plain string."""
    if value is None:
        return ""

    text = _LINE_BREAK.sub(" ", value)
    text = bleach.clean(text, tags=[], strip=True)
    text = html.unescape(text)
    return _WHITESPACE.sub(" ", text).strip()[:max_length]
