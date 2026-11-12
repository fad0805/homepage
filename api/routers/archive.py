"""Database-independent export of the site's creative records.

This is deliberately not a database dump. Records keep stable IDs and
relationships in JSON, and original images are stored next to the data. That
makes the archive portable to another database or framework.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import mimetypes
import queue
import re
import shutil
import tempfile
import threading
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.uploads import get_upload_source, open_uploaded_file
from db.session import get_db
from models.books import Book, BookCategory
from models.characters import Character, CharacterRelationship, Doll, Location
from models.illustrations import Illustration
from models.links import Category as LinkCategory
from models.links import Link
from models.memos import Memo
from models.profiles import Profile

from .utils import require_auth

logger = logging.getLogger("uvicorn.error")

router = APIRouter()

ARCHIVE_FORMAT = "missing-island-archive"
SCHEMA_VERSION = "1.0"
SITE_NAME = "어디에도 없는 섬"
SITE_DESCRIPTION = "한 소녀가 있었다."

CHUNK_SIZE = 1024 * 1024
QUEUE_CHUNK_SIZE = 256 * 1024
SPOOL_MAX_MEMORY = 16 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

CONTENT_KEYS = [
    "book_categories",
    "books",
    "illustrations",
    "characters",
    "character_relationships",
    "locations",
    "dolls",
    "links",
    "link_categories",
    "profiles",
    "memos",
]

SECTION_LABELS = {
    "all": "전체",
    "profile": "프로필",
    "characters": "등장인물",
    "books": "목차",
    "illustrations": "삽화",
    "links": "놀러가기",
    "memos": "주석",
}


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _extension_from_url(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in ALLOWED_IMAGE_EXTENSIONS:
        return suffix
    return ".bin"


def _file_stem(original_name: str | None, identifier: str) -> str:
    raw = Path(original_name or "").name
    suffix = Path(raw).suffix
    if suffix:
        raw = raw[: -len(suffix)]

    cleaned = re.sub(r"[^\w.\-]+", "-", raw).strip("._-")
    if not cleaned:
        return identifier
    return f"{identifier}-{cleaned[:60]}"


def _storage_kind(url: str | None) -> str | None:
    if not url:
        return None
    source = get_upload_source(url)
    return source[0] if source else "external"


class _ArchivePlan:
    """Collect the image files that should accompany the JSON data."""

    def __init__(self) -> None:
        self.files: list[dict[str, Any]] = []
        self.by_url: dict[str, dict[str, Any]] = {}
        self.used_paths: set[str] = set()
        self.skipped: list[dict[str, str]] = []

    def register(
        self,
        url: str | None,
        directory: str,
        identifier: str,
        original_name: str | None = None,
    ) -> str | None:
        """Return an archive path for a stored image, or ``None``.

        External URLs and files we do not own are intentionally not
        downloaded; their original URL is still kept in ``data.json``.
        """
        if not url:
            return None

        existing = self.by_url.get(url)
        if existing is not None:
            return existing["path"]

        source = get_upload_source(url)
        if source is None:
            return None

        extension = _extension_from_url(url)
        stem = _file_stem(original_name, identifier)
        path = f"images/{directory}/{stem}{extension}"

        counter = 2
        while path in self.used_paths:
            path = f"images/{directory}/{stem}-{counter}{extension}"
            counter += 1

        self.used_paths.add(path)
        descriptor = {
            "path": path,
            "url": url,
            "storage": source[0],
        }
        self.files.append(descriptor)
        self.by_url[url] = descriptor
        return path


def _book_data(
    db: Session,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    book_categories = [
        {
            "id": category.id,
            "name": category.name,
            "order": category.order,
        }
        for category in (
            db.query(BookCategory)
            .order_by(BookCategory.order, BookCategory.id)
            .all()
        )
    ]

    books = []
    for book in db.query(Book).order_by(Book.order, Book.id).all():
        chapters = [
            {
                "id": chapter.id,
                "book_id": chapter.book_id,
                "title": chapter.title,
                "subtitle": chapter.subtitle,
                "body": chapter.body,
                "tags": chapter.tags or [],
                "order": chapter.order,
                "visible": chapter.visible,
                "protected": chapter.protected,
                "view_count": chapter.view_count,
                "published_at": _iso(chapter.published_at),
                "created_at": _iso(chapter.created_at),
                "updated_at": _iso(chapter.updated_at),
            }
            for chapter in book.chapters
        ]

        books.append(
            {
                "id": book.id,
                "title": book.title,
                "description": book.description,
                "tags": book.tags or [],
                "category_id": book.category_id,
                "order": book.order,
                "visible": book.visible,
                "protected": book.protected,
                "created_at": _iso(book.created_at),
                "updated_at": _iso(book.updated_at),
                "chapters": chapters,
            }
        )

    return book_categories, books


def _illustration_data(
    db: Session,
    plan: _ArchivePlan,
) -> list[dict[str, Any]]:
    illustrations = []
    for illustration in (
        db.query(Illustration)
        .order_by(Illustration.order, Illustration.id)
        .all()
    ):
        images = []
        for image in illustration.images:
            images.append(
                {
                    "id": image.id,
                    "url": image.url,
                    "original_name": image.original_name,
                    "order": image.order,
                    "storage": _storage_kind(image.url),
                    "archive_path": plan.register(
                        image.url,
                        "illustrations",
                        str(image.id),
                        image.original_name,
                    ),
                }
            )

        representative_path = plan.register(
            illustration.representative_url,
            "illustrations",
            f"{illustration.id}-representative",
            illustration.representative_original_name,
        )

        if representative_path is None and illustration.representative_image_id:
            matching_image = next(
                (
                    image
                    for image in illustration.images
                    if image.id == illustration.representative_image_id
                ),
                None,
            )
            if matching_image is not None:
                descriptor = plan.by_url.get(matching_image.url)
                if descriptor is not None:
                    representative_path = descriptor["path"]

        illustrations.append(
            {
                "id": illustration.id,
                "owner": illustration.owner,
                "title": illustration.title,
                "description": illustration.description,
                "tags": illustration.tags or [],
                "taken_at": _iso(illustration.taken_at),
                "representative_image_id": illustration.representative_image_id,
                "representative_url": illustration.representative_url,
                "representative_original_name": (
                    illustration.representative_original_name
                ),
                "representative_archive_path": representative_path,
                "order": illustration.order,
                "visible": illustration.visible,
                "protected": illustration.protected,
                "created_at": _iso(illustration.created_at),
                "updated_at": _iso(illustration.updated_at),
                "images": images,
            }
        )

    return illustrations


def _character_data(
    db: Session,
    plan: _ArchivePlan,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    characters = []
    for character in db.query(Character).order_by(Character.id).all():
        characters.append(
            {
                "id": character.id,
                "name": character.name,
                "alt_name": character.alt_name,
                "nickname": character.nickname,
                "location_id": character.location_id,
                "head": character.head,
                "body": character.body,
                "comming_day": _iso(character.comming_day),
                "age": character.age,
                "serif": character.serif,
                "description": character.description,
                "visible": character.visible,
                "is_my_doll": character.is_my_doll,
                "order_in_location": character.order_in_location,
                "layout": character.layout,
                "created_at": _iso(character.created_at),
                "updated_at": _iso(character.updated_at),
                "thumbnail_url": character.thumbnail,
                "thumbnail_archive_path": plan.register(
                    character.thumbnail,
                    "characters",
                    f"{character.id}-thumbnail",
                ),
                "detail_image_url": character.detail_image,
                "detail_image_archive_path": plan.register(
                    character.detail_image,
                    "characters",
                    f"{character.id}-detail",
                ),
            }
        )

    character_relationships = [
        {
            "id": relationship.id,
            "character_id": relationship.character_id,
            "related_character_id": relationship.related_character_id,
            "relationship_type": relationship.relationship_type,
            "established": _iso(relationship.established),
        }
        for relationship in (
            db.query(CharacterRelationship)
            .order_by(CharacterRelationship.id)
            .all()
        )
    ]

    locations = [
        {
            "id": location.id,
            "name": location.name,
            "description": location.description,
            "order": location.order,
        }
        for location in (
            db.query(Location)
            .order_by(Location.order, Location.id)
            .all()
        )
    ]

    dolls = [
        {
            "id": doll.id,
            "company": doll.company,
            "name": doll.name,
            "size": doll.size,
            "skin_tone": doll.skin_tone,
        }
        for doll in db.query(Doll).order_by(Doll.id).all()
    ]

    return characters, character_relationships, locations, dolls


def _link_data(
    db: Session,
    plan: _ArchivePlan,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    links = []
    for link in db.query(Link).order_by(Link.order, Link.id).all():
        links.append(
            {
                "id": link.id,
                "owner": link.owner,
                "name": link.name,
                "url": link.url,
                "banner_url": link.banner_url,
                "banner_archive_path": plan.register(
                    link.banner_url,
                    "links",
                    f"{link.id}-banner",
                ),
                "category_id": link.category,
                "description": link.description,
                "order": link.order,
                "created_at": _iso(link.created_at),
                "updated_at": _iso(link.updated_at),
            }
        )

    link_categories = [
        {
            "id": category.id,
            "name": category.name,
            "order": category.order,
        }
        for category in (
            db.query(LinkCategory)
            .order_by(LinkCategory.order, LinkCategory.id)
            .all()
        )
    ]

    return links, link_categories


def _profile_data(db: Session) -> list[dict[str, Any]]:
    return [
        {
            "id": profile.id,
            "title": profile.title,
            "subtitle": profile.subtitle,
            "profile": profile.profile,
            "created_at": _iso(profile.created_at),
            "updated_at": _iso(profile.updated_at),
        }
        for profile in db.query(Profile).order_by(Profile.id).all()
    ]


def _memo_data(db: Session) -> list[dict[str, Any]]:
    return [
        {
            "id": memo.id,
            "owner": memo.owner,
            "content": memo.content,
            "pinned": memo.pinned,
            "expires_at": _iso(memo.expires_at),
            "created_at": _iso(memo.created_at),
            "updated_at": _iso(memo.updated_at),
        }
        for memo in db.query(Memo).order_by(Memo.id).all()
    ]


def _build_export(
    db: Session,
    section: str,
) -> tuple[dict[str, Any], _ArchivePlan]:
    plan = _ArchivePlan()
    data: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "site": {
            "name": SITE_NAME,
            "description": SITE_DESCRIPTION,
        },
    }

    if section in ("all", "books"):
        book_categories, books = _book_data(db)
        data["book_categories"] = book_categories
        data["books"] = books

    if section in ("all", "illustrations"):
        data["illustrations"] = _illustration_data(db, plan)

    if section in ("all", "characters"):
        (
            characters,
            character_relationships,
            locations,
            dolls,
        ) = _character_data(db, plan)
        data["characters"] = characters
        data["character_relationships"] = character_relationships
        data["locations"] = locations
        data["dolls"] = dolls

    if section in ("all", "links"):
        links, link_categories = _link_data(db, plan)
        data["links"] = links
        data["link_categories"] = link_categories

    if section in ("all", "profile"):
        data["profiles"] = _profile_data(db)

    if section in ("all", "memos"):
        data["memos"] = _memo_data(db)

    return data, plan


def _prune_missing_paths(
    data: dict[str, Any],
    completed_paths: set[str],
) -> None:
    """Clear references to images that could not be added to the ZIP."""

    def keep(path: str | None) -> str | None:
        if path and path in completed_paths:
            return path
        return None

    for illustration in data.get("illustrations", []):
        for image in illustration["images"]:
            image["archive_path"] = keep(image.get("archive_path"))
        illustration["representative_archive_path"] = keep(
            illustration.get("representative_archive_path")
        )

    for character in data.get("characters", []):
        character["thumbnail_archive_path"] = keep(
            character.get("thumbnail_archive_path")
        )
        character["detail_image_archive_path"] = keep(
            character.get("detail_image_archive_path")
        )

    for link in data.get("links", []):
        link["banner_archive_path"] = keep(link.get("banner_archive_path"))


def _counts(
    data: dict[str, Any],
    completed_files: list[dict[str, Any]],
) -> dict[str, int]:
    counts: dict[str, int] = {}

    if "book_categories" in data:
        counts["book_categories"] = len(data["book_categories"])
    if "books" in data:
        counts["books"] = len(data["books"])
        counts["chapters"] = sum(
            len(book["chapters"]) for book in data["books"]
        )
    if "illustrations" in data:
        counts["illustrations"] = len(data["illustrations"])
        counts["illustration_images"] = sum(
            len(illustration["images"])
            for illustration in data["illustrations"]
        )
    if "characters" in data:
        counts["characters"] = len(data["characters"])
    if "character_relationships" in data:
        counts["character_relationships"] = len(
            data["character_relationships"]
        )
    if "locations" in data:
        counts["locations"] = len(data["locations"])
    if "dolls" in data:
        counts["dolls"] = len(data["dolls"])
    if "links" in data:
        counts["links"] = len(data["links"])
    if "link_categories" in data:
        counts["link_categories"] = len(data["link_categories"])
    if "profiles" in data:
        counts["profiles"] = len(data["profiles"])
    if "memos" in data:
        counts["memos"] = len(data["memos"])

    counts["files"] = len(completed_files)
    counts["file_bytes"] = sum(
        int(descriptor.get("size") or 0)
        for descriptor in completed_files
    )
    return counts


def _build_manifest(
    data: dict[str, Any],
    plan: _ArchivePlan,
    generated_at: datetime,
    section: str,
) -> dict[str, Any]:
    completed_files = [
        descriptor
        for descriptor in plan.files
        if descriptor.get("sha256") is not None
    ]

    return {
        "format": ARCHIVE_FORMAT,
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at.isoformat(),
        "site": data["site"],
        "selection": {
            "key": section,
            "label": SECTION_LABELS[section],
            "included": [
                key for key in CONTENT_KEYS if key in data
            ],
            "not_included": [
                key for key in CONTENT_KEYS if key not in data
            ],
        },
        "counts": _counts(data, completed_files),
        "files": [
            {
                "path": descriptor["path"],
                "source_url": descriptor["url"],
                "storage": descriptor["storage"],
                "content_type": descriptor.get("content_type"),
                "size": descriptor.get("size"),
                "sha256": descriptor.get("sha256"),
            }
            for descriptor in completed_files
        ],
        "skipped_files": plan.skipped,
        "excluded": [
            "users",
            "user_sessions",
            "user_signin_history",
            "site_visits",
            "chapter_views",
            "chapter_drafts",
            "gallery_invites",
            "gallery_sessions",
            "gallery_session_grants",
            "mastodon_settings",
        ],
    }


def _readme(generated_at: datetime, section: str) -> str:
    label = SECTION_LABELS[section]
    includes_images = section in (
        "all",
        "illustrations",
        "characters",
        "links",
    )
    partial_note = (
        ""
        if section == "all"
        else (
            "이 파일은 전체 백업이 아닙니다. 선택한 범위 밖의 기록은 "
            "포함되지 않습니다.\n\n"
        )
    )
    images_line = (
        "- `images/` — 원본 이미지. `data.json`의 `archive_path`와 "
        "대응합니다. 이미지가 없는 범위에서는 폴더가 없을 수 있습니다.\n"
        if includes_images
        else ""
    )

    return f"""# 어디에도 없는 섬 · 아카이브 v{SCHEMA_VERSION} · {label}

