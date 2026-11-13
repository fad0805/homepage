"""Database-independent export of the site's creative records.

This is deliberately not a database dump. Records keep stable IDs and
relationships in JSON, and original images are stored next to the data. That
makes the archive portable to another database or framework.
"""

from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import shutil
import tempfile
import time
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from core.archive_jobs import ArchiveJobBusy, ArchiveJobManager
from core.config import ARCHIVE_DIR, ARCHIVE_THROTTLE_SECONDS
from core.uploads import get_upload_source, open_uploaded_file
from db.session import SessionLocal, get_db
from models.books import Book, BookCategory, Chapter
from models.characters import Character, CharacterRelationship, Doll, Location
from models.illustrations import Illustration
from models.links import Category as LinkCategory
from models.links import Link
from models.memos import Memo
from models.profiles import Profile
from models.users import User

from .utils import is_admin, require_auth

logger = logging.getLogger("uvicorn.error")

router = APIRouter()

ARCHIVE_FORMAT = "missing-island-archive"
SCHEMA_VERSION = "2.0"
SITE_NAME = "어디에도 없는 섬"
SITE_DESCRIPTION = "한 소녀가 있었다."

CHUNK_SIZE = 1024 * 1024
SPOOL_MAX_MEMORY = 16 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

DATA_BOOK_CATEGORIES = "data/book_categories.json"
DATA_ILLUSTRATIONS = "data/illustrations.json"
DATA_CHARACTERS = "data/characters.json"
DATA_LINKS = "data/links.json"
DATA_PROFILE = "data/profile.json"
DATA_MEMOS = "data/memos.json"
CHAPTER_LAYOUT = "per_chapter"

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

