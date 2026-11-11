import asyncio
import logging
import os
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from models.books import Chapter
from models.illustrations import Illustration
from models.settings import MastodonSettings

logger = logging.getLogger("uvicorn.error")

STATUS_LIMIT = 500
REQUEST_TIMEOUT = 15.0


class MastodonError(Exception):
    """A user-facing Mastodon API or configuration error."""


def normalize_instance_url(value: str | None) -> str | None:
    """Return a clean ``https://host`` (or explicit http) instance URL."""
    raw = (value or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise MastodonError("인스턴스 주소를 확인해주세요. 예: mastodon.social")
    if any(char.isspace() for char in parsed.netloc):
        raise MastodonError("인스턴스 주소를 확인해주세요. 예: mastodon.social")
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def normalize_site_url(value: str | None) -> str | None:
    """Return a clean public site base URL."""
    raw = (value or "").strip()
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise MastodonError(
            "사이트 주소를 확인해주세요. 예: https://example.com"
        )
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def get_mastodon_settings(db: Session) -> MastodonSettings | None:
    return (
        db.query(MastodonSettings)
        .order_by(
            MastodonSettings.updated_at.desc(),
            MastodonSettings.id.desc(),
        )
        .first()
    )


def get_or_create_mastodon_settings(db: Session) -> MastodonSettings:
    settings = get_mastodon_settings(db)
    if settings is None:
        settings = MastodonSettings(enabled=False)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return settings

    # Older builds could create more than one row when two reads raced.
    # Keep the most recently saved row and discard the stale copies.
    duplicates = (
        db.query(MastodonSettings)
        .filter(MastodonSettings.id != settings.id)
        .all()
    )
    if duplicates:
        for duplicate in duplicates:
            db.delete(duplicate)
        db.commit()
    return settings


def serialize_mastodon_settings(
    settings: MastodonSettings | None,
) -> dict:
    token = (settings.access_token or "") if settings else ""
    return {
        "enabled": bool(settings.enabled) if settings else False,
        "instance_url": settings.instance_url if settings else None,
        "site_url": settings.site_url if settings else None,
        "visibility": (
            settings.visibility
            if settings and settings.visibility in (
                "public",
                "unlisted",
                "private",
            )
            else "public"
        ),
        "has_access_token": bool(token),
        "access_token_hint": f"••••{token[-4:]}" if token else None,
        "updated_at": settings.updated_at if settings else None,
    }


def _settings_ready(settings: MastodonSettings | None) -> bool:
    return bool(
        settings
        and settings.enabled
        and settings.instance_url
        and settings.access_token
    )


def _site_base(settings: MastodonSettings) -> str:
    return (
        normalize_site_url(settings.site_url)
        or (os.getenv("SITE_URL") or "").strip().rstrip("/")
    )


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _trim_status(text: str) -> str:
    value = text.strip()
    if len(value) <= STATUS_LIMIT:
        return value
    return value[: STATUS_LIMIT - 1].rstrip() + "…"


def _chapter_text(settings: MastodonSettings, chapter: Chapter) -> str:
    base = _site_base(settings)
    lines = ["새 목차가 발행되었습니다.", "", chapter.title]
    book_title = chapter.book.title if chapter.book else None
    if book_title:
        lines.append(f"— {book_title}")
    if base:
        lines.append(
            f"{base}/books?book={chapter.book_id}&chapter={chapter.id}"
        )
    return _trim_status("\n".join(lines))


def _illustration_text(
    settings: MastodonSettings,
    illustration: Illustration,
) -> str:
    base = _site_base(settings)
    lines = ["새 삽화가 발행되었습니다.", "", illustration.title]
    if illustration.description:
        description = illustration.description.strip()
        if description:
            lines.extend(["", description])
    if base:
        lines.append(f"{base}/illustrations/{illustration.id}")
    return _trim_status("\n".join(lines))


def _request_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        error = payload.get("error") or payload.get("error_description")
        if isinstance(error, str) and error.strip():
            return error.strip()
    if response.status_code == 401:
        return "액세스 토큰이 올바르지 않습니다."
    if response.status_code == 403:
        return "액세스 토큰에 게시 권한이 없습니다."
    return f"마스토돈 요청에 실패했습니다. ({response.status_code})"


def _request(
    settings: MastodonSettings,
    method: str,
    path: str,
    **kwargs,
) -> httpx.Response:
    instance = normalize_instance_url(settings.instance_url)
    token = (settings.access_token or "").strip()
    if not instance or not token:
        raise MastodonError("마스토돈 연결 정보를 먼저 저장해주세요.")

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            return client.request(
                method,
                f"{instance}{path}",
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
    except httpx.HTTPError as error:
        logger.warning("Mastodon request failed: %s", error)
        raise MastodonError(
            "마스토돈 서버에 연결하지 못했습니다. 인스턴스 주소를 확인해주세요."
        ) from error


def verify_credentials(settings: MastodonSettings) -> dict:
    response = _request(
        settings,
        "GET",
        "/api/v1/accounts/verify_credentials",
    )
    if response.status_code != 200:
        raise MastodonError(_request_error(response))
    data = response.json()
    return {
        "account": data.get("acct") or data.get("username"),
        "display_name": data.get("display_name") or None,
    }


def post_status(settings: MastodonSettings, text: str) -> str:
    visibility = (
        settings.visibility
        if settings.visibility in ("public", "unlisted", "private")
        else "public"
    )
    response = _request(
        settings,
        "POST",
        "/api/v1/statuses",
        data={"status": text, "visibility": visibility},
    )
    if response.status_code not in (200, 201):
        raise MastodonError(_request_error(response))
    data = response.json()
    status_id = data.get("id")
    if not status_id:
        raise MastodonError("마스토돈 게시물 ID를 받지 못했습니다.")
    return str(status_id)


def maybe_notify_chapter(db: Session, chapter: Chapter) -> bool:
    """Post a chapter notification once, or mark it as scheduled.

    Returns True when a Mastodon status was created.
    """
    settings = get_mastodon_settings(db)
    if not _settings_ready(settings):
        return False

    if chapter.book is not None and chapter.book.visible is False:
        if chapter.mastodon_pending:
            chapter.mastodon_pending = False
            db.commit()
        return False

    if chapter.mastodon_status_id:
        if chapter.mastodon_pending:
            chapter.mastodon_pending = False
            db.commit()
        return False

    if chapter.visible is False:
        if chapter.mastodon_pending:
            chapter.mastodon_pending = False
            db.commit()
        return False

    published_at = _naive_utc(chapter.published_at)
    if published_at is not None and published_at > datetime.utcnow():
        if not chapter.mastodon_pending:
            chapter.mastodon_pending = True
            db.commit()
        return False

    try:
        status_id = post_status(settings, _chapter_text(settings, chapter))
    except MastodonError as error:
        logger.warning(
            "Could not post chapter %s to Mastodon: %s",
            chapter.id,
            error,
        )
        return False

    chapter.mastodon_status_id = status_id
    chapter.mastodon_posted_at = datetime.utcnow()
    chapter.mastodon_pending = False
    db.commit()
    return True


def maybe_notify_illustration(
    db: Session,
    illustration: Illustration,
) -> bool:
    """Post an illustration notification once when it becomes public."""
    settings = get_mastodon_settings(db)
    if not _settings_ready(settings):
        return False
    if illustration.visible is False or illustration.mastodon_status_id:
        return False

    try:
        status_id = post_status(
            settings,
            _illustration_text(settings, illustration),
        )
    except MastodonError as error:
        logger.warning(
            "Could not post illustration %s to Mastodon: %s",
            illustration.id,
            error,
        )
        return False

    illustration.mastodon_status_id = status_id
    illustration.mastodon_posted_at = datetime.utcnow()
    db.commit()
    return True


def publish_pending_chapters() -> int:
    """Post scheduled chapter notifications that are now due."""
    from db.session import SessionLocal

    db = SessionLocal()
    posted = 0
    try:
        settings = get_mastodon_settings(db)
        if not _settings_ready(settings):
            return 0

        now = datetime.utcnow()
        chapters = (
            db.query(Chapter)
            .filter(
                Chapter.mastodon_pending.is_(True),
                Chapter.mastodon_status_id.is_(None),
                Chapter.visible.is_(True),
                (Chapter.published_at.is_(None))
                | (Chapter.published_at <= now),
            )
            .order_by(Chapter.published_at.asc(), Chapter.id.asc())
            .limit(20)
            .all()
        )
        for chapter in chapters:
            if maybe_notify_chapter(db, chapter):
                posted += 1
    except Exception:
        logger.exception("Scheduled Mastodon notification failed")
    finally:
        db.close()
    return posted


async def mastodon_publish_loop() -> None:
    """Check for due scheduled chapter notifications once a minute."""
    while True:
        await asyncio.sleep(60)
        await asyncio.to_thread(publish_pending_chapters)
