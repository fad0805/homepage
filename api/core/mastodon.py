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
NOTIFY_SCOPES = {"all", "books", "book", "illustrations"}


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


def get_mastodon_settings(
    db: Session,
    user_id: int | None = None,
) -> MastodonSettings | None:
    query = db.query(MastodonSettings)
    if user_id is not None:
        query = query.filter(MastodonSettings.user_id == user_id)
    return query.order_by(
        MastodonSettings.updated_at.desc(),
        MastodonSettings.id.desc(),
    ).first()


def get_or_create_mastodon_settings(
    db: Session,
    user_id: int,
) -> MastodonSettings:
    settings = get_mastodon_settings(db, user_id)
    if settings is None:
        settings = MastodonSettings(enabled=False, user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return settings

    # Keep the most recently saved row for this user and discard stale copies.
    duplicates = (
        db.query(MastodonSettings)
        .filter(
            MastodonSettings.user_id == user_id,
            MastodonSettings.id != settings.id,
        )
        .all()
    )
    if duplicates:
        for duplicate in duplicates:
            db.delete(duplicate)
        db.commit()
    return settings


def _notify_scope(settings: MastodonSettings | None) -> str:
    scope = settings.notify_scope if settings else None
    return scope if scope in NOTIFY_SCOPES else "all"


def serialize_mastodon_settings(
    settings: MastodonSettings | None,
) -> dict:
    token = (settings.access_token or "") if settings else ""
    scope = _notify_scope(settings)
    provider = (
        settings.provider
        if settings and settings.provider in ("mastodon", "misskey")
        else "mastodon"
    )
    return {
        "enabled": bool(settings.enabled) if settings else False,
        "provider": provider,
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
        "notify_scope": scope,
        "notify_book_id": (
            settings.notify_book_id
            if settings and scope == "book"
            else None
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


def _chapter_notify_allowed(
    settings: MastodonSettings,
    chapter: Chapter,
) -> bool:
    scope = _notify_scope(settings)
    if scope == "all":
        return True
    if scope == "books":
        return True
    if scope == "book":
        return (
            settings.notify_book_id is not None
            and chapter.book_id == settings.notify_book_id
        )
    return False


def _illustration_notify_allowed(settings: MastodonSettings) -> bool:
    return _notify_scope(settings) in ("all", "illustrations")


def clear_pending_chapters_outside_scope(
    db: Session,
    settings: MastodonSettings,
) -> int:
    """Drop scheduled chapter notifications excluded by the new scope."""
    query = db.query(Chapter).filter(
        Chapter.user_id == settings.user_id,
        Chapter.mastodon_pending.is_(True),
        Chapter.mastodon_status_id.is_(None),
    )
    scope = _notify_scope(settings)

    if scope in ("all", "books"):
        return 0
    if scope == "illustrations":
        return query.update(
            {Chapter.mastodon_pending: False},
            synchronize_session=False,
        )
    if scope == "book":
        if settings.notify_book_id is None:
            return query.update(
                {Chapter.mastodon_pending: False},
                synchronize_session=False,
            )
        return query.filter(
            Chapter.book_id != settings.notify_book_id
        ).update(
            {Chapter.mastodon_pending: False},
            synchronize_session=False,
        )
    return 0


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
        if isinstance(error, dict):
            message = error.get("message") or error.get("code")
            if isinstance(message, str) and message.strip():
                return message.strip()
        if isinstance(error, str) and error.strip():
            return error.strip()
    if response.status_code == 401:
        return "액세스 토큰이 올바르지 않습니다."
    if response.status_code == 403:
        return "액세스 토큰에 게시 권한이 없습니다."
    return f"서버 요청에 실패했습니다. ({response.status_code})"


def _request(
    settings: MastodonSettings,
    method: str,
    path: str,
    **kwargs,
) -> httpx.Response:
    """Send a Mastodon API request with a bearer token."""
    instance = normalize_instance_url(settings.instance_url)
    token = (settings.access_token or "").strip()
    if not instance or not token:
        raise MastodonError("연결 정보를 먼저 저장해주세요.")

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


def _misskey_request(
    settings: MastodonSettings,
    path: str,
    payload: dict | None = None,
) -> httpx.Response:
    """Send a Misskey API request with the token in the request body."""
    instance = normalize_instance_url(settings.instance_url)
    token = (settings.access_token or "").strip()
    if not instance or not token:
        raise MastodonError("연결 정보를 먼저 저장해주세요.")

    body = dict(payload or {})
    body["i"] = token

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            return client.post(f"{instance}{path}", json=body)
    except httpx.HTTPError as error:
        logger.warning("Misskey request failed: %s", error)
        raise MastodonError(
            "미스키 서버에 연결하지 못했습니다. 인스턴스 주소를 확인해주세요."
        ) from error


def verify_mastodon_credentials(settings: MastodonSettings) -> dict:
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


def verify_misskey_credentials(settings: MastodonSettings) -> dict:
    response = _misskey_request(settings, "/api/i")
    if response.status_code != 200:
        raise MastodonError(_request_error(response))
    data = response.json()
    return {
        "account": data.get("username") or data.get("name"),
        "display_name": data.get("name") or None,
    }


def _detect_instance_software(
    settings: MastodonSettings,
) -> str | None:
    """Guess the instance software without using the access token."""
    instance = normalize_instance_url(settings.instance_url)
    if not instance:
        return None

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            mastodon = client.get(f"{instance}/api/v1/instance")
            if mastodon.status_code == 200:
                data = mastodon.json()
                if isinstance(data, dict) and (
                    "uri" in data or "version" in data
                ):
                    return "mastodon"

            misskey = client.post(f"{instance}/api/meta", json={})
            if misskey.status_code == 200:
                data = misskey.json()
                if isinstance(data, dict) and (
                    "version" in data or "name" in data
                ):
                    return "misskey"
    except (httpx.HTTPError, ValueError):
        return None
    return None


def detect_service(
    settings: MastodonSettings,
) -> tuple[str, dict]:
    """Detect whether the instance/token belongs to Mastodon or Misskey."""
    software = _detect_instance_software(settings)
    provider = software or "mastodon"

    verifiers = {
        "mastodon": verify_mastodon_credentials,
        "misskey": verify_misskey_credentials,
    }
    try:
        return provider, verifiers[provider](settings)
    except MastodonError as primary_error:
        other = "misskey" if provider == "mastodon" else "mastodon"
        try:
            return other, verifiers[other](settings)
        except MastodonError:
            raise primary_error


def _post_mastodon_status(
    settings: MastodonSettings,
    text: str,
) -> str:
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


def _post_misskey_status(
    settings: MastodonSettings,
    text: str,
) -> str:
    visibility = {
        "public": "public",
        "unlisted": "home",
        "private": "followers",
    }.get(settings.visibility, "public")
    response = _misskey_request(
        settings,
        "/api/notes/create",
        {"text": text, "visibility": visibility},
    )
    if response.status_code not in (200, 201):
        raise MastodonError(_request_error(response))
    data = response.json()
    note = data.get("createdNote") or {}
    status_id = note.get("id") or data.get("id")
    if not status_id:
        raise MastodonError("미스키 게시물 ID를 받지 못했습니다.")
    return str(status_id)


def post_status(settings: MastodonSettings, text: str) -> str:
    provider = (
        settings.provider
        if settings.provider in ("mastodon", "misskey")
        else "mastodon"
    )
    if provider == "misskey":
        return _post_misskey_status(settings, text)
    return _post_mastodon_status(settings, text)


def maybe_notify_chapter(db: Session, chapter: Chapter) -> bool:
    """Post a chapter notification once, or mark it as scheduled.

    Returns True when a Mastodon status was created.
    """
    settings = get_mastodon_settings(db, user_id=chapter.user_id)
    if settings is None:
        if chapter.mastodon_pending:
            chapter.mastodon_pending = False
            db.commit()
        return False
    if not _settings_ready(settings):
        return False

    if not _chapter_notify_allowed(settings, chapter):
        if chapter.mastodon_pending:
            chapter.mastodon_pending = False
            db.commit()
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

    # A protected book is announced only once, when its first chapter is
    # published. Later chapters are part of the same locked book, so pushing
    # each one would spam followers with links they cannot open.
    if chapter.book is not None and chapter.book.protected:
        already_posted = (
            db.query(Chapter.id)
            .filter(
                Chapter.book_id == chapter.book_id,
                Chapter.id != chapter.id,
                Chapter.mastodon_status_id.isnot(None),
            )
            .first()
        )
        if already_posted is not None:
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
    settings = get_mastodon_settings(
        db,
        user_id=illustration.user_id,
    )
    if not _settings_ready(settings):
        return False
    if not _illustration_notify_allowed(settings):
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
        now = datetime.utcnow()
        # Each chapter is notified through its own author's connection, so a
        # user's account never announces another user's content.
        enabled_user_ids = db.query(MastodonSettings.user_id).filter(
            MastodonSettings.enabled.is_(True),
            MastodonSettings.instance_url.isnot(None),
            MastodonSettings.access_token.isnot(None),
        )
        chapters = (
            db.query(Chapter)
            .filter(
                Chapter.mastodon_pending.is_(True),
                Chapter.mastodon_status_id.is_(None),
                Chapter.visible.is_(True),
                Chapter.user_id.in_(enabled_user_ids),
                (Chapter.published_at.is_(None))
                | (Chapter.published_at <= now),
            )
            .order_by(
                Chapter.published_at.asc(),
                Chapter.id.asc(),
            )
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
