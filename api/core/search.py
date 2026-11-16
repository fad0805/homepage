"""Small shared helpers for server-side substring search."""

from __future__ import annotations

MAX_QUERY_LENGTH = 100
MAX_QUERY_TOKENS = 10


def search_tokens(query: str | None) -> list[str]:
    normalized = (query or "").strip().lower()
    if not normalized:
        return []
    return normalized[:MAX_QUERY_LENGTH].split()[:MAX_QUERY_TOKENS]


def like_pattern(token: str) -> str:
    escaped = (
        token.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )
    return f"%{escaped}%"
