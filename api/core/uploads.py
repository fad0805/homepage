import logging
import mimetypes
import os
import shutil
import subprocess
import tempfile
import uuid
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

from core.config import (
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
from core.image_urls import is_external_reference, s3_key_from_url

logger = logging.getLogger(__name__)

# Local storage is used when S3 is not configured, including production
# deployments without object storage. Files are served from ``/uploads``.
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

# Short clips uploaded as illustrations are transcoded to animated WebP.
# Longer clips are truncated to the first N seconds instead of rejected.
VIDEO_CONTENT_TYPES = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-m4v": ".m4v",
}
MAX_VIDEO_SECONDS = max(1, int(os.getenv("MAX_VIDEO_SECONDS", "10")))
VIDEO_FPS = max(1, int(os.getenv("VIDEO_FPS", "12")))
VIDEO_MAX_EDGE = max(2, int(os.getenv("VIDEO_MAX_EDGE", "640")))

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


def _build_key(folder: str, extension: str, name: str | None = None) -> str:
    parts = [
        part
        for part in (S3_KEY_PREFIX.strip("/"), folder.strip("/"))
        if part
    ]
    filename = (name or "").strip("/\\") or uuid.uuid4().hex
    parts.append(f"{filename}{extension}")
    return "/".join(parts)


def _local_path_from_url(url: str) -> Path | None:
    """Return the local upload path if ``url`` points at the legacy store."""
    # Local uploads are stored as relative URLs (``/uploads/...``). Do not
    # treat an arbitrary external URL with the same path as a local file.
    if url.startswith(("http://", "https://")):
        return None

    path = url
    prefix = f"{URL_PREFIX}/"
    if not path.startswith(prefix):
        return None

    return _local_path_from_key(path[len(prefix) :])


def _local_key_from_storage_key(key: str) -> str:
    """Map an S3 object key to its path below the local uploads root."""
    value = key.lstrip("/")
    prefix = S3_KEY_PREFIX.strip("/")
    if prefix and value.startswith(f"{prefix}/"):
        return value[len(prefix) + 1 :]
    return value


def _local_path_from_key(key: str | None) -> Path | None:
    """Return the local path for an object key without leaving the root."""
    if not key or is_external_reference(key):
        return None

    root = UPLOAD_DIR.resolve()
    candidate = (root / unquote(key.lstrip("/"))).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        # Reject paths that escape the upload directory.
        return None
    return candidate


def _local_path_from_reference(url: str | None) -> Path | None:
    """Resolve both legacy URLs and relative object keys to a local path."""
    if not url:
        return None

    local_path = _local_path_from_url(url)
    if local_path is not None:
        return local_path

    # Relative keys belong to local storage only while S3 is not configured.
    if _s3_is_configured():
        return None
    return _local_path_from_key(_local_key_from_storage_key(url))


def _storage_identity(url: str | None) -> tuple[str, str] | None:
    """Identify a stored object so two references can be compared."""
    if not url:
        return None

    local_path = _local_path_from_reference(url)
    if local_path is not None:
        return ("local", str(local_path))

    key = s3_key_from_url(url)
    if key is not None:
        return ("s3", key)

    if not is_external_reference(url) and _s3_is_configured():
        return ("s3", url.lstrip("/"))
    return None


def get_upload_source(url: str | None) -> tuple[str, str] | None:
    """Return ``(storage, reference)`` for a file stored by this app.

    ``storage`` is ``"local"`` or ``"s3"``; ``reference`` is an absolute path
    or an S3 object key. External URLs return ``None``.
    """
    return _storage_identity(url)


@contextmanager
def open_uploaded_file(url: str):
    """Yield ``(file, content_type, size)`` for a stored upload.

    Raises ``FileNotFoundError`` when the URL is external or the object is not
    available. The caller is responsible for reading the file-like object
    before leaving the context.
    """
    source = _storage_identity(url)
    if source is None:
        raise FileNotFoundError(url)

    kind, reference = source

    if kind == "local":
        path = Path(reference)
        with path.open("rb") as handle:
            content_type = mimetypes.guess_type(path.name)[0]
            yield handle, content_type, path.stat().st_size
        return

    if not _s3_is_configured():
        raise FileNotFoundError(url)

    response = _get_s3_client().get_object(
        Bucket=S3_BUCKET,
        Key=reference,
    )
    body = response["Body"]
    try:
        yield body, response.get("ContentType"), response.get("ContentLength")
    finally:
        body.close()


def delete_uploaded_file(url: str | None) -> None:
    """Delete a file previously stored by :func:`save_banner`.

    External URLs and files managed by someone else are ignored. Failures are
    logged but never raised, because storage cleanup must not break the
    database operation that triggered it.
    """
    if not url:
        return

    identity = _storage_identity(url)
    if identity is None:
        return

    kind, reference = identity
    if kind == "local":
        try:
            Path(reference).unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "Failed to delete local upload: %s", url, exc_info=True
            )
        return

    if not _s3_is_configured():
        return

    try:
        _get_s3_client().delete_object(Bucket=S3_BUCKET, Key=reference)
    except (BotoCoreError, ClientError):
        logger.warning(
            "Failed to delete S3 object: %s", reference, exc_info=True
        )


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
    name: str | None = None,
) -> str:
    key = _build_key(folder, extension, name)
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

    return key


