"""Helpers for keeping stored image references independent of the CDN host.

Only the object path (for example ``images/characters/abc.jpg``) belongs in the
database. ``S3_PUBLIC_BASE_URL`` is applied when a value is read, so changing
the public host does not require rewriting every row. Without object storage,
the same key is served from the local ``/uploads`` mount in any environment.
"""

import os
from urllib.parse import unquote, urlparse

_S3_PUBLIC_BASE_URL = os.getenv("S3_PUBLIC_BASE_URL")
_S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
_S3_BUCKET = os.getenv("S3_BUCKET")
_S3_REGION = os.getenv("S3_REGION") or "ap-northeast-2"
_S3_KEY_PREFIX = (os.getenv("S3_KEY_PREFIX") or "images").strip("/")

_EXTERNAL_PREFIXES = ("http://", "https://", "//", "data:", "blob:")


def _has_object_storage() -> bool:
    return bool(_S3_PUBLIC_BASE_URL or _S3_BUCKET)


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


def _strip_key_prefix(key: str) -> str:
    prefix = _S3_KEY_PREFIX
    if prefix and key.startswith(f"{prefix}/"):
        return key[len(prefix) + 1 :]
    return key


def _with_key_prefix(key: str) -> str:
    prefix = _S3_KEY_PREFIX
    if prefix and key and not key.startswith(f"{prefix}/"):
        return f"{prefix}/{key}"
    return key


def _local_public_url(key: str) -> str:
    # The bucket's key prefix is not part of the local uploads directory.
    return f"/uploads/{_strip_key_prefix(key).lstrip('/')}"


def _local_storage_key(value: str) -> str | None:
    prefix = "/uploads/"
    if not value.startswith(prefix):
        return None
    key = unquote(value[len(prefix) :]).lstrip("/")
    return key or None


def build_public_url(reference: str) -> str:
    """Return the public URL for an object key."""
    if _S3_PUBLIC_BASE_URL:
        base = _S3_PUBLIC_BASE_URL.rstrip("/")
    elif _S3_ENDPOINT_URL and _S3_BUCKET:
        base = f"{_S3_ENDPOINT_URL.rstrip('/')}/{_S3_BUCKET}"
    elif _S3_BUCKET:
        base = f"https://{_S3_BUCKET}.s3.{_S3_REGION}.amazonaws.com"
    else:
        # ``_save_to_s3`` only calls this after checking configuration. Keep
        # the reference intact if the helper is used directly without it.
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

    External URLs are kept as-is. Object-storage URLs are reduced to their
    key. Without object storage, ``/uploads/...`` URLs are normalized to the
    same relative key so the database representation stays consistent.
    """
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    key = s3_key_from_url(text)
    if key is not None:
        return key

    # Local storage uses the same relative object path as S3. Old
    # ``/uploads/...`` rows are normalized when they are written again.
    if not _has_object_storage():
        local_key = _local_storage_key(text)
        if local_key is not None:
            return _with_key_prefix(local_key)

    if is_external_reference(text):
        return text

    return text.lstrip("/")


def public_url(value: str | None) -> str | None:
    """Return the public URL for a stored image reference.

    Object keys use ``S3_PUBLIC_BASE_URL`` when configured. Without object
    storage, the same key is served under ``/uploads/`` in every environment.
    """
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    key = s3_key_from_url(text)
    if key is not None:
        if not _has_object_storage():
            return _local_public_url(key)
        return build_public_url(key)

    if is_external_reference(text):
        return text

    key = text.lstrip("/")
    if not _has_object_storage():
        return _local_public_url(key)
    return build_public_url(key)