이 ZIP은 Missing Island의 **{label}** 범위 기록을 특정 데이터베이스
구조와 무관한 형식으로 보존한 아카이브입니다. 생성 시각:
{generated_at.isoformat()}

{partial_note}## 구성

- `manifest.json` — 규격 버전, 선택 범위, 생성 시각, 파일 목록(SHA-256)
- `data.json` — 선택한 범위의 기록
{images_line}
## 규칙

- 모든 `id`는 이 아카이브 안에서 원본 DB의 ID를 유지합니다.
- 이미지의 원본 URL은 `source_url`(또는 각 레코드의 `url`)에, ZIP 안의
  파일 경로는 `archive_path`에 기록됩니다.
- S3/로컬 저장소에서 찾지 못한 이미지는 `manifest.json`의
  `skipped_files`에 기록되고 `archive_path`는 `null`이 됩니다.
- 외부 URL 이미지(예: 링크 배너)는 다운로드하지 않고 URL만 보존합니다.
- `users`, 세션, 방문 기록, 갤러리 초대·세션, Mastodon 설정·토큰,
  임시저장(`chapter_drafts`), 조회 기록은 포함하지 않습니다.
- 이 아카이브에는 비공개 글·삽화와 주석이 포함될 수 있으므로 안전하게
  보관하세요.

