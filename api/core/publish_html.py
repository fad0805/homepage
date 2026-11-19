"""HTML adjustments applied when a manuscript is published to the bookshelf.

The manuscript editor keeps Scrivener's logical font sizes and only scales them
visually with CSS. Published chapters need the smaller size baked into the HTML
so other readers of the chapter body see the same result without editor CSS.
"""

from __future__ import annotations

import re

_FONT_SIZE_RE = re.compile(
    r"(?i)(font-size\s*:\s*)(\d+(?:\.\d+)?)\s*pt"
)
_PUBLISHED_WRAPPER_RE = re.compile(
    r'^<div[^>]*data-ms-published-font-size="true"[^>]*>(.*)</div>$',
    re.DOTALL,
)
_DEFAULT_SIZE_PT = 10


def shrink_font_sizes_for_chapter(body: str | None, points: int = 3) -> str:
    """Return chapter HTML with every font size reduced by ``points``.

    Text without an explicit size inherits the manuscript default (13pt), so
    it is wrapped at 10pt to match the editor's visual size. The wrapper is
    marked so republishing the same content stays idempotent.
    """
    if not body:
        return ""

    existing = _PUBLISHED_WRAPPER_RE.match(body)
    if existing:
        body = existing.group(1)

    def reduce(match: re.Match[str]) -> str:
        size = float(match.group(2))
        reduced = max(1.0, size - points)
        formatted = f"{reduced:g}"
        return f"{match.group(1)}{formatted}pt"

    shrunk = _FONT_SIZE_RE.sub(reduce, body)
    return (
        f'<div style="font-size: {_DEFAULT_SIZE_PT}pt" '
        f'data-ms-published-font-size="true">{shrunk}</div>'
    )