SECTION_CONTENT_KEYS = {
    "all": list(CONTENT_KEYS),
    "profile": ["profiles"],
    "characters": [
        "characters",
        "character_relationships",
        "locations",
        "dolls",
    ],
    "books": ["book_categories", "books"],
    "illustrations": ["illustrations"],
    "links": ["links", "link_categories"],
    "memos": ["memos"],
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
    ) -> str | None:
        """Return an opaque archive path for a stored image, or ``None``.

        The archive filename is derived from the URL hash so original
        filenames are not exposed in the ZIP. External URLs and files we do
        not own are intentionally not downloaded; their original URL is
        still kept in the dataset.
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
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
        path = f"images/{directory}/{digest}{extension}"

        counter = 2
        while path in self.used_paths:
            path = f"images/{directory}/{digest}-{counter}{extension}"
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


@dataclass
class _PreparedArchive:
    section: str
    sections: dict[str, dict[str, Any]]
    book_index: list[dict[str, Any]]
    plan: _ArchivePlan
    counts: dict[str, int]
    user_id: int | None
    scope_label: str


def _book_categories_data(
    db: Session,
    user_id: int | None,
) -> list[dict[str, Any]]:
    query = db.query(BookCategory)
    if user_id is not None:
        # Categories are shared, so only include the ones this author uses.
        query = query.filter(
            BookCategory.id.in_(
                db.query(Book.category_id).filter(
                    Book.user_id == user_id,
                    Book.category_id.is_not(None),
                )
            )
        )
    return [
        {
            "id": category.id,
            "name": category.name,
            "order": category.order,
        }
        for category in query.order_by(
            BookCategory.order,
            BookCategory.id,
        ).all()
    ]


def _book_index_data(
    db: Session,
    user_id: int | None,
) -> list[dict[str, Any]]:
    chapter_join = Chapter.book_id == Book.id
    query = db.query(Book.id, Book.user_id, func.count(Chapter.id))
    if user_id is not None:
        chapter_join = and_(
            chapter_join,
            Chapter.user_id == user_id,
        )
        query = query.filter(Book.user_id == user_id)
    rows = (
        query.outerjoin(Chapter, chapter_join)
        .group_by(Book.id, Book.user_id, Book.order)
        .order_by(Book.order, Book.id)
        .all()
    )
    return [
        {
            "id": book_id,
            "user_id": user_id,
            "path": f"data/books/{book_id}.json",
            "chapters": int(chapter_count),
        }
        for book_id, user_id, chapter_count in rows
    ]


def _chapter_path(book_id: int, chapter_id: int) -> str:
    return f"data/chapters/{book_id}/{chapter_id}.json"


def _chapter_payload(chapter: Chapter) -> dict[str, Any]:
    return {
        "id": chapter.id,
        "user_id": chapter.user_id,
        "user": chapter.user.username if chapter.user else None,
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


def _book_metadata(
    book: Book,
    chapter_count: int,
) -> dict[str, Any]:
    return {
        "id": book.id,
        "user_id": book.user_id,
        "user": book.user.username if book.user else None,
        "title": book.title,
        "description": book.description,
        "tags": book.tags or [],
        "category_id": book.category_id,
        "order": book.order,
        "visible": book.visible,
        "protected": book.protected,
        "created_at": _iso(book.created_at),
        "updated_at": _iso(book.updated_at),
        "chapter_count": chapter_count,
    }


def _illustration_data(
    db: Session,
    plan: _ArchivePlan,
    user_id: int | None,
) -> list[dict[str, Any]]:
    query = db.query(Illustration)
    if user_id is not None:
        query = query.filter(Illustration.user_id == user_id)
    illustrations = []
    for illustration in query.order_by(
        Illustration.order,
        Illustration.id,
    ).all():
        images = []
        for image in illustration.images:
            images.append(
                {
                    "id": image.id,
                    "url": image.url,
                    "order": image.order,
                    "storage": _storage_kind(image.url),
                    "archive_path": plan.register(
                        image.url,
                        "illustrations",
                    ),
                }
            )

        representative_path = plan.register(
            illustration.representative_url,
            "illustrations",
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
                "user_id": illustration.user_id,
                "user": (
                    illustration.user.username
                    if illustration.user
                    else None
                ),
                "owner": illustration.owner,
                "title": illustration.title,
                "description": illustration.description,
                "tags": illustration.tags or [],
                "taken_at": _iso(illustration.taken_at),
                "representative_image_id": illustration.representative_image_id,
                "representative_url": illustration.representative_url,
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
    user_id: int | None,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    character_query = db.query(Character)
    if user_id is not None:
        character_query = character_query.filter(
            Character.user_id == user_id
        )
    characters = []
    character_rows = character_query.order_by(Character.id).all()
    character_ids = [character.id for character in character_rows]
    for character in character_rows:
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
                ),
                "detail_image_url": character.detail_image,
                "detail_image_archive_path": plan.register(
                    character.detail_image,
                    "characters",
                ),
            }
        )

    relationship_query = db.query(CharacterRelationship)
    if user_id is not None:
        relationship_query = relationship_query.filter(
            CharacterRelationship.character_id.in_(character_ids),
            CharacterRelationship.related_character_id.in_(
                character_ids
            ),
        )
    character_relationships = [
        {
            "id": relationship.id,
            "character_id": relationship.character_id,
            "related_character_id": relationship.related_character_id,
            "relationship_type": relationship.relationship_type,
            "established": _iso(relationship.established),
        }
        for relationship in relationship_query.order_by(
            CharacterRelationship.id
        ).all()
    ]

    location_query = db.query(Location)
    if user_id is not None:
        location_ids = {
            character.location_id
            for character in character_rows
            if character.location_id is not None
        }
        location_query = location_query.filter(
            Location.id.in_(location_ids)
        )
    locations = [
        {
            "id": location.id,
            "name": location.name,
            "description": location.description,
            "order": location.order,
        }
        for location in location_query.order_by(
            Location.order,
            Location.id,
        ).all()
    ]

    doll_query = db.query(Doll)
    if user_id is not None:
        doll_ids = {
            doll_id
            for character in character_rows
            for doll_id in (character.head, character.body)
            if doll_id is not None
        }
        doll_query = doll_query.filter(Doll.id.in_(doll_ids))
    dolls = [
        {
            "id": doll.id,
            "company": doll.company,
            "name": doll.name,
            "size": doll.size,
            "skin_tone": doll.skin_tone,
        }
        for doll in doll_query.order_by(Doll.id).all()
    ]

    return characters, character_relationships, locations, dolls


def _link_data(
    db: Session,
    plan: _ArchivePlan,
    user_id: int | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    link_query = db.query(Link)
    if user_id is not None:
        link_query = link_query.filter(Link.user_id == user_id)
    links = []
    link_rows = link_query.order_by(Link.order, Link.id).all()
    for link in link_rows:
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
                ),
                "category_id": link.category,
                "description": link.description,
                "order": link.order,
                "created_at": _iso(link.created_at),
                "updated_at": _iso(link.updated_at),
            }
        )

    category_query = db.query(LinkCategory)
    if user_id is not None:
        category_ids = {link.category for link in link_rows}
        category_query = category_query.filter(
            LinkCategory.id.in_(category_ids)
        )
    link_categories = [
        {
            "id": category.id,
            "name": category.name,
            "order": category.order,
        }
        for category in category_query.order_by(
            LinkCategory.order,
            LinkCategory.id,
        ).all()
    ]

    return links, link_categories


def _profile_data(
    db: Session,
    user_id: int | None,
) -> list[dict[str, Any]]:
    query = db.query(Profile)
    if user_id is not None:
        query = query.filter(Profile.user_id == user_id)
    return [
        {
            "id": profile.id,
            "user_id": profile.user_id,
            "user": profile.user.username if profile.user else None,
            "title": profile.title,
            "subtitle": profile.subtitle,
            "profile": profile.profile,
            "created_at": _iso(profile.created_at),
            "updated_at": _iso(profile.updated_at),
        }
        for profile in query.order_by(Profile.id).all()
    ]


def _memo_data(
    db: Session,
    user_id: int | None,
) -> list[dict[str, Any]]:
    query = db.query(Memo)
    if user_id is not None:
        query = query.filter(Memo.user_id == user_id)
    return [
        {
            "id": memo.id,
            "user_id": memo.user_id,
            "user": memo.user.username if memo.user else None,
            "owner": memo.owner,
            "content": memo.content,
            "pinned": memo.pinned,
            "expires_at": _iso(memo.expires_at),
            "created_at": _iso(memo.created_at),
            "updated_at": _iso(memo.updated_at),
        }
        for memo in query.order_by(Memo.id).all()
    ]


def _build_export(
    db: Session,
    section: str,
    user_id: int | None,
) -> _PreparedArchive:
    scope_user = db.get(User, user_id) if user_id is not None else None
    scope_label = (
        scope_user.username
        if scope_user is not None
        else ("전체" if user_id is None else f"user {user_id}")
    )
    plan = _ArchivePlan()
    sections: dict[str, dict[str, Any]] = {}
    book_index: list[dict[str, Any]] = []
    counts: dict[str, int] = {}

    if section in ("all", "books"):
        book_categories = _book_categories_data(db, user_id)
        sections[DATA_BOOK_CATEGORIES] = {
            "schema_version": SCHEMA_VERSION,
            "kind": "book_categories",
            "book_categories": book_categories,
        }
        counts["book_categories"] = len(book_categories)
        book_index = _book_index_data(db, user_id)

    if section in ("all", "illustrations"):
        illustrations = _illustration_data(db, plan, user_id)
        sections[DATA_ILLUSTRATIONS] = {
            "schema_version": SCHEMA_VERSION,
            "kind": "illustrations",
            "illustrations": illustrations,
        }
        counts["illustrations"] = len(illustrations)
        counts["illustration_images"] = sum(
            len(illustration["images"]) for illustration in illustrations
        )

    if section in ("all", "characters"):
        (
            characters,
            character_relationships,
            locations,
            dolls,
        ) = _character_data(db, plan, user_id)
        sections[DATA_CHARACTERS] = {
            "schema_version": SCHEMA_VERSION,
            "kind": "characters",
            "characters": characters,
            "character_relationships": character_relationships,
            "locations": locations,
            "dolls": dolls,
        }
        counts["characters"] = len(characters)
        counts["character_relationships"] = len(character_relationships)
        counts["locations"] = len(locations)
        counts["dolls"] = len(dolls)

    if section in ("all", "links"):
        links, link_categories = _link_data(db, plan, user_id)
        sections[DATA_LINKS] = {
            "schema_version": SCHEMA_VERSION,
            "kind": "links",
            "links": links,
            "link_categories": link_categories,
        }
        counts["links"] = len(links)
        counts["link_categories"] = len(link_categories)

    if section in ("all", "profile"):
        profiles = _profile_data(db, user_id)
        sections[DATA_PROFILE] = {
            "schema_version": SCHEMA_VERSION,
            "kind": "profile",
            "profiles": profiles,
        }
        counts["profiles"] = len(profiles)

    if section in ("all", "memos"):
        memos = _memo_data(db, user_id)
        sections[DATA_MEMOS] = {
            "schema_version": SCHEMA_VERSION,
            "kind": "memos",
            "memos": memos,
        }
        counts["memos"] = len(memos)

    return _PreparedArchive(
        section=section,
        sections=sections,
        book_index=book_index,
        plan=plan,
        counts=counts,
        user_id=user_id,
        scope_label=scope_label,
    )


def _prune_missing_paths(
    sections: dict[str, dict[str, Any]],
    completed_paths: set[str],
) -> None:
    """Clear references to images that could not be added to the ZIP."""

    def keep(path: str | None) -> str | None:
        if path and path in completed_paths:
            return path
        return None

    illustrations = sections.get(DATA_ILLUSTRATIONS, {}).get(
        "illustrations",
        [],
    )
    for illustration in illustrations:
        for image in illustration["images"]:
            image["archive_path"] = keep(image.get("archive_path"))
        illustration["representative_archive_path"] = keep(
            illustration.get("representative_archive_path")
        )

    characters = sections.get(DATA_CHARACTERS, {}).get("characters", [])
    for character in characters:
        character["thumbnail_archive_path"] = keep(
            character.get("thumbnail_archive_path")
        )
        character["detail_image_archive_path"] = keep(
            character.get("detail_image_archive_path")
        )

    links = sections.get(DATA_LINKS, {}).get("links", [])
    for link in links:
        link["banner_archive_path"] = keep(link.get("banner_archive_path"))


def _included_keys(section: str) -> list[str]:
    return list(SECTION_CONTENT_KEYS[section])


def _build_manifest(
    prepared: _PreparedArchive,
    json_files: list[dict[str, Any]],
    image_files: list[dict[str, Any]],
    generated_at: datetime,
    skipped_books: list[dict[str, str]],
) -> dict[str, Any]:
    included = _included_keys(prepared.section)
    counts = dict(prepared.counts)
    book_files = [
        descriptor for descriptor in json_files if "book" in descriptor
    ]

    if "books" in included:
        counts["books"] = len(book_files)
        counts["chapters"] = sum(
            int(descriptor["book"]["chapters"])
            for descriptor in book_files
        )

    completed_files = json_files + image_files
    counts["json_files"] = len(json_files)
    counts["image_files"] = len(image_files)
    counts["files"] = len(completed_files)
    counts["file_bytes"] = sum(
        int(descriptor.get("size") or 0)
        for descriptor in completed_files
    )

    return {
        "format": ARCHIVE_FORMAT,
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at.isoformat(),
        "site": {
            "name": SITE_NAME,
            "description": SITE_DESCRIPTION,
        },
        "selection": {
            "key": prepared.section,
            "label": SECTION_LABELS[prepared.section],
            "scope": {
                "user_id": prepared.user_id,
                "user": prepared.scope_label,
            },
            "included": included,
            "not_included": [
                key for key in CONTENT_KEYS if key not in included
            ],
        },
        "layout": {
            "data": "data/",
            "images": "images/",
            "chapters": CHAPTER_LAYOUT,
        },
        "counts": counts,
        "books": [
            {
                **descriptor["book"],
                "path": descriptor["path"],
            }
            for descriptor in book_files
        ],
        "files": completed_files,
        "skipped_files": list(prepared.plan.skipped) + skipped_books,
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


def _readme(
    generated_at: datetime,
    section: str,
    scope_label: str,
) -> str:
    label = SECTION_LABELS[section]
    included = _included_keys(section)
    includes_images = any(
        key in included for key in ("illustrations", "characters", "links")
    ) or section == "all"

    components = [
        "- `manifest.json` — 선택 범위, 책 목록, 파일 목록(SHA-256) 인덱스",
    ]
    if "book_categories" in included:
        components.append(
            "- `data/book_categories.json` — 책 카테고리"
        )
    if "books" in included:
        components.append(
            "- `data/books/{book_id}.json` — 책 메타데이터와 챕터 인덱스"
        )
        components.append(
            "- `data/chapters/{book_id}/{chapter_id}.json` — 챕터 하나"
        )
    if "illustrations" in included:
        components.append(
            "- `data/illustrations.json` — 삽화와 이미지 연결 정보"
        )
    if "characters" in included:
        components.append(
            "- `data/characters.json` — 등장인물·장소·인형·관계"
        )
    if "links" in included:
        components.append(
            "- `data/links.json` — 링크와 링크 카테고리"
        )
    if "profiles" in included:
        components.append("- `data/profile.json` — 프로필")
    if "memos" in included:
        components.append("- `data/memos.json` — 주석")
    if includes_images:
        components.append(
            "- `images/` — 원본 이미지. 파일명은 해시로 저장되며 각 JSON의 "
            "`archive_path`와 대응합니다. 이미지가 없으면 폴더가 없을 수 "
            "있습니다."
        )

    partial_note = (
        ""
        if section == "all"
        else (
            "이 파일은 전체 백업이 아닙니다. 선택한 범위 밖의 기록은 "
            "포함되지 않습니다.\n\n"
        )
    )
    chapter_note = (
        "\n챕터는 `data/chapters/{book_id}/{chapter_id}.json`에 하나씩 "
        "저장됩니다. `manifest.json`의 `layout.chapters`가 이 방식을 "
        "나타냅니다.\n"
        if "books" in included
        else ""
    )
    components_text = "\n".join(components)

    return f"""# 어디에도 없는 섬 · 아카이브 v{SCHEMA_VERSION} · {label}

