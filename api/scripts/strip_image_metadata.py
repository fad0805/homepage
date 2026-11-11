"""Remove EXIF/GPS metadata from illustration images that are already stored.

New uploads are sanitized by ``core.uploads.save_banner``. Files uploaded
before that change still carry camera metadata, so this script rewrites them.

Cleaned images are written under a new object key and the database rows are
pointed at it. Overwriting the existing key is not enough: stored objects are
served with ``Cache-Control: public, max-age=31536000, immutable``, so browsers
and CDNs would keep serving the old bytes.

Run it inside the api container:

    python -m scripts.strip_image_metadata                 # report only
    python -m scripts.strip_image_metadata --apply
    python -m scripts.strip_image_metadata --apply --backup-dir /tmp/exif-backup
    python -m scripts.strip_image_metadata --apply --delete-old --backup-dir ...

``--delete-old`` makes the old URLs stop working, which is usually what you
want for sensitive photos. Keep a backup until the site has been checked.
"""

from __future__ import annotations

import argparse
import hashlib
import uuid
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from PIL import Image

from core.config import ENVIRONMENT, S3_ACL, S3_BUCKET
from core.uploads import (
    URL_PREFIX,
    _build_key,
    _build_public_url,
    _get_s3_client,
    _local_path_from_url,
    _sanitize_image,
    _s3_is_configured,
    _s3_key_from_url,
    delete_uploaded_file,
    ensure_upload_dir,
)

FOLDER = "illustrations"
CACHE_CONTROL = "public, max-age=31536000, immutable"

# Signatures that indicate private metadata. EXIF also carries the GPS
# coordinates, which is the most important part to remove.
_METADATA_MARKERS = (
    b"Exif\x00\x00",
    b"http://ns.adobe.com/xap/1.0/",
    b"Photoshop 3.0\x00",
    b"tEXt",
    b"iTXt",
    b"zTXt",
    b"eXIf",
    b"XMP ",
)


def has_private_metadata(content: bytes) -> bool:
    """Return True when the image carries metadata worth stripping."""
    try:
        with Image.open(BytesIO(content)) as image:
            if image.getexif():
                return True
            if getattr(image, "text", None):
                return True
            info = image.info or {}
            for key in (
                "exif",
                "xmp",
                "XML:com.adobe.xmp",
                "comment",
                "photoshop",
            ):
                if info.get(key):
                    return True
    except Exception:
        # Files that cannot be decoded are left alone; the upload endpoint
        # rejects them for new uploads.
        return False

    return any(marker in content for marker in _METADATA_MARKERS)


def _read_stored(url: str) -> bytes | None:
    """Read a file that belongs to this app, or return None."""
    local_path = _local_path_from_url(url)
    if local_path is not None:
        try:
            return local_path.read_bytes()
        except OSError:
            return None

    key = _s3_key_from_url(url)
    if key is None or not _s3_is_configured():
        return None

    try:
        response = _get_s3_client().get_object(
            Bucket=S3_BUCKET,
            Key=key,
        )
    except (BotoCoreError, ClientError):
        return None
    return response["Body"].read()


def _write_stored(content: bytes, content_type: str, extension: str) -> str:
    """Store a cleaned image under a fresh key and return its URL."""
    if _s3_is_configured():
        key = _build_key(FOLDER, extension)
        params: dict[str, object] = {
            "Bucket": S3_BUCKET,
            "Key": key,
            "Body": content,
            "ContentType": content_type,
            "CacheControl": CACHE_CONTROL,
        }
        if S3_ACL:
            params["ACL"] = S3_ACL
        _get_s3_client().put_object(**params)
        return _build_public_url(key)

    if ENVIRONMENT == "production":
        raise RuntimeError("S3 is not configured; refusing to write locally")

    directory = ensure_upload_dir() / FOLDER
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (directory / filename).write_bytes(content)
    return f"{URL_PREFIX}/{FOLDER}/{filename}"


