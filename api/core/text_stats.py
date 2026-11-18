"""Plain-text extraction and character counts for manuscript bodies.

The editor stores Tiptap HTML. Counts are computed on the rendered plain text
so that HTML tags never inflate the result. Block tags become newlines and
multiple spaces are preserved, because the author-facing count includes both
spaces and line breaks.
"""

from html.parser import HTMLParser
import re

_BLOCK_TAGS = {
    "p",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "li",
    "tr",
    "section",
    "article",
    "pre",
}
_LINE_BREAK_TAGS = {"br", "hr"}
_SKIPPED_TAGS = {"script", "style"}
_SOFT_BREAK = "\x00"


class _PlainTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0

    def _append_soft_break(self) -> None:
        if self.parts and self.parts[-1] not in ("\n", _SOFT_BREAK):
            self.parts.append(_SOFT_BREAK)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in _SKIPPED_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in _LINE_BREAK_TAGS:
            self.parts.append("\n")
        elif tag in _BLOCK_TAGS:
            self._append_soft_break()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in _SKIPPED_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag in _BLOCK_TAGS:
            self._append_soft_break()

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.parts.append(data)


def html_to_plain(body: str | None) -> str:
    """Convert a Tiptap-style HTML body to plain text without trimming spaces."""
    if not body:
        return ""
    parser = _PlainTextParser()
    parser.feed(body)
    parser.close()
    # A block close at the very end adds a break that is not authored content.
    text = "".join(parser.parts).rstrip(_SOFT_BREAK)
    return text.replace(_SOFT_BREAK, "\n")


def count_characters(body: str | None) -> tuple[int, int]:
    """Return ``(with_spaces, plain)`` character counts for an HTML body.

    ``with_spaces`` includes spaces and line breaks. ``plain`` excludes all
    Unicode whitespace. Both values count Unicode code points, matching the
    browser's ``Array.from(text).length``.
    """
    text = html_to_plain(body)
    with_spaces = len(text)
    plain = len(re.sub(r"\s+", "", text))
    return with_spaces, plain