이 ZIP은 Missing Island의 **{label}** 범위 기록을 특정 데이터베이스
구조와 무관한 형식으로 보존한 아카이브입니다. 내보내기 대상:
**{scope_label}**. 생성 시각: {generated_at.isoformat()}

{partial_note}## 구성

{components_text}
{chapter_note}
## 규칙

- 모든 `id`는 이 아카이브 안에서 원본 DB의 ID를 유지합니다.
- 이미지 파일명과 원본 파일명은 노출하지 않습니다. ZIP 안의 이미지
  경로는 URL 해시로 저장됩니다.
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

1. `manifest.json`의 `selection`과 `files`를 확인합니다.
2. `data/`의 JSON을 읽어 새 스키마에 매핑합니다. 책은
   `data/books/{{book_id}}.json`의 인덱스와
   `data/chapters/{{book_id}}/{{chapter_id}}.json`의 챕터를 읽습니다.
3. 이미지가 포함된 경우 `images/`의 파일을 새 저장소에 업로드하고, 그
   URL을 새 DB에 기록합니다.
4. 타임스탬프는 원본 DB에 저장된 값을 ISO 8601 문자열로 기록했습니다.

이 파일의 구조(`schema_version`)를 유지하면 내부 DB를 바꾸더라도 이후
아카이브를 같은 방식으로 읽을 수 있습니다.
"""


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


def _write_json_entry(
    archive: zipfile.ZipFile,
    path: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Write one JSON file and return its manifest descriptor."""
    hasher = hashlib.sha256()
    size = 0
    encoder = json.JSONEncoder(ensure_ascii=False, indent=2)

    with archive.open(path, "w") as target:
        for chunk in encoder.iterencode(payload):
            encoded = chunk.encode("utf-8")
            hasher.update(encoded)
            size += len(encoded)
            target.write(encoded)

    return {
        "path": path,
        "kind": "data",
        "size": size,
        "sha256": hasher.hexdigest(),
    }