def _backup(backup_dir: Path, url: str, content: bytes) -> Path:
    digest = hashlib.sha256(url.encode()).hexdigest()[:16]
    suffix = Path(urlparse(url).path).suffix or ".bin"
    path = backup_dir / f"{digest}{suffix}"
    path.write_bytes(content)
    return path


def _collect_refs(db):
    """Map each stored URL to the rows that point at it."""
    from models.illustrations import Illustration, IllustrationImage

    refs: dict[str, list[tuple[str, object]]] = {}

    for image in db.query(IllustrationImage).order_by(IllustrationImage.id):
        refs.setdefault(image.url, []).append(("image", image))

    representatives = (
        db.query(Illustration)
        .filter(Illustration.representative_url.isnot(None))
        .order_by(Illustration.id)
    )
    for illustration in representatives:
        refs.setdefault(
            illustration.representative_url,
            [],
        ).append(("representative", illustration))

    return refs


def _apply_new_url(entries, new_url: str) -> None:
    for kind, row in entries:
        if kind == "image":
            row.url = new_url
        else:
            row.representative_url = new_url


def run(args: argparse.Namespace) -> int:
    from db.session import SessionLocal

    dry_run = not args.apply
    stats = {
        "urls": 0,
        "clean": 0,
        "with_metadata": 0,
        "rewritten": 0,
        "deleted": 0,
        "failed": 0,
        "skipped": 0,
    }

    db = SessionLocal()
    try:
        refs = _collect_refs(db)
        stats["urls"] = len(refs)

        processed = 0
        for url, entries in refs.items():
            if args.limit is not None and processed >= args.limit:
                break

            content = _read_stored(url)
            if content is None:
                stats["skipped"] += 1
                print(f"skip (not ours or missing): {url}")
                continue

            if not has_private_metadata(content):
                stats["clean"] += 1
                continue

            stats["with_metadata"] += 1
            processed += 1

            try:
                cleaned, content_type, extension = _sanitize_image(content)
            except HTTPException as error:
                stats["failed"] += 1
                print(f"fail (decode): {url}: {error.detail}")
                continue

            if has_private_metadata(cleaned):
                stats["failed"] += 1
                print(f"fail (metadata remains): {url}")
                continue

            if dry_run:
                print(f"would rewrite: {url}")
                continue

            if args.backup_dir:
                backup_path = _backup(args.backup_dir, url, content)
                print(f"backup: {url} -> {backup_path}")

            try:
                new_url = _write_stored(cleaned, content_type, extension)
                _apply_new_url(entries, new_url)
                db.commit()
            except Exception as error:
                db.rollback()
                stats["failed"] += 1
                print(f"fail (write): {url}: {error}")
                continue

            stats["rewritten"] += 1
            print(f"rewrote: {url} -> {new_url}")

            if args.delete_old:
                delete_uploaded_file(url)
                stats["deleted"] += 1
                print(f"deleted old: {url}")

        print()
        print("summary")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        if dry_run and stats["with_metadata"]:
            print()
            print("No changes were made. Re-run with --apply to rewrite them.")
        if args.delete_old and not dry_run:
            print()
            print(
                "Old objects were deleted. Check the gallery and S3 before "
                "removing the backup."
            )
    finally:
        db.close()

    return 1 if stats["failed"] else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Strip EXIF/GPS metadata from stored illustration images."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write cleaned images and update the database",
    )
    parser.add_argument(
        "--delete-old",
        action="store_true",
        help=(
            "delete the original objects after a successful update; this "
            "makes the old URLs stop working"
        ),
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        help="save the original bytes here before rewriting",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="stop after this many images that need rewriting",
    )
    args = parser.parse_args()

    if args.delete_old and not args.apply:
        parser.error("--delete-old requires --apply")
    if args.delete_old and not args.backup_dir:
        print("warning: --delete-old without --backup-dir is irreversible")
    if args.backup_dir:
        args.backup_dir.mkdir(parents=True, exist_ok=True)

    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
