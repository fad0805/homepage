"""Helpers for keeping stored image references independent of the CDN host.

Only the object path (for example ``images/characters/abc.jpg``) belongs in the
database. ``S3_PUBLIC_BASE_URL`` is applied when a value is read, so changing
the public host does not require rewriting every row.
"""

import os
from urllib.parse import unquote, urlparse

_S3_PUBLIC_BASE_URL = os.getenv("S3_PUBLIC_BASE_URL")
_S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
_S3_BUCKET = os.getenv("S3_BUCKET")
_S3_REGION = os.getenv("S3_REGION") or "ap-northeast-2"

_EXTERNAL_PREFIXES = ("http://", "https://", "//", "data:", "blob:")


def _public_bases() -> list[str]:
    bases: list[str] = []
    if _S3_PUBLIC_BASE_URL:
        bases.append(_S3_PUBLIC_BASE_URL.rstrip("/"))
    if _S3_ENDPOINT_URL and _S3_BUCKET:
        bases.append(f"{_S3_ENDPOINT_URL.rstrip('/')}/{_S3_BUCKET}")
    if _S3_BUCKET:
        bases.append(
            f"https://{_S3_BUCKET}.s3.{_S3_REGION}.amazonaws.com"
        )
    return bases


def build_public_url(reference: str) -> str:
    """Return the public URL for an object key."""
    if _S3_PUBLIC_BASE_URL:
        base = _S3_PUBLIC_BASE_URL.rstrip("/")
    elif _S3_ENDPOINT_URL and _S3_BUCKET:
        base = f"{_S3_ENDPOINT_URL.rstrip('/')}/{_S3_BUCKET}"
    elif _S3_BUCKET:
        base = f"https://{_S3_BUCKET}.s3.{_S3_REGION}.amazonaws.com"
    else:
        # Without storage configuration there is nothing to join. Keep the
        # reference intact so local development data is not corrupted.
        return reference

    return f"{base}/{reference.lstrip('/')}"


def s3_key_from_url(url: str) -> str | None:
    """Return the object key if ``url`` points at one of our public bases."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None

    normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    for base in _public_bases():
        if normalized.startswith(f"{base}/"):
            return unquote(normalized[len(base) + 1 :])
    return None


def is_external_reference(value: str) -> bool:
    """Return whether ``value`` is an absolute URL we should leave alone."""
    return value.startswith(_EXTERNAL_PREFIXES) or value.startswith("/")


def storage_reference(value: str | None) -> str | None:
    """Convert a client or legacy URL into the value stored in the database.

    External URLs and local ``/uploads/...`` paths are kept as-is. URLs under
    the configured object-storage base are reduced to their object key.
    """
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    key = s3_key_from_url(text)
    if key is not None:
        return key

    if is_external_reference(text):
        return text

    return text.lstrip("/")


def public_url(value: str | None) -> str | None:
    """Return the public URL for a stored image reference."""
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    key = s3_key_from_url(text)
    if key is not None:
        return build_public_url(key)

    if is_external_reference(text):
        return text

    return build_public_url(text.lstrip("/"))