def _throttle() -> None:
    if ARCHIVE_THROTTLE_SECONDS > 0:
        time.sleep(ARCHIVE_THROTTLE_SECONDS)


def _write_archive(
    archive: zipfile.ZipFile,
    prepared: _PreparedArchive,
    book_db: Session,
    progress: Callable[[str, int, int], None],
    user_id: int | None,
) -> None:
    total = (
        len(prepared.plan.files)
        + len(prepared.sections)
        + len(prepared.book_index)
        + sum(
            int(item.get("chapters") or 0)
            for item in prepared.book_index
        )
        + 1
    )
    processed = 0

    progress("images", processed, total)
    completed_paths: set[str] = set()
    image_files: list[dict[str, Any]] = []

    for descriptor in prepared.plan.files:
        try:
            spooled = _spool_image(descriptor["url"])
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Skipping archive image %s: %s",
                descriptor["url"],
                exc,
            )
            prepared.plan.skipped.append(
                {
                    "url": descriptor["url"],
                    "intended_path": descriptor["path"],
                    "reason": (
                        f"{type(exc).__name__}: {exc}"
                    )[:300],
                }
            )
        else:
            _write_spooled_image(archive, descriptor, spooled)
            completed_paths.add(descriptor["path"])
            image_files.append(
                {
                    "path": descriptor["path"],
                    "kind": "image",
                    "source_url": descriptor["url"],
                    "storage": descriptor["storage"],
                    "content_type": descriptor.get("content_type"),
                    "size": descriptor.get("size"),
                    "sha256": descriptor.get("sha256"),
                }
            )

        processed += 1
        progress("images", processed, total)
        _throttle()

    _prune_missing_paths(prepared.sections, completed_paths)

    json_files: list[dict[str, Any]] = []
    for path, payload in prepared.sections.items():
        json_files.append(_write_json_entry(archive, path, payload))
        processed += 1
        progress("data", processed, total)
        _throttle()

    skipped_books: list[dict[str, str]] = []
    for item in prepared.book_index:
        book = (
            book_db.query(Book)
            .filter(Book.id == item["id"])
            .one_or_none()
        )
        if book is None:
            skipped_books.append(
                {
                    "path": item["path"],
                    "reason": "book not found",
                }
            )
            processed += 1 + int(item.get("chapters") or 0)
            progress("books", processed, total)
            _throttle()
            continue

        chapter_query = book_db.query(
            Chapter.id,
            Chapter.title,
            Chapter.order,
        ).filter(Chapter.book_id == book.id)
        if user_id is not None:
            chapter_query = chapter_query.filter(
                Chapter.user_id == user_id
            )
        chapter_rows = chapter_query.order_by(
            Chapter.order,
            Chapter.id,
        ).all()
        chapter_index = [
            {
                "id": chapter_id,
                "title": title,
                "order": order,
                "path": _chapter_path(book.id, chapter_id),
            }
            for chapter_id, title, order in chapter_rows
        ]
        descriptor = _write_json_entry(
            archive,
            item["path"],
            {
                "schema_version": SCHEMA_VERSION,
                "kind": "book",
                "book": {
                    **_book_metadata(book, len(chapter_index)),
                    "chapters": chapter_index,
                },
            },
        )
        descriptor["book"] = {
            "id": book.id,
            "title": book.title,
            "order": book.order,
            "chapters": len(chapter_index),
        }
        json_files.append(descriptor)

        processed += 1
        progress("books", processed, total)
        _throttle()

        chapter_query = book_db.query(Chapter).filter(
            Chapter.book_id == book.id
        )
        if user_id is not None:
            chapter_query = chapter_query.filter(
                Chapter.user_id == user_id
            )
        for chapter in chapter_query.order_by(
            Chapter.order,
            Chapter.id,
        ).yield_per(50):
            chapter_descriptor = _write_json_entry(
                archive,
                _chapter_path(book.id, chapter.id),
                {
                    "schema_version": SCHEMA_VERSION,
                    "kind": "chapter",
                    "chapter": _chapter_payload(chapter),
                },
            )
            chapter_descriptor["chapter"] = {
                "id": chapter.id,
                "book_id": book.id,
                "title": chapter.title,
                "order": chapter.order,
            }
            json_files.append(chapter_descriptor)

            processed += 1
            progress("chapters", processed, total)
            _throttle()

    progress("finalizing", processed, total)
    generated_at = datetime.now(timezone.utc)
    manifest = _build_manifest(
        prepared,
        json_files,
        image_files,
        generated_at,
        skipped_books,
    )

    archive.writestr(
        "manifest.json",
        json.dumps(manifest, ensure_ascii=False, indent=2),
        compress_type=zipfile.ZIP_DEFLATED,
    )
    archive.writestr(
        "README.md",
        _readme(generated_at, prepared.section, prepared.scope_label),
        compress_type=zipfile.ZIP_DEFLATED,
    )
    progress("finalizing", total, total)


