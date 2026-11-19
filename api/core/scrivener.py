"""Minimal Scrivener ``.scriv`` project ZIP import/export helpers.

Scrivener projects are directories whose binder structure lives in a
``.scrivx`` XML manifest and whose document bodies are RTF files under
``Files/Data/<UUID>/content.rtf`` (Scrivener 3) or ``Files/Docs/<ID>.rtf``
(Scrivener 2). Only that subset is read and written here; everything else in a
project bundle is ignored.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
from io import BytesIO
import re
from typing import Any
import unicodedata
import uuid
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from core.text_stats import html_to_plain

MAX_IMPORT_BYTES = 50 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024


async def read_upload_limited(
    file: Any,
    *,
    limit: int = MAX_IMPORT_BYTES,
    chunk_size: int = UPLOAD_CHUNK_BYTES,
) -> bytes:
    """Read an upload in chunks, failing as soon as ``limit`` is exceeded."""
    if chunk_size < 1:
        raise ValueError("청크 크기는 1 이상이어야 합니다.")
    declared_size = getattr(file, "size", None)
    if isinstance(declared_size, int) and declared_size > limit:
        await file.close()
        raise ValueError("파일이 너무 큽니다.")

    data = bytearray()
    try:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            if len(data) + len(chunk) > limit:
                raise ValueError("파일이 너무 큽니다.")
            data.extend(chunk)
    finally:
        await file.close()
    return bytes(data)


IGNORED_RTF_GROUPS = {
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "object",
    "generator",
    "themedata",
    "colorschememapping",
    "latentstyles",
    "listtable",
    "listoverridetable",
    "rsidtbl",
    "xmlnstbl",
    "datastore",
    "mmathpr",
}

RTF_SYMBOLS = {
    "ldblquote": "“",
    "rdblquote": "”",
    "lquote": "‘",
    "rquote": "’",
    "endash": "–",
    "emdash": "—",
    "bullet": "•",
    "enspace": " ",
    "emspace": " ",
    "nonbreakingspace": " ",
    "zwj": "",
}

# Scrivener's body default is 13pt, but the manuscript editor is laid out for
# 10pt. Treat 13pt as *the default size* (no inline span) so imported files
# render at the editor's 10pt while exported .scriv files stay native at 13pt.
# Explicit sizes other than 13pt are preserved exactly in both directions.
SCRIVENER_DEFAULT_PT = 13.0


@dataclass
class ScrivenerNode:
    node_type: str
    title: str
    body: str = ""
    synopsis: str = ""
    notes: str = ""
    parent_index: int | None = None
    images: list[bytes] = field(default_factory=list)
    image_sizes: list[tuple[int | None, int | None]] = field(default_factory=list)


@dataclass
class ExportNode:
    id: int
    parent_id: int | None
    node_type: str
    title: str
    body: str | None
    synopsis: str | None
    notes: str | None
    body_rtf: str | None = None


@dataclass
class _RtfStyle:
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    size: float | None = None
    color: str | None = None


@dataclass
class _ExportParagraph:
    align: str = "left"
    indent_left: int = 0
    indent_right: int = 0
    indent_first: int = 0


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(item: ET.Element, name: str) -> str:
    for child in list(item):
        if _local(child.tag) == name:
            return "".join(child.itertext()).strip()
    return ""


def _meta_text(item: ET.Element, name: str) -> str:
    for child in list(item):
        if _local(child.tag) == "metadata":
            return _child_text(child, name)
    return ""


IMAGE_PLACEHOLDER_PREFIX = "@@SCRIVENER_IMAGE_"
IMAGE_PLACEHOLDER_SUFFIX = "@@"
TAB_MARKER = '<span data-ms-tab="true"></span>'


def _pict_size(group: str) -> tuple[int | None, int | None]:
    """Return the display size Scrivener recorded for an inline image, in px."""

    def goal_twips(name: str) -> int | None:
        match = re.search(rf"\\{name}(\d+)", group)
        return int(match.group(1)) if match else None

    def source_pixels(name: str) -> int | None:
        match = re.search(rf"\\{name}(\d+)", group)
        return int(match.group(1)) if match else None

    width_goal = goal_twips("picwgoal")
    height_goal = goal_twips("pichgoal")
    width = round(width_goal / 15) if width_goal else source_pixels("picw")
    height = round(height_goal / 15) if height_goal else source_pixels("pich")
    return width, height


def _prepare_rtf(
    raw: str,
) -> tuple[str, list[bytes], list[tuple[int | None, int | None]]]:
    """Replace inline image groups with placeholders and return their bytes."""
    pieces: list[str] = []
    images: list[bytes] = []
    sizes: list[tuple[int | None, int | None]] = []
    last = 0
    search = 0
    while True:
        index = raw.find("{\\pict", search)
        if index < 0:
            break
        search = index + 1
        depth = 0
        end = index
        while end < len(raw):
            if raw[end] == "{":
                depth += 1
            elif raw[end] == "}":
                depth -= 1
                if depth == 0:
                    break
            end += 1
        group = raw[index : end + 1]
        image = _decode_pict_group(group)
        if image:
            pieces.append(raw[last:index])
            pieces.append(
                f"{IMAGE_PLACEHOLDER_PREFIX}{len(images)}"
                f"{IMAGE_PLACEHOLDER_SUFFIX}"
            )
            images.append(image)
            sizes.append(_pict_size(group))
            last = end + 1
        search = end + 1
    pieces.append(raw[last:])
    return "".join(pieces), images, sizes


def _render_rtf_segment(content: str, style: _RtfStyle) -> str:
    if style.color:
        content = f'<span style="color: {style.color}">{content}</span>'
    if style.size is not None and abs(style.size - SCRIVENER_DEFAULT_PT) > 0.01:
        size = f"{style.size:g}"
        content = f'<span style="font-size: {size}pt">{content}</span>'
    if style.strike:
        content = f"<s>{content}</s>"
    if style.underline:
        content = f"<u>{content}</u>"
    if style.italic:
        content = f"<em>{content}</em>"
    if style.bold:
        content = f"<strong>{content}</strong>"
    return content


def _render_rtf_paragraph(
    align: str,
    content: str,
    *,
    indent_left: int = 0,
    indent_right: int = 0,
    indent_first: int = 0,
) -> str:
    styles: list[str] = []
    if align in {"center", "right", "justify"}:
        styles.append(f"text-align: {align}")
    if indent_left:
        styles.append(f"padding-left: {indent_left}px")
    if indent_right:
        styles.append(f"padding-right: {indent_right}px")
    if indent_first:
        styles.append(f"text-indent: {indent_first}px")
    style = f' style="{"; ".join(styles)}"' if styles else ""
    return f"<p{style}>{content}</p>"


def _parse_rtf_color_table(raw: str) -> list[str | None]:
    match = re.search(r"\{\\colortbl(.*?)\}", raw, re.S)
    if not match:
        return []

    colors: list[str | None] = []
    for entry in match.group(1).split(";"):
        red = re.search(r"\\red(\d+)", entry)
        green = re.search(r"\\green(\d+)", entry)
        blue = re.search(r"\\blue(\d+)", entry)
        if not red or not green or not blue:
            colors.append(None)
            continue
        values = [min(255, max(0, int(part.group(1)))) for part in (red, green, blue)]
        colors.append("#" + "".join(f"{value:02x}" for value in values))
    return colors


def _rtf_encoding(raw: str, declared: str) -> str:
    """Pick the byte encoding actually used by RTF ``\\'hh`` escapes.

    Scrivener sometimes writes Korean documents with ``\\ansicpg1252`` while
    the text is CP949 and the font table says ``\\fcharset129``. Trusting the
    declared page in that case turns every Hangul character into mojibake.
    """
    candidates = [declared]
    charset_encodings = {
        128: "cp932",
        129: "cp949",
        134: "cp936",
        136: "cp950",
    }
    for charset, encoding in charset_encodings.items():
        if re.search(rf"\\fcharset{charset}\b", raw):
            candidates.append(encoding)

    runs: list[bytes] = []
    for match in re.finditer(r"(?:\\'[0-9a-fA-F]{2})+", raw):
        runs.append(
            bytes(int(value, 16) for value in re.findall(r"'([0-9a-fA-F]{2})", match.group()))
        )
    if not runs:
        return declared

    def score(encoding: str) -> tuple[int, int]:
        decoded = 0
        meaningful = 0
        for run in runs:
            try:
                text = run.decode(encoding)
            except (LookupError, UnicodeDecodeError):
                continue
            decoded += len(text)
            meaningful += sum(
                1
                for char in text
                if "\uac00" <= char <= "\ud7a3"
                or "\u3040" <= char <= "\u30ff"
                or "\u4e00" <= char <= "\u9fff"
            )
        return decoded, meaningful

    best = declared
    best_score = score(declared)
    for encoding in candidates[1:]:
        candidate_score = score(encoding)
        if candidate_score[1] > best_score[1] or (
            candidate_score[1] == best_score[1]
            and candidate_score[0] > best_score[0]
        ):
            best, best_score = encoding, candidate_score
    return best


def _rtf_to_html_with_images(
    data: bytes,
) -> tuple[str, list[bytes], list[tuple[int | None, int | None]]]:
    raw = data.decode("latin-1", errors="replace")
    raw, images, image_sizes = _prepare_rtf(raw)
    codepage = re.search(r"\\ansicpg(\d+)", raw)
    declared = f"cp{codepage.group(1)}" if codepage else "cp1252"
    encoding = _rtf_encoding(raw, declared)
    uc_match = re.search(r"\\uc(\d+)", raw)
    uc_count = int(uc_match.group(1)) if uc_match else 1
    colors = _parse_rtf_color_table(raw)

    style = _RtfStyle()
    align = "left"
    indent_left = 0
    indent_right = 0
    indent_first = 0
    stack: list[tuple[_RtfStyle, str, bool, tuple[int, int, int]]] = []
    skip = False
    paragraphs: list[tuple[str, str, int, int, int]] = []
    segments: list[tuple[str, _RtfStyle]] = []

    def append(html: str, text_style: _RtfStyle | None = None) -> None:
        if not html:
            return
        target = text_style or style
        if segments and segments[-1][1] == target:
            segments[-1] = (segments[-1][0] + html, segments[-1][1])
        else:
            segments.append((html, replace(target)))

    def flush(force: bool = False) -> None:
        if not segments and not force:
            return
        content = "".join(
            _render_rtf_segment(part, part_style)
            for part, part_style in segments
        )
        paragraphs.append(
            (align, content, indent_left, indent_right, indent_first)
        )
        segments.clear()

    index = 0
    while index < len(raw):
        char = raw[index]
        if raw.startswith(IMAGE_PLACEHOLDER_PREFIX, index):
            end = raw.find(
                IMAGE_PLACEHOLDER_SUFFIX,
                index + len(IMAGE_PLACEHOLDER_PREFIX),
            )
            if end != -1:
                end += len(IMAGE_PLACEHOLDER_SUFFIX)
                append(raw[index:end], _RtfStyle())
                index = end
                continue
        if char == "{":
            skip_group = False
            look = index + 1
            while look < len(raw) and raw[look] in " \t\r\n":
                look += 1
            if look < len(raw) and raw[look] == "\\":
                word_start = look + 1
                if word_start < len(raw) and raw[word_start] == "*":
                    skip_group = True
                else:
                    word_end = word_start
                    while word_end < len(raw) and raw[word_end].isalpha():
                        word_end += 1
                    word = raw[word_start:word_end].lower()
                    if word in IGNORED_RTF_GROUPS:
                        skip_group = True
            stack.append(
                (
                    replace(style),
                    align,
                    skip,
                    (indent_left, indent_right, indent_first),
                )
            )
            if skip_group:
                skip = True
            index += 1
            continue
        if char == "}":
            if stack:
                style, align, skip, indents = stack.pop()
                indent_left, indent_right, indent_first = indents
            index += 1
            continue
        if skip:
            index += 1
            continue
        if char == "\\":
            if index + 1 >= len(raw):
                index += 1
                continue
            following = raw[index + 1]
            if following in "\r\n":
                flush(force=True)
                index += 2
                if (
                    following == "\r"
                    and index < len(raw)
                    and raw[index] == "\n"
                ):
                    index += 1
                continue
            if following in "\\{}":
                append(escape(following))
                index += 2
                continue
            if following == "~":
                append("&nbsp;")
                index += 2
                continue
            if following == " ":
                append(" ")
                index += 2
                continue
            if following == "_":
                append("_")
                index += 2
                continue
            if following == "-":
                index += 2
                continue
            if following == "'":
                hex_bytes = bytearray()
                cursor = index
                while (
                    cursor + 3 < len(raw)
                    and raw[cursor] == "\\"
                    and raw[cursor + 1] == "'"
                ):
                    try:
                        hex_bytes.append(int(raw[cursor + 2 : cursor + 4], 16))
                    except ValueError:
                        break
                    cursor += 4
                if not hex_bytes:
                    index += 4
                    continue
                try:
                    text = hex_bytes.decode(encoding)
                except (LookupError, UnicodeDecodeError):
                    text = hex_bytes.decode("latin-1")
                append(escape(text))
                index = cursor
                continue
            if following == "u":
                match = re.match(r"\\u(-?\d+)", raw[index:])
                if match:
                    code = int(match.group(1))
                    if code < 0:
                        code += 65536
                    append(escape(chr(code)))
                    index += match.end()
                    for _ in range(uc_count):
                        if index >= len(raw):
                            break
                        if raw[index] == "\\":
                            if index + 1 < len(raw) and raw[index + 1] == "'":
                                index += 4
                            elif index + 1 < len(raw) and raw[index + 1].isalpha():
                                end = index + 2
                                while end < len(raw) and raw[end].isalpha():
                                    end += 1
                                while end < len(raw) and raw[end].isdigit():
                                    end += 1
                                if end < len(raw) and raw[end] == " ":
                                    end += 1
                                index = end
                            else:
                                index += 2
                        else:
                            index += 1
                    continue
            match = re.match(r"\\([a-zA-Z]+)(-?\d+)? ?", raw[index:])
            if match:
                word = match.group(1).lower()
                param = match.group(2)
                if word == "par":
                    flush(force=True)
                elif word == "line":
                    append("<br>")
                elif word == "tab":
                    append(TAB_MARKER)
                elif word in RTF_SYMBOLS:
                    append(escape(RTF_SYMBOLS[word]))
                elif word == "pard":
                    align = "left"
                    indent_left = 0
                    indent_right = 0
                    indent_first = 0
                elif word in {"li", "ri", "fi"} and param is not None:
                    pixels = round(int(param) / 15)
                    if word == "li":
                        indent_left = pixels
                    elif word == "ri":
                        indent_right = pixels
                    else:
                        indent_first = pixels
                elif word in {"ql", "qc", "qr", "qj"}:
                    align = {
                        "ql": "left",
                        "qc": "center",
                        "qr": "right",
                        "qj": "justify",
                    }[word]
                elif word == "b":
                    style.bold = param != "0"
                elif word == "i":
                    style.italic = param != "0"
                elif word in {"ul", "ulnone"}:
                    style.underline = word == "ul" and param != "0"
                elif word in {"strike", "striked"}:
                    style.strike = param != "0"
                elif word == "fs" and param:
                    size = int(param) / 2
                    style.size = size if size > 0 else None
                elif word == "cf":
                    color_index = int(param or "0")
                    style.color = (
                        colors[color_index]
                        if 0 <= color_index < len(colors)
                        else None
                    )
                elif word == "plain":
                    style = _RtfStyle()
                index += match.end()
                continue
            index += 2
            continue
        if char == "\t":
            append(TAB_MARKER)
            index += 1
            continue
        if char in "\r\n":
            index += 1
            continue
        append(escape(char))
        index += 1

    flush()
    # Scrivener terminates the last paragraph with a line break before the
    # closing brace. Drop only that artifact so intentional trailing blank
    # lines are preserved.
    if paragraphs and not paragraphs[-1][1].strip():
        paragraphs.pop()
    html = "".join(
        _render_rtf_paragraph(
            paragraph_align,
            content,
            indent_left=left,
            indent_right=right,
            indent_first=first,
        )
        for paragraph_align, content, left, right, first in paragraphs
    )
    return html, images, image_sizes


def _rtf_to_html(data: bytes) -> str:
    return _rtf_to_html_with_images(data)[0]


def _decode_pict_group(group: str) -> bytes | None:
    marker = next(
        (
            item
            for item in ("\\pngblip", "\\jpegblip")
            if item in group
        ),
        None,
    )
    if marker is None:
        return None
    rest = group.split(marker, 1)[1]
    binary = re.search(r"\\bin(\d+)\s", rest)
    if binary:
        size = int(binary.group(1))
        return rest[binary.end() : binary.end() + size].encode("latin-1")
    rest = re.sub(r"\\[a-zA-Z]+-?\d* ?", "", rest)
    digits = re.sub(r"[^0-9a-fA-F]", "", rest)
    if len(digits) % 2:
        digits = digits[:-1]
    if not digits:
        return None
    try:
        return bytes.fromhex(digits)
    except ValueError:
        return None


def _rtf_header(colors: list[str]) -> str:
    color_table = "".join(
        f"\\red{int(color[1:3], 16)}"
        f"\\green{int(color[3:5], 16)}"
        f"\\blue{int(color[5:7], 16)};"
        for color in colors
    )
    return "\n".join(
        [
            "{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761",
            "{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}",
            f"{{\\colortbl;{color_table}}}",
            "\\paperw11900\\paperh16840\\margl1440\\margr1440"
            "\\vieww11520\\viewh8400\\viewkind0",
            "\\pard\\tx566\\tx1133\\tx1700\\tx2267\\tx2834"
            "\\tx3401\\tx3968\\tx4535\\tx5102\\tx5669"
            "\\tx6236\\tx6803\\pardirnatural\\partightenfactor0",
            f"\\f0\\fs{round(SCRIVENER_DEFAULT_PT * 2)} \\cf0 ",
        ]
    )


RTF_HEADER = _rtf_header(["#ffffff"])


def _rtf_text(text: str) -> str:
    parts: list[str] = []
    for char in text:
        if char == "\\":
            parts.append("\\\\")
        elif char in "{}":
            parts.append(f"\\{char}")
        elif char == "\n":
            parts.append("\\par\n")
        elif char == "\t":
            parts.append("\\tab ")
        elif char == "\r":
            continue
        elif 32 <= ord(char) < 127:
            parts.append(char)
        else:
            code = ord(char)
            if code > 65535:
                parts.append("?")
                continue
            if code > 32767:
                code -= 65536
            parts.append(f"\\uc1\\u{code}?")
    return "".join(parts)


def _rtf_escape(text: str) -> str:
    return RTF_HEADER + _rtf_text(text) + "}"


_RTF_BLOCK_TAGS = {
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


def _parse_dimension(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d+(?:\.\d+)?", value)
    if not match:
        return None
    parsed = round(float(match.group(0)))
    return parsed if parsed > 0 else None


def _rtf_image(data: bytes, width: int | None, height: int | None) -> str:
    from PIL import Image

    kind: str | None = None
    natural_width = width or 0
    natural_height = height or 0
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        kind = "pngblip"
    elif data.startswith(b"\xff\xd8"):
        kind = "jpegblip"

    try:
        with Image.open(BytesIO(data)) as image:
            natural_width, natural_height = image.size
            if kind is None:
                converted = BytesIO()
                image.convert("RGBA").save(converted, format="PNG")
                data = converted.getvalue()
                kind = "pngblip"
    except Exception:
        if kind is None or not natural_width or not natural_height:
            return ""

    width = width or natural_width
    height = height or natural_height
    if not width or not height:
        return ""

    width_goal = max(1, round(width * 15))
    height_goal = max(1, round(height * 15))
    return (
        "{\\*\\shppict{\\pict {\\*\\nisusfilename image}"
        f"\\picw{natural_width}\\pich{natural_height}"
        f"\\picwgoal{width_goal}\\pichgoal{height_goal}"
        f"\\{kind} "
        f"{data.hex()}" + "}}"
    )


def _style_map(style: str | None) -> dict[str, str]:
    if not style:
        return {}
    return {
        match.group(1).lower(): match.group(2).strip()
        for match in re.finditer(r"([\w-]+)\s*:\s*([^;]+)", style)
    }


def _parse_signed_px(value: str | None) -> int:
    if not value:
        return 0
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    return round(float(match.group(0))) if match else 0


def _parse_css_color(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().lower()
    match = re.fullmatch(r"#([0-9a-f]{6})", value)
    if match:
        return f"#{match.group(1)}"
    match = re.fullmatch(r"#([0-9a-f]{3})", value)
    if match:
        return "#" + "".join(char * 2 for char in match.group(1))
    match = re.match(
        r"rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)",
        value,
    )
    if match:
        return "#" + "".join(
            f"{min(255, int(part)):02x}" for part in match.groups()
        )
    return None


def _parse_font_size(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*(pt|px)?", value)
    if not match:
        return None
    size = float(match.group(1))
    if (match.group(2) or "pt") == "px":
        size *= 0.75
    return size if size > 0 else None


class _RtfBodyParser(HTMLParser):
    def __init__(self, load_image: Callable[[str], bytes | None]) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.colors: list[str] = ["#ffffff"]
        self._color_index = {"#ffffff": 1}
        self._skip_depth = 0
        self._tab_depth = 0
        self._load_image = load_image
        self._style = _RtfStyle()
        self._emitted_style = _RtfStyle()
        self._style_stack: list[_RtfStyle] = []
        self._paragraph = _ExportParagraph()
        self._paragraph_open = False

    def _color_number(self, color: str | None) -> int:
        if not color:
            return 0
        number = self._color_index.get(color)
        if number is None:
            self.colors.append(color)
            number = len(self.colors)
            self._color_index[color] = number
        return number

    def _ensure_style(self) -> None:
        current = self._style
        previous = self._emitted_style
        controls: list[str] = []
        if current.bold != previous.bold:
            controls.append("\\b " if current.bold else "\\b0 ")
        if current.italic != previous.italic:
            controls.append("\\i " if current.italic else "\\i0 ")
        if current.underline != previous.underline:
            controls.append("\\ul " if current.underline else "\\ulnone ")
        if current.strike != previous.strike:
            controls.append("\\strike " if current.strike else "\\strike0 ")
        current_size = round(
            (current.size if current.size is not None else SCRIVENER_DEFAULT_PT) * 2
        )
        previous_size = round(
            (previous.size if previous.size is not None else SCRIVENER_DEFAULT_PT) * 2
        )
        if current_size != previous_size:
            controls.append(f"\\fs{current_size} ")
        if current.color != previous.color:
            controls.append(f"\\cf{self._color_number(current.color)} ")
        if controls:
            self.parts.append("".join(controls))
        self._emitted_style = replace(current)

    def _open_paragraph(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if self._paragraph_open:
            self._close_paragraph()
        values = {key: value for key, value in attrs}
        styles = _style_map(values.get("style"))
        align = styles.get("text-align", "left").lower()
        if align not in {"left", "center", "right", "justify"}:
            align = "left"
        self._paragraph = _ExportParagraph(
            align=align,
            indent_left=_parse_signed_px(
                styles.get("padding-left") or styles.get("margin-left")
            ),
            indent_right=_parse_signed_px(
                styles.get("padding-right") or styles.get("margin-right")
            ),
            indent_first=_parse_signed_px(styles.get("text-indent")),
        )
        self._paragraph_open = True
        controls = ["\\pard"]
        controls.append(
            {
                "left": "\\ql ",
                "center": "\\qc ",
                "right": "\\qr ",
                "justify": "\\qj ",
            }[align]
        )
        if self._paragraph.indent_left:
            controls.append(f"\\li{self._paragraph.indent_left * 15} ")
        if self._paragraph.indent_right:
            controls.append(f"\\ri{self._paragraph.indent_right * 15} ")
        if self._paragraph.indent_first:
            controls.append(f"\\fi{self._paragraph.indent_first * 15} ")
        controls.append(
            f"\\fs{round(SCRIVENER_DEFAULT_PT * 2)}\\cf0\\b0\\i0\\ulnone\\strike0 "
        )
        self.parts.append("".join(controls))
        self._style = _RtfStyle()
        self._emitted_style = _RtfStyle()
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            size = {"h1": 24, "h2": 20, "h3": 16}.get(tag, 13)
            self._style = _RtfStyle(bold=True, size=size)

    def _close_paragraph(self) -> None:
        if not self._paragraph_open:
            return
        if not self.parts or not self.parts[-1].endswith("\\par\n"):
            self.parts.append("\\par\n")
        self._paragraph_open = False
        self._paragraph = _ExportParagraph()
        self._style = _RtfStyle()
        self._emitted_style = _RtfStyle()

    def _append_image(self, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value for key, value in attrs}
        src = values.get("src")
        if not src:
            return
        data = self._load_image(src)
        if not data:
            return
        if not self._paragraph_open:
            self._open_paragraph("p", [])
        style = values.get("style") or ""
        width = _parse_dimension(values.get("width"))
        height = _parse_dimension(values.get("height"))
        if width is None:
            match = re.search(r"width\s*:\s*([^;]+)", style)
            width = _parse_dimension(match.group(1) if match else None)
        if height is None:
            match = re.search(r"height\s*:\s*([^;]+)", style)
            height = _parse_dimension(match.group(1) if match else None)
        image = _rtf_image(data, width, height)
        if image:
            self.parts.append(image)

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        tag = tag.lower()
        if tag in {"script", "style"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "br":
            if not self._paragraph_open:
                self._open_paragraph("p", [])
            self._ensure_style()
            self.parts.append("\\line ")
            return
        if tag == "hr":
            self._close_paragraph()
            self.parts.append("\\pard\\par\n")
            return
        if tag == "img":
            self._append_image(attrs)
            return
        if tag in _RTF_BLOCK_TAGS:
            if tag in {"p", "div", "blockquote", "section", "article", "pre"}:
                self._open_paragraph(tag, attrs)
            elif tag.startswith("h"):
                self._open_paragraph(tag, attrs)
            return

        values = {key: value for key, value in attrs}
        if tag == "span" and values.get("data-ms-tab") == "true":
            if not self._paragraph_open:
                self._open_paragraph("p", [])
            self._ensure_style()
            self.parts.append("\\tab ")
            self._tab_depth += 1
            return
        if tag in {"strong", "b", "em", "i", "u", "s", "strike", "del", "span"}:
            self._style_stack.append(replace(self._style))
            if tag in {"strong", "b"}:
                self._style.bold = True
            elif tag in {"em", "i"}:
                self._style.italic = True
            elif tag == "u":
                self._style.underline = True
            elif tag in {"s", "strike", "del"}:
                self._style.strike = True
            elif tag == "span":
                styles = _style_map(values.get("style"))
                color = _parse_css_color(styles.get("color"))
                size = _parse_font_size(styles.get("font-size"))
                if color:
                    self._style.color = color
                if size:
                    self._style.size = size

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style"}:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag == "span" and self._tab_depth:
            self._tab_depth -= 1
            return
        if tag in _RTF_BLOCK_TAGS:
            self._close_paragraph()
            return
        if tag in {
            "strong",
            "b",
            "em",
            "i",
            "u",
            "s",
            "strike",
            "del",
            "span",
        }:
            if self._style_stack:
                self._style = self._style_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._skip_depth or self._tab_depth:
            return
        if not self._paragraph_open:
            if not data.strip():
                return
            self._open_paragraph("p", [])
        self._ensure_style()
        self.parts.append(_rtf_text(data.replace("⇥", "\t")))

    def finish(self) -> None:
        self._close_paragraph()


def html_to_rtf_with_images(
    body: str | None,
    load_image: Callable[[str], bytes | None],
) -> str:
    if not body:
        return RTF_HEADER + "}"
    parser = _RtfBodyParser(load_image)
    parser.feed(body)
    parser.close()
    parser.finish()
    return _rtf_header(parser.colors) + "".join(parser.parts) + "}"


def _html_to_rtf(body: str | None) -> str:
    return _rtf_escape(html_to_plain(body))


def _project_title_from_manifest(
    root: ET.Element,
    manifest: str,
    fallback: str | None = None,
) -> str:
    title = ""
    for child in list(root):
        if _local(child.tag) in {"projectproperties", "projectsettings"}:
            title = _child_text(child, "projecttitle")
            if title:
                break
    if not title:
        title = manifest.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        try:
            title = title.encode("cp437").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    if not title:
        title = fallback or "가져온 원고"
    return unicodedata.normalize("NFC", title)


def read_scrivener_project_title(
    data: bytes,
    *,
    fallback: str | None = None,
) -> str:
    """Read only the manifest title, without parsing any RTF bodies."""
    if len(data) > MAX_IMPORT_BYTES:
        raise ValueError("파일이 너무 큽니다.")
    try:
        with ZipFile(BytesIO(data)) as archive:
            names = [info.filename for info in archive.infolist() if not info.is_dir()]
            manifest = next(
                (name for name in names if name.lower().endswith(".scrivx")),
                None,
            )
            if manifest is None:
                raise ValueError("스크리브너 프로젝트 파일(.scrivx)이 없습니다.")
            try:
                root = ET.fromstring(archive.read(manifest))
            except ET.ParseError as exc:
                raise ValueError("프로젝트 XML을 읽을 수 없습니다.") from exc
            return _project_title_from_manifest(root, manifest, fallback)
    except BadZipFile as exc:
        raise ValueError("ZIP 파일을 열 수 없습니다.") from exc


def parse_scrivener_zip(data: bytes) -> tuple[str, list[ScrivenerNode]]:
    """Read a zipped Scrivener project into a flat ordered node list."""
    if len(data) > MAX_IMPORT_BYTES:
        raise ValueError("파일이 너무 큽니다.")
    try:
        with ZipFile(BytesIO(data)) as archive:
            infos = archive.infolist()
            if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("압축 해제된 내용이 너무 큽니다.")
            names = [info.filename for info in infos if not info.is_dir()]
            by_lower = {name.lower(): name for name in names}
            manifest = next(
                (name for name in names if name.lower().endswith(".scrivx")),
                None,
            )
            if manifest is None:
                raise ValueError("스크리브너 프로젝트 파일(.scrivx)이 없습니다.")
            try:
                root = ET.fromstring(archive.read(manifest))
            except ET.ParseError as exc:
                raise ValueError("프로젝트 XML을 읽을 수 없습니다.") from exc

            prefix = manifest.rsplit("/", 1)[0] if "/" in manifest else ""

            def read_member(path: str) -> bytes | None:
                candidates = []
                if prefix:
                    candidates.append(f"{prefix}/{path}")
                candidates.append(path)
                for candidate in candidates:
                    actual = by_lower.get(candidate.lower())
                    if actual:
                        return archive.read(actual)
                return None

            def read_document(identifier: str, filename: str) -> bytes | None:
                suffix = f"/{identifier.lower()}/{filename}"
                for name in names:
                    lowered = name.lower()
                    if lowered.endswith(suffix):
                        return archive.read(name)
                return None

            image_names = {
                "content.png",
                "content.jpg",
                "content.jpeg",
                "content.webp",
                "content.gif",
            }

            def read_image_document(identifier: str) -> bytes | None:
                suffix = f"/{identifier.lower()}/"
                for name in names:
                    lowered = name.lower()
                    if (
                        suffix in lowered
                        and lowered.rsplit("/", 1)[-1] in image_names
                    ):
                        return archive.read(name)
                return None

            node_list: list[ScrivenerNode] = []

            def walk(item: ET.Element, parent_index: int | None) -> None:
                kind = (item.get("Type") or item.get("TYPE") or "Folder").lower()
                if kind in {"trashfolder", "researchfolder", "searchresults"}:
                    return
                if kind == "draftfolder":
                    child_parent = parent_index
                elif kind in {"text", "document"}:
                    identifier = item.get("UUID") or item.get("ID") or ""
                    rtf = None
                    if identifier:
                        rtf = read_document(identifier, "content.rtf")
                        if rtf is None:
                            rtf = read_member(f"Files/Docs/{identifier}.rtf")
                    synopsis_text = ""
                    if identifier:
                        synopsis = read_document(identifier, "synopsis.txt")
                        if synopsis:
                            synopsis_text = synopsis.decode("utf-8", "replace").strip()
                    if not synopsis_text:
                        synopsis_text = _meta_text(item, "synopsis")
                    notes = ""
                    if identifier:
                        notes_rtf = read_document(identifier, "notes.rtf")
                        if notes_rtf:
                            notes = html_to_plain(_rtf_to_html(notes_rtf))
                    body, images, image_sizes = (
                        _rtf_to_html_with_images(rtf)
                        if rtf
                        else ("", [], [])
                    )
                    node_list.append(
                        ScrivenerNode(
                            node_type="chapter",
                            title=_child_text(item, "title") or "제목 없는 문서",
                            body=body,
                            synopsis=synopsis_text,
                            notes=notes,
                            parent_index=parent_index,
                            images=images,
                            image_sizes=image_sizes,
                        )
                    )
                    child_parent = None
                elif kind in {"image", "pdf"}:
                    identifier = item.get("UUID") or item.get("ID") or ""
                    image = (
                        read_image_document(identifier)
                        if kind == "image" and identifier
                        else None
                    )
                    node_list.append(
                        ScrivenerNode(
                            node_type="chapter",
                            title=_child_text(item, "title") or "첨부 이미지",
                            parent_index=parent_index,
                            images=[image] if image else [],
                        )
                    )
                    child_parent = None
                elif kind in {"folder", "draftfolder"}:
                    node_list.append(
                        ScrivenerNode(
                            node_type="folder",
                            title=_child_text(item, "title") or "새 폴더",
                            synopsis=_meta_text(item, "synopsis"),
                            parent_index=parent_index,
                        )
                    )
                    child_parent = len(node_list) - 1
                else:
                    child_parent = parent_index

                for child in list(item):
                    if _local(child.tag) == "children":
                        for grandchild in list(child):
                            if _local(grandchild.tag) == "binderitem":
                                walk(grandchild, child_parent)

            binder = None
            for child in list(root):
                if _local(child.tag) == "binder":
                    binder = child
                    break
            if binder is None:
                raise ValueError("바인더 정보를 찾을 수 없습니다.")

            for child in list(binder):
                if _local(child.tag) == "binderitem":
                    walk(child, None)

            if not node_list:
                raise ValueError("가져올 문서가 없습니다.")

            return _project_title_from_manifest(root, manifest), node_list
    except BadZipFile as exc:
        raise ValueError("ZIP 파일을 열 수 없습니다.") from exc


def _safe_stem(title: str) -> str:
    return (
        re.sub(r"[^\w가-힣.-]+", "_", title or "manuscript").strip("._")
        or "manuscript"
    )


def build_scrivener_zip(project_title: str, nodes: list[ExportNode]) -> bytes:
    """Create a zipped Scrivener project matching a saved Scrivener 3 package."""
    stem = _safe_stem(project_title)
    timestamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %z")

    root = ET.Element(
        "ScrivenerProject",
        {
            "Identifier": str(uuid.uuid4()).upper(),
            "Version": "2.0",
            "Creator": "SCRMAC-3.2.2-14632",
            "Device": "web",
            "Author": "",
            "Modified": timestamp,
            "ModID": str(uuid.uuid4()).upper(),
        },
    )
    binder = ET.SubElement(root, "Binder")

    def binder_item(parent: ET.Element, item_type: str, title: str) -> ET.Element:
        item = ET.SubElement(
            parent,
            "BinderItem",
            {
                "UUID": str(uuid.uuid4()).upper(),
                "Type": item_type,
                "Created": timestamp,
                "Modified": timestamp,
            },
        )
        ET.SubElement(item, "Title").text = title
        return item

    draft = binder_item(binder, "DraftFolder", "Manuscript")
    draft_children = ET.SubElement(draft, "Children")
    binder_item(binder, "ResearchFolder", "Research")
    binder_item(binder, "TrashFolder", "Trash")

    settings = ET.SubElement(root, "ProjectSettings")
    ET.SubElement(settings, "ProjectTitle").text = project_title or stem
    ET.SubElement(settings, "Author").text = ""

    uid_by_id = {
        node.id: str(
            uuid.uuid5(uuid.NAMESPACE_URL, f"manuscript-node-{node.id}")
        ).upper()
        for node in nodes
    }
    children_by_parent: dict[int | None, list[ExportNode]] = {}
    for node in nodes:
        parent = node.parent_id if node.parent_id in uid_by_id else None
        children_by_parent.setdefault(parent, []).append(node)

    files: dict[str, bytes] = {}

    def add_item(parent_element: ET.Element, node: ExportNode) -> None:
        is_chapter = node.node_type == "chapter"
        identifier = uid_by_id[node.id]
        item = ET.SubElement(
            parent_element,
            "BinderItem",
            {
                "UUID": identifier,
                "Type": "Text" if is_chapter else "Folder",
                "Created": timestamp,
                "Modified": timestamp,
            },
        )
        ET.SubElement(item, "Title").text = node.title or "Untitled"
        meta = ET.SubElement(item, "MetaData")
        ET.SubElement(meta, "IncludeInCompile").text = "Yes"
        text_settings = ET.SubElement(item, "TextSettings")
        ET.SubElement(text_settings, "TextSelection").text = "0,0"
        if is_chapter:
            body_rtf = node.body_rtf or _html_to_rtf(node.body)
            files[f"Files/Data/{identifier}/content.rtf"] = body_rtf.encode(
                "utf-8"
            )
            if node.synopsis:
                files[f"Files/Data/{identifier}/synopsis.txt"] = (
                    node.synopsis.encode("utf-8")
                )
        if children_by_parent.get(node.id):
            child_container = ET.SubElement(item, "Children")
            for child in children_by_parent[node.id]:
                add_item(child_container, child)

    for root_node in children_by_parent.get(None, []):
        add_item(draft_children, root_node)

    labels = ET.SubElement(root, "LabelSettings")
    ET.SubElement(labels, "DefaultLabelID").text = "-1"
    label_items = ET.SubElement(labels, "Labels")
    ET.SubElement(label_items, "Label", {"ID": "-1"}).text = "No Label"
    statuses = ET.SubElement(root, "StatusSettings")
    ET.SubElement(statuses, "DefaultStatusID").text = "-1"
    status_items = ET.SubElement(statuses, "StatusItems")
    ET.SubElement(status_items, "Status", {"ID": "-1"}).text = "No Status"

    manifest = (
        b'<?xml version="1.0" encoding="UTF-8"?>\n'
        + ET.tostring(root, encoding="utf-8")
    )
    files[f"{stem}.scrivx"] = manifest
    files["Files/version.txt"] = b"23\n"
    files["Settings/compile.xml"] = (
        b"<CompileSettings><CurrentFileType>docx</CurrentFileType>"
        b"</CompileSettings>"
    )

    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def safe_filename(title: str) -> str:
    return f"{_safe_stem(title)}.scriv.zip"
