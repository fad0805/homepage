"""HTML adjustments applied when a manuscript is published to the bookshelf.

The manuscript editor keeps Scrivener's logical font sizes and only scales them
visually with CSS. Published chapters need the smaller size baked into the HTML
so other readers of the chapter body see the same result without editor CSS.
Images imported from Scrivener also need Tiptap's alignment attributes so the
public stylesheet can lay them out the same way as the editor.
"""

from __future__ import annotations

import re

_FONT_SIZE_RE = re.compile(r"(?i)(font-size\s*:\s*)(\d+(?:\.\d+)?)\s*pt")
_PUBLISHED_WRAPPER_RE = re.compile(
    r'^<div[^>]*data-ms-published-font-size="true"[^>]*>(.*)</div>$',
    re.DOTALL,
)
_IMG_RE = re.compile(r"<img\b[^>]*>", re.I)
_DEFAULT_SIZE_PT = 10


def _normalize_image_attributes(html: str) -> str:
    """Give manuscript images the same layout attributes Tiptap emits."""

    def add_defaults(match: re.Match[str]) -> str:
        tag = match.group(0)
        if tag.endswith("/>"):
            core, suffix = tag[:-2], " />"
        else:
            core, suffix = tag[:-1], ">"
        if not re.search(r"\bdata-align\s*=", core, re.I):
            core += ' data-align="center"'
        if not re.search(r"\bdata-wrap\s*=", core, re.I):
            core += ' data-wrap="false"'
        return core + suffix

    return _IMG_RE.sub(add_defaults, html)


def prepare_chapter_html(body: str | None, points: int = 3) -> str:
    """Return chapter HTML with reduced font sizes and editor-like images.

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
    normalized = _normalize_image_attributes(shrunk)
    return (
        f'<div style="font-size: {_DEFAULT_SIZE_PT}pt" '
        f'data-ms-published-font-size="true">{normalized}</div>'
    )
