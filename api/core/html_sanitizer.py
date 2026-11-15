"""Allowlist-based sanitization for author index page HTML."""

from __future__ import annotations

import bleach
from bleach.css_sanitizer import CSSSanitizer


ALLOWED_TAGS = [
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "div",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strike",
    "strong",
    "u",
    "ul",
]

# Attributes used by Tiptap, AuthorImage, and PagePreview output.
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": [
        "src",
        "alt",
        "title",
        "width",
        "height",
        "style",
        "data-align",
        "data-wrap",
    ],
    "div": [
        "class",
        "style",
        "data-page-preview",
        "data-url",
        "data-title",
        "data-description",
        "data-image",
        "data-site-name",
        "data-width",
        "data-align",
    ],
    "span": ["class", "style"],
    "mark": ["data-color", "style"],
    "*": ["class", "style"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

CSS_SANITIZER = CSSSanitizer(
    allowed_css_properties=[
        "background-color",
        "clear",
        "color",
        "float",
        "font-size",
        "font-style",
        "font-weight",
        "height",
        "line-height",
        "margin-left",
        "margin-right",
        "max-width",
        "text-align",
        "text-decoration",
        "width",
    ],
)


def sanitize_index_html(html: str | None) -> str:
    """Strip executable markup while preserving editor formatting."""
    if not html:
        return ""

    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
        css_sanitizer=CSS_SANITIZER,
    )
