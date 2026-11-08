import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 5 * 1024 * 1024))
URL_PREFIX = "/uploads"

ALLOWED_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def ensure_upload_dir() -> Path:
    """Create the upload directory if it does not exist yet."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


async def save_banner(file: UploadFile) -> str:
    """Save an uploaded banner image and return its public URL."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="PNG, JPEG, WEBP, GIF 이미지만 업로드할 수 있습니다.",
        )

    directory = ensure_upload_dir()
    filename = f"{uuid.uuid4().hex}{ALLOWED_CONTENT_TYPES[file.content_type]}"
    destination = directory / filename
    size = 0

    try:
        with destination.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"이미지 크기는 {MAX_UPLOAD_SIZE // (1024 * 1024)}MB 이하여야 합니다.",
                    )
                buffer.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except OSError:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="이미지를 저장하지 못했습니다.",
        )
    finally:
        await file.close()

    return f"{URL_PREFIX}/{filename}"