def _build_archive_file(
    section: str,
    output_path: Path,
    progress: Callable[[str, int, int], None],
    user_id: int | None,
) -> None:
    """Build one archive on disk. Runs in the background job worker."""

    db = SessionLocal()
    try:
        prepared = _build_export(db, section, user_id)
    finally:
        db.close()

    with zipfile.ZipFile(
        output_path,
        "w",
        zipfile.ZIP_STORED,
        allowZip64=True,
    ) as archive:
        book_db = SessionLocal()
        try:
            _write_archive(
                archive,
                prepared,
                book_db,
                progress,
                user_id,
            )
        finally:
            book_db.close()


_job_manager: ArchiveJobManager | None = None


def _get_job_manager() -> ArchiveJobManager:
    global _job_manager
    if _job_manager is None:
        _job_manager = ArchiveJobManager(
            ARCHIVE_DIR,
            _build_archive_file,
        )
    return _job_manager


@router.post("/jobs")
def create_archive_job(
    section: str = "all",
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Queue an archive export for the signed-in user or an admin target."""

    if section not in SECTION_LABELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="지원하지 않는 내보내기 범위입니다.",
        )

    if is_admin(user):
        if user_id is None:
            scope_user_id = None
            scope_label = "전체"
            label = SECTION_LABELS[section]
        else:
            target = db.get(User, user_id)
            if target is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="내보낼 사용자를 찾을 수 없습니다.",
                )
            scope_user_id = target.id
            scope_label = target.username
            label = f"{SECTION_LABELS[section]} · {target.username}"
    else:
        if user_id is not None and user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="다른 사용자의 기록은 내보낼 수 없습니다.",
            )
        scope_user_id = user.id
        scope_label = user.username
        label = f"{SECTION_LABELS[section]} · {user.username}"

    try:
        return _get_job_manager().create(
            section,
            label,
            user.username,
            user_id=scope_user_id,
            scope_label=scope_label,
        )
    except ArchiveJobBusy:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 내보내기가 진행 중입니다.",
        ) from None


@router.get("/jobs")
def list_archive_jobs(user=Depends(require_auth)):
    """List the signed-in user's recent archive jobs."""

    return _get_job_manager().list(user.username)


@router.get("/jobs/{job_id}")
def get_archive_job(
    job_id: str,
    user=Depends(require_auth),
):
    """Return one of the signed-in user's archive jobs."""

    job = _get_job_manager().get(job_id, user.username)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="내보내기 작업을 찾을 수 없습니다.",
        )
    return job


@router.get("/jobs/{job_id}/download")
def download_archive_job(
    job_id: str,
    user=Depends(require_auth),
):
    """Download one of the signed-in user's completed archive ZIPs."""

    found = _get_job_manager().download(job_id, user.username)
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="내보내기 파일을 찾을 수 없습니다.",
        )

    path, filename = found
    return FileResponse(
        path,
        media_type="application/zip",
        filename=filename,
        headers={
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
    )