def _save_to_local(
    content: bytes,
    extension: str,
    folder: str,
    name: str | None = None,
) -> str:
    """Local fallback when S3 is not configured.

    The bucket's key prefix (for example ``images``) is omitted locally, so
    the file lives directly under ``uploads/<folder>/``. The returned key
    still includes the prefix for a consistent database representation.
    """
    key = _build_key(folder, extension, name)
    destination = ensure_upload_dir() / _local_key_from_storage_key(key)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        destination.write_bytes(content)
    except OSError:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="이미지를 저장하지 못했습니다.",
        )

    return key


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


def _video_to_animated_webp(content: bytes, suffix: str) -> bytes:
    """Render the first seconds of a clip as an animated WebP image."""
    if shutil.which("ffmpeg") is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="영상 변환 기능을 사용할 수 없습니다.",
        )

    max_frames = MAX_VIDEO_SECONDS * VIDEO_FPS
    scale = f"scale=w='min({VIDEO_MAX_EDGE},iw)':h=-2"
    with tempfile.TemporaryDirectory(prefix="illustration-video-") as tmp:
        directory = Path(tmp)
        source = directory / f"source{suffix}"
        source.write_bytes(content)
        pattern = directory / "frame_%05d.png"
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-t",
            str(MAX_VIDEO_SECONDS),
            "-vf",
            f"fps={VIDEO_FPS},{scale}",
            "-frames:v",
            str(max_frames),
            str(pattern),
        ]
        try:
            result = subprocess.run(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=120,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="영상의 웹피 변환이 너무 오래 걸렸습니다.",
            ) from exc
        if result.returncode != 0:
            logger.warning(
                "Rejected a video that ffmpeg could not decode: %s",
                result.stderr.decode("utf-8", "replace")[-500:],
            )
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="영상 파일을 읽을 수 없습니다.",
            )

        frames: list[Any] = []
        for path in sorted(directory.glob("frame_*.png")):
            with Image.open(path) as frame:
                frames.append(frame.convert("RGB"))
        if not frames:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="영상에서 재생할 프레임을 찾지 못했습니다.",
            )

        output = BytesIO()
        frames[0].save(
            output,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=max(1, round(1000 / VIDEO_FPS)),
            loop=0,
            quality=80,
            method=4,
        )
        return output.getvalue()


def save_image_bytes(
    content: bytes,
    folder: str = "chapters",
    name: str | None = None,
) -> str:
    """Store an image that already exists in memory.

    Used by importers that extract images from a document archive.
    """
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지 데이터가 비어 있습니다.",
        )
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"이미지 크기는 {MAX_UPLOAD_SIZE // (1024 * 1024)}MB 이하여야 "
                "합니다."
            ),
        )
    content, content_type, extension = _sanitize_image(content)
    if _s3_is_configured():
        return _save_to_s3(content, content_type, extension, folder, name)
    if S3_BUCKET or S3_PUBLIC_BASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3 설정이 불완전합니다.",
        )
    return _save_to_local(content, extension, folder, name)


async def save_banner(
    file: UploadFile,
    folder: str = "banners",
    name: str | None = None,
    *,
    allow_video: bool = False,
) -> str:
    """Upload an image and return its storage key.

    Database models persist this relative key through their ``ImageUrl`` type.
    Callers that return the image to a browser should pass it through
    :func:`core.image_urls.public_url` first.

    Illustration uploads may also send a short video. It is stored as an
    animated WebP (truncated to ``MAX_VIDEO_SECONDS``) so every consumer can
    keep using the existing image URLs.
    """
    video_suffix = VIDEO_CONTENT_TYPES.get(file.content_type or "")
    if video_suffix and not allow_video:
        video_suffix = None
    if video_suffix:
        allowed = True
    else:
        allowed = file.content_type in ALLOWED_CONTENT_TYPES

    if not allowed:
        detail = "PNG, JPEG, WEBP, GIF 이미지만 업로드할 수 있습니다."
        if allow_video:
            detail = "PNG, JPEG, WEBP, GIF 이미지 또는 MP4, MOV, WEBM 영상만 업로드할 수 있습니다."
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=detail,
        )

    try:
        content = await _read_upload(file)
    finally:
        await file.close()

    if video_suffix:
        content, content_type, extension = (
            _video_to_animated_webp(content, video_suffix),
            "image/webp",
            ".webp",
        )
    else:
        content, content_type, extension = _sanitize_image(content)

    if _s3_is_configured():
        return _save_to_s3(content, content_type, extension, folder, name)

    # Partial S3 configuration is a deployment error. If no S3 settings are
    # present at all, local storage is used in every environment.
    if S3_BUCKET or S3_PUBLIC_BASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3 설정이 불완전합니다.",
        )

    return _save_to_local(content, extension, folder, name)