## 복원·이관

1. `data.json`의 관계(`book_id`, `character_id`, `archive_path`)를 읽어
   새 스키마에 매핑합니다.
2. 이미지가 포함된 경우 `images/`의 파일을 새 저장소에 업로드하고, 그
   URL을 새 DB에 기록합니다.
3. 타임스탬프는 원본 DB에 저장된 값을 ISO 8601 문자열로 기록했습니다.

이 파일의 구조(`schema_version`)를 유지하면 내부 DB를 바꾸더라도 이후
아카이브를 같은 방식으로 읽을 수 있습니다.
"""


class _ZipQueueWriter(io.RawIOBase):
    """Write ZIP bytes into a queue so the response can stream them."""

    def __init__(
        self,
        target: queue.Queue[Any],
        chunk_size: int = QUEUE_CHUNK_SIZE,
    ) -> None:
        self._target = target
        self._chunk_size = chunk_size
        self._buffer = bytearray()

    def writable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return False

    def _put(self, item: Any) -> None:
        self._target.put(item, timeout=30)

    def write(self, data: bytes) -> int:
        if not data:
            return 0

        self._buffer.extend(data)
        while len(self._buffer) >= self._chunk_size:
            chunk = bytes(self._buffer[: self._chunk_size])
            del self._buffer[: self._chunk_size]
            self._put(chunk)
        return len(data)

    def flush(self) -> None:
        if self._buffer:
            self._put(bytes(self._buffer))
            self._buffer.clear()

    def finish(self) -> None:
        self.flush()
        self._put(None)


def _spool_image(
    url: str,
) -> tuple[Any, str | None, str, int]:
    """Download one image into a temporary buffer and hash it."""

    with open_uploaded_file(url) as (source, content_type, _size):
        spool = tempfile.SpooledTemporaryFile(max_size=SPOOL_MAX_MEMORY)
        hasher = hashlib.sha256()
        total = 0

        try:
            while True:
                chunk = source.read(CHUNK_SIZE)
                if not chunk:
                    break
                hasher.update(chunk)
                total += len(chunk)
                spool.write(chunk)
            spool.seek(0)
        except BaseException:
            spool.close()
            raise

    return spool, content_type, hasher.hexdigest(), total


def _write_spooled_image(
    archive: zipfile.ZipFile,
    descriptor: dict[str, Any],
    prepared: tuple[Any, str | None, str, int],
) -> None:
    spool, content_type, digest, total = prepared
    try:
        with archive.open(descriptor["path"], "w") as target:
            shutil.copyfileobj(spool, target, CHUNK_SIZE)
    finally:
        spool.close()

    descriptor["content_type"] = content_type or mimetypes.guess_type(
        descriptor["path"]
    )[0]
    descriptor["size"] = total
    descriptor["sha256"] = digest


def _stream_zip(
    data: dict[str, Any],
    plan: _ArchivePlan,
    generated_at: datetime,
    section: str,
) -> Iterator[bytes]:
    events: queue.Queue[Any] = queue.Queue(maxsize=8)

    def put(item: Any) -> None:
        try:
            events.put(item, timeout=30)
        except queue.Full:
            logger.warning("Archive stream stopped accepting data")

    def producer() -> None:
        writer = _ZipQueueWriter(events)

        try:
            with zipfile.ZipFile(
                writer,
                "w",
                zipfile.ZIP_STORED,
                allowZip64=True,
            ) as archive:
                completed_paths: set[str] = set()

                for descriptor in plan.files:
                    try:
                        prepared = _spool_image(descriptor["url"])
                    except Exception as exc:  # noqa: BLE001
                        logger.warning(
                            "Skipping archive image %s: %s",
                            descriptor["url"],
                            exc,
                        )
                        plan.skipped.append(
                            {
                                "url": descriptor["url"],
                                "intended_path": descriptor["path"],
                                "reason": (
                                    f"{type(exc).__name__}: {exc}"
                                )[:300],
                            }
                        )
                        continue

                    _write_spooled_image(archive, descriptor, prepared)
                    completed_paths.add(descriptor["path"])

                _prune_missing_paths(data, completed_paths)
                manifest = _build_manifest(
                    data,
                    plan,
                    generated_at,
                    section,
                )

                archive.writestr(
                    "data.json",
                    json.dumps(data, ensure_ascii=False, indent=2),
                    compress_type=zipfile.ZIP_DEFLATED,
                )
                archive.writestr(
                    "manifest.json",
                    json.dumps(manifest, ensure_ascii=False, indent=2),
                    compress_type=zipfile.ZIP_DEFLATED,
                )
                archive.writestr(
                    "README.md",
                    _readme(generated_at, section),
                    compress_type=zipfile.ZIP_DEFLATED,
                )

            writer.finish()
        except BaseException as exc:  # noqa: BLE001
            logger.exception("Archive export failed")
            put(exc)
            put(None)

    thread = threading.Thread(
        target=producer,
        name="archive-export",
        daemon=True,
    )
    thread.start()

    while True:
        item = events.get()
        if item is None:
            break
        if isinstance(item, BaseException):
            raise item
        yield item


@router.get("/export")
def export_archive(
    section: str = "all",
    db: Session = Depends(get_db),
    _user=Depends(require_auth),
):
    """Download a portable JSON + original-images archive (admin only)."""

    if section not in SECTION_LABELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="지원하지 않는 내보내기 범위입니다.",
        )

    data, plan = _build_export(db, section)
    # Everything is converted to plain data. Return the database connection
    # to the pool before the potentially long image download starts.
    db.close()

    generated_at = datetime.now(timezone.utc)
    timestamp = generated_at.strftime("%Y%m%d-%H%M%S")
    filename = f"missing-island-archive-{section}-{timestamp}.zip"

    return StreamingResponse(
        _stream_zip(data, plan, generated_at, section),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
