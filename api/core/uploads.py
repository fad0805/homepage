import logging
import os
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

from core.config import (
    ENVIRONMENT,
    S3_ACCESS_KEY_ID,
    S3_ACL,
    S3_ADDRESSING_STYLE,
    S3_BUCKET,
    S3_ENDPOINT_URL,
    S3_KEY_PREFIX,
    S3_PUBLIC_BASE_URL,
    S3_REGION,
    S3_SECRET_ACCESS_KEY,
)

logger = logging.getLogger(__name__)

# Legacy local storage. New uploads go to S3 when it is configured; the local
# directory is kept so previously uploaded files keep being served.
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))
URL_PREFIX = "/uploads"

ALLOWED_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

# The client-provided content type is only used as a cheap pre-check. The
# extension and MIME type that are actually stored come from the decoded image.
_IMAGE_FORMATS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
    "GIF": ("image/gif", ".gif"),
}

_s3_client: Any = None


def ensure_upload_dir() -> Path:
    """Create the legacy local upload directory if it does not exist yet."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


def _s3_is_configured() -> bool:
    return bool(S3_BUCKET and S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY)


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        config_kwargs: dict[str, Any] = {"signature_version": "s3v4"}
        if S3_ADDRESSING_STYLE:
            config_kwargs["s3"] = {"addressing_style": S3_ADDRESSING_STYLE}

        _s3_client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT_URL or None,
            region_name=S3_REGION,
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
            config=BotoConfig(**config_kwargs),
        )
    return _s3_client


def _build_key(folder: str, extension: str) -> str:
    parts = [
        part
        for part in (S3_KEY_PREFIX.strip("/"), folder.strip("/"))
        if part
    ]
    parts.append(f"{uuid.uuid4().hex}{extension}")
    return "/".join(parts)


def _build_public_url(key: str) -> str:
    if S3_PUBLIC_BASE_URL:
        return f"{S3_PUBLIC_BASE_URL.rstrip('/')}/{key}"
    if S3_ENDPOINT_URL:
        return f"{S3_ENDPOINT_URL.rstrip('/')}/{S3_BUCKET}/{key}"
    return f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"


def _s3_key_from_url(url: str) -> str | None:
    """Return the object key if ``url`` points at an object we uploaded."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None

    normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    bases: list[str] = []
    if S3_PUBLIC_BASE_URL:
        bases.append(S3_PUBLIC_BASE_URL.rstrip("/"))
    if S3_ENDPOINT_URL:
        bases.append(f"{S3_ENDPOINT_URL.rstrip('/')}/{S3_BUCKET}")
    bases.append(f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com")

    for base in bases:
        if normalized.startswith(f"{base}/"):
            return unquote(normalized[len(base) + 1 :])
    return None


def _local_path_from_url(url: str) -> Path | None:
    """Return the local upload path if ``url`` points at the legacy store."""
    path = urlparse(url).path if url.startswith(("http://", "https://")) else url
    prefix = f"{URL_PREFIX}/"
    if not path.startswith(prefix):
        return None

    root = UPLOAD_DIR.resolve()
    candidate = (root / unquote(path[len(prefix) :])).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        # Reject paths that escape the upload directory.
        return None
    return candidate


def _storage_identity(url: str | None) -> tuple[str, str] | None:
    """Identify a stored object so two URLs can be compared."""
    if not url:
        return None

    local_path = _local_path_from_url(url)
    if local_path is not None:
        return ("local", str(local_path))

    key = _s3_key_from_url(url)
    if key is not None:
        return ("s3", key)
    return None


def delete_uploaded_file(url: str | None) -> None:
    """Delete a file previously stored by :func:`save_banner`.

    External URLs and files managed by someone else are ignored. Failures are
    logged but never raised, because storage cleanup must not break the
    database operation that triggered it.
    """
    if not url:
        return

    local_path = _local_path_from_url(url)
    if local_path is not None:
        try:
            local_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to delete local upload: %s", url, exc_info=True)
        return

    key = _s3_key_from_url(url)
    if key is None or not _s3_is_configured():
        return

    try:
        _get_s3_client().delete_object(Bucket=S3_BUCKET, Key=key)
    except (BotoCoreError, ClientError):
        logger.warning("Failed to delete S3 object: %s", key, exc_info=True)


def delete_replaced_upload(
    old_url: str | None,
    new_url: str | None,
) -> None:
    """Delete ``old_url`` when it is no longer referenced by ``new_url``."""
    if not old_url or old_url == new_url:
        return

    old_identity = _storage_identity(old_url)
    if old_identity is not None and old_identity == _storage_identity(new_url):
        return

    delete_uploaded_file(old_url)


def _save_to_s3(
    content: bytes,
    content_type: str,
    extension: str,
    folder: str,
) -> str:
    key = _build_key(folder, extension)
    put_kwargs: dict[str, Any] = {
        "Bucket": S3_BUCKET,
        "Key": key,
        "Body": content,
        "ContentType": content_type,
        "CacheControl": "public, max-age=31536000, immutable",
    }
    if S3_ACL:
        put_kwargs["ACL"] = S3_ACL

    try:
        _get_s3_client().put_object(**put_kwargs)
    except (BotoCoreError, ClientError):
        logger.exception("Failed to upload image to S3")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="이미지를 업로드하지 못했습니다.",
        )

    return _build_public_url(key)


def _save_to_local(content: bytes, extension: str, folder: str) -> str:
    """Development fallback when S3 is not configured."""
    directory = ensure_upload_dir()
    subdir = directory / folder.strip("/") if folder.strip("/") else directory
    subdir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{extension}"
    destination = subdir / filename
    try:
        destination.write_bytes(content)
    except OSError:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="이미지를 저장하지 못했습니다.",
        )

    folder_path = folder.strip("/")
    if folder_path:
        return f"{URL_PREFIX}/{folder_path}/{filename}"
    return f"{URL_PREFIX}/{filename}"


async def _read_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"이미지 크기는 {MAX_UPLOAD_SIZE // (1024 * 1024)}MB 이하여야 "
                "합니다."
            ),
        )
    return content


def _sanitize_image(content: bytes) -> tuple[bytes, str, str]:
    """Re-encode an image so it no longer carries private metadata.

    Phone and camera uploads embed GPS coordinates, device identifiers and
    capture timestamps in EXIF. Those must not be published, so the image is
    decoded and written again without its metadata. Orientation is applied
    first; otherwise stripping EXIF would leave rotated photos sideways.

    The returned MIME type and extension are derived from the decoded format
    instead of trusting the client, which also rejects files that merely claim
    to be images.
    """
    try:
        with Image.open(BytesIO(content)) as image:
            image.load()
            image_format = image.format
            if image_format not in _IMAGE_FORMATS:
                raise ValueError(f"Unsupported image format: {image_format}")

            content_type, extension = _IMAGE_FORMATS[image_format]
            icc_profile = image.info.get("icc_profile")
            save_kwargs: dict[str, Any] = {}
            if icc_profile and image_format in {"JPEG", "PNG", "WEBP"}:
                # Keep the colour profile: it is not personal data, and dropping
                # it would shift colours on wide-gamut photos.
                save_kwargs["icc_profile"] = icc_profile

            if getattr(image, "is_animated", False):
                # Animated files rarely carry useful EXIF; re-encode them as-is
                # so frame count, loop and duration survive.
                output = BytesIO()
                image.save(
                    output,
                    format=image_format,
                    save_all=True,
                    **save_kwargs,
                )
                return output.getvalue(), content_type, extension

            cleaned = ImageOps.exif_transpose(image)

            if image_format == "JPEG":
                if cleaned.mode not in ("RGB", "L", "CMYK"):
                    cleaned = cleaned.convert("RGB")
                save_kwargs.update(quality=95, optimize=True)
            elif image_format == "WEBP":
                save_kwargs.update(quality=95, method=4)
            elif image_format == "PNG":
                save_kwargs.update(optimize=True)

            output = BytesIO()
            cleaned.save(output, format=image_format, **save_kwargs)
            return output.getvalue(), content_type, extension
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Rejected an image that could not be decoded: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="이미지 파일을 읽을 수 없습니다.",
        ) from exc


async def save_banner(file: UploadFile, folder: str = "banners") -> str:
    """Upload a banner or thumbnail image and return its public URL."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="PNG, JPEG, WEBP, GIF 이미지만 업로드할 수 있습니다.",
        )

    try:
        content = await _read_upload(file)
    finally:
        await file.close()

    content, content_type, extension = _sanitize_image(content)

    if _s3_is_configured():
        return _save_to_s3(content, content_type, extension, folder)

    if ENVIRONMENT == "production":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3 설정이 누락되었습니다.",
        )

    return _save_to_local(content, extension, folder)
