import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from io import BytesIO
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from core.uploads import open_uploaded_file
from core.url_safety import UnsafeUrlError, pin_external_url
from models.books import Chapter
from models.illustrations import Illustration
from models.settings import MastodonSettings, NotificationDelivery

logger = logging.getLogger("uvicorn.error")

STATUS_LIMIT = 500
REQUEST_TIMEOUT = 15.0
NOTIFY_SCOPES = {
    "all",
    "books",
    "book",
    "illustrations",
    "tag",
    "tag_books",
    "tag_illustrations",
}
NOTIFY_TAG_SCOPES = {"tag", "tag_books", "tag_illustrations"}
NOTIFY_TAG_MODES = {"any", "all"}
MAX_NOTIFY_TAGS = 10
SOCIAL_IMAGE_MAX_DIMENSION = 2048
SOCIAL_IMAGE_MAX_BYTES = 7 * 1024 * 1024

# Delivery rows only prevent duplicate posts for a short window. The content
# row's mastodon_status_id remains the permanent "already announced" marker.
NOTIFICATION_DELIVERY_RETENTION_DAYS = 3
NOTIFICATION_DELIVERY_PURGE_HOURS = 24
_last_delivery_purge: datetime | None = None


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
    normalized = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    try:
        pin_external_url(normalized, resource_label="인스턴스 URL")
    except UnsafeUrlError as error:
        raise MastodonError(str(error)) from error
    return normalized


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


def normalize_notify_tag(value: str | None) -> str | None:
    """Return the plain tag name used by the notification tag filter."""
    raw = (value or "").strip().lstrip("#").strip()
    raw = raw.split(",", 1)[0].strip()
    return raw[:255] or None


def normalize_notify_tags(value: str | None) -> list[str]:
    """Return the normalized tag list stored in one comma-separated field."""
    if not value:
        return []
    tags: list[str] = []
    seen: set[str] = set()
    for raw in str(value).split(","):
        name = normalize_notify_tag(raw)
        if name is None:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        tags.append(name)
        if len(tags) >= MAX_NOTIFY_TAGS:
            break
    return tags


def normalize_notify_tag_mode(value: object) -> str:
    """Return ``any`` (OR) or ``all`` (AND) for a tag notification profile."""
    return value if value in NOTIFY_TAG_MODES else "any"


def _tokenize_notify_tag_expression(value: str | None) -> list[tuple[str, str]]:
    """Tokenize ``A + (B * C)`` into tag/operator/parenthesis tokens."""
    raw = str(value or "").strip()
    tokens: list[tuple[str, str]] = []
    seen: set[str] = set()
    index = 0
    while index < len(raw):
        char = raw[index]
        if char.isspace() or char == ",":
            index += 1
            continue
        if char == "(":
            tokens.append(("LPAREN", char))
            index += 1
            continue
        if char == ")":
            tokens.append(("RPAREN", char))
            index += 1
            continue
        if char == "+":
            tokens.append(("AND", char))
            index += 1
            continue
        if char == "*":
            tokens.append(("OR", char))
            index += 1
            continue
        if char == '"':
            end = raw.find('"', index + 1)
            if end < 0:
                raise ValueError("따옴표가 닫히지 않았습니다.")
            tag = raw[index + 1 : end].strip()
            index = end + 1
        else:
            end = index
            while (
                end < len(raw)
                and not raw[end].isspace()
                and raw[end] not in ",()+*"
            ):
                end += 1
            tag = raw[index:end]
            index = end
        name = normalize_notify_tag(tag)
        if name is None:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        tokens.append(("TAG", name))
    return tokens


def _with_implicit_operators(
    tokens: list[tuple[str, str]],
    default_operator: str,
) -> list[tuple[str, str]]:
    """Treat legacy comma/space separated tags as ``default_operator``."""
    result: list[tuple[str, str]] = []
    operands = {"TAG", "RPAREN"}
    for token in tokens:
        if (
            result
            and result[-1][0] in operands
            and token[0] in {"TAG", "LPAREN"}
        ):
            result.append((default_operator, default_operator))
        result.append(token)
    return result


class _NotifyTagExpressionParser:
    """Recursive-descent parser with AND (+) binding tighter than OR (*)."""

    def __init__(
        self,
        tokens: list[tuple[str, str]],
        default_operator: str,
    ) -> None:
        self.tokens = _with_implicit_operators(tokens, default_operator)
        self.position = 0

    def _peek(self) -> tuple[str, str] | None:
        if self.position >= len(self.tokens):
            return None
        return self.tokens[self.position]

    def _match(self, kind: str) -> tuple[str, str] | None:
        token = self._peek()
        if token is not None and token[0] == kind:
            self.position += 1
            return token
        return None

    def parse(self):
        if not self.tokens:
            return None
        node = self._parse_or()
        if self._peek() is not None:
            raise ValueError("괄호와 연산자를 확인해주세요.")
        return node

    def _parse_or(self):
        node = self._parse_and()
        while self._match("OR"):
            node = ("or", node, self._parse_and())
        return node

    def _parse_and(self):
        node = self._parse_factor()
        while self._match("AND"):
            node = ("and", node, self._parse_factor())
        return node

    def _parse_factor(self):
        if self._match("LPAREN"):
            node = self._parse_or()
            if not self._match("RPAREN"):
                raise ValueError("닫는 괄호 ')'가 없습니다.")
            return node
        token = self._match("TAG")
        if token is None:
            raise ValueError("태그와 연산자를 확인해주세요.")
        return ("tag", token[1])


def _count_notify_tags(node) -> int:
    if node[0] == "tag":
        return 1
    return _count_notify_tags(node[1]) + _count_notify_tags(node[2])


def parse_notify_tag_expression(
    value: str | None,
    default_operator: str = "OR",
):
    """Parse a ``+`` / ``*`` / parentheses tag expression into an AST."""
    default = "AND" if default_operator == "AND" else "OR"
    tokens = _tokenize_notify_tag_expression(value)
    node = _NotifyTagExpressionParser(tokens, default).parse()
    if node is None:
        return None
    if _count_notify_tags(node) > MAX_NOTIFY_TAGS:
        raise ValueError(f"태그는 최대 {MAX_NOTIFY_TAGS}개까지 지정할 수 있습니다.")
    return node


def format_notify_tag_expression(node) -> str:
    """Render a parsed tag AST using ``+``/``*`` with minimal parentheses."""
    if node is None:
        return ""

    def render(current) -> str:
        kind = current[0]
        if kind == "tag":
            return current[1]
        symbol = "+" if kind == "and" else "*"
        left, right = current[1], current[2]

        def operand(child) -> str:
            if child[0] == "tag" or child[0] == kind:
                return render(child)
            if kind == "and" and child[0] == "or":
                return f"({render(child)})"
            return render(child)

        return f"{operand(left)} {symbol} {operand(right)}"

    return render(node)


def format_stored_notify_tags(value: str | None, mode: object) -> str | None:
    """Render a stored tag value for API responses, tolerating old formats."""
    default_operator = "AND" if normalize_notify_tag_mode(mode) == "all" else "OR"
    try:
        node = parse_notify_tag_expression(value, default_operator)
    except ValueError:
        node = None
        for tag in normalize_notify_tags(value):
            item = ("tag", tag)
            kind = "and" if default_operator == "AND" else "or"
            node = item if node is None else (kind, node, item)
    return format_notify_tag_expression(node) or None


def _pin_instance_url(url: str):
    """Resolve an instance URL once so the request uses the checked IP."""
    try:
        return pin_external_url(url, resource_label="인스턴스 URL")
    except UnsafeUrlError as error:
        raise MastodonError(str(error)) from error


def _ready_settings(db: Session):
    return db.query(MastodonSettings).filter(
        MastodonSettings.enabled.is_(True),
        MastodonSettings.instance_url.isnot(None),
        MastodonSettings.access_token.isnot(None),
    )


def list_active_notification_profiles(
    db: Session,
    user_id: int | None = None,
) -> list[MastodonSettings]:
    """Return enabled connections, optionally for one content owner."""
    query = _ready_settings(db)
    if user_id is not None:
        query = query.filter(MastodonSettings.user_id == user_id)
    return query.order_by(MastodonSettings.id.asc()).all()


def _delivered_profiles(
    db: Session,
    content_type: str,
    content_id: int,
) -> set[int]:
    return {
        row[0]
        for row in db.query(NotificationDelivery.settings_id).filter(
            NotificationDelivery.content_type == content_type,
            NotificationDelivery.content_id == content_id,
        )
    }


def _record_delivery(
    db: Session,
    settings_id: int,
    content_type: str,
    content_id: int,
    status_id: str,
) -> None:
    db.add(
        NotificationDelivery(
            settings_id=settings_id,
            content_type=content_type,
            content_id=content_id,
            status_id=status_id,
            posted_at=datetime.utcnow(),
        )
    )


def purge_notification_deliveries(
    db: Session,
    *,
    force: bool = False,
) -> int:
    """Delete delivery rows older than the short dedupe window.

    The content's ``mastodon_status_id`` is the permanent "already posted"
    marker, so these rows are only needed to avoid duplicate posts while a
    notification is still recent. Purging them keeps the table bounded.
    """
    global _last_delivery_purge
    now = datetime.utcnow()
    if (
        not force
        and _last_delivery_purge is not None
        and now - _last_delivery_purge
        < timedelta(hours=NOTIFICATION_DELIVERY_PURGE_HOURS)
    ):
        return 0

    cutoff = now - timedelta(days=NOTIFICATION_DELIVERY_RETENTION_DAYS)
    deleted = (
        db.query(NotificationDelivery)
        .filter(NotificationDelivery.posted_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    _last_delivery_purge = now
    return deleted


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
        if settings and settings.provider in (
            "mastodon",
            "misskey",
            "writ",
        )
        else "mastodon"
    )
    return {
        "id": settings.id if settings else 0,
        "name": settings.name if settings else "알림 설정",
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
        "notify_tag": (
            format_stored_notify_tags(
                settings.notify_tag, settings.notify_tag_mode
            )
            if settings and scope in NOTIFY_TAG_SCOPES
            else None
        ),
        "notify_tag_mode": (
            normalize_notify_tag_mode(settings.notify_tag_mode)
            if settings and scope in NOTIFY_TAG_SCOPES
            else "any"
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


def _evaluate_notify_tag_node(node, content: set[str]) -> bool:
    kind = node[0]
    if kind == "tag":
        return node[1].casefold() in content
    left = _evaluate_notify_tag_node(node[1], content)
    if kind == "and":
        return left and _evaluate_notify_tag_node(node[2], content)
    return left or _evaluate_notify_tag_node(node[2], content)


def _tags_match(
    tags: object,
    configured: str | list[str] | tuple[str, ...] | None,
    mode: object = "any",
) -> bool:
    """Match content tags against a ``+`` / ``*`` tag expression."""
    if not isinstance(tags, (list, tuple, set)):
        return False
    default_operator = "AND" if normalize_notify_tag_mode(mode) == "all" else "OR"
    try:
        if isinstance(configured, str):
            node = parse_notify_tag_expression(configured, default_operator)
        else:
            node = None
            for item in configured or []:
                name = normalize_notify_tag(str(item))
                if name is None:
                    continue
                tag_node = ("tag", name)
                kind = "and" if default_operator == "AND" else "or"
                node = tag_node if node is None else (kind, node, tag_node)
    except ValueError:
        return False
    if node is None:
        return False

    content = {
        (normalize_notify_tag(str(tag)) or "").casefold() for tag in tags
    }
    content.discard("")
    return _evaluate_notify_tag_node(node, content)


def _tag_matches(tags: object, configured: str | None) -> bool:
    """Backwards-compatible single-tag OR matcher."""
    return _tags_match(tags, configured, "any")


def _chapter_notify_allowed(
    settings: MastodonSettings,
    chapter: Chapter,
) -> bool:
    scope = _notify_scope(settings)
    if scope in ("all", "books"):
        return True
    if scope == "book":
        return (
            settings.notify_book_id is not None
            and chapter.book_id == settings.notify_book_id
        )
    if scope in NOTIFY_TAG_SCOPES and scope != "tag_illustrations":
        return _tags_match(
            chapter.tags,
            settings.notify_tag,
            settings.notify_tag_mode,
        )
    return False


def _illustration_notify_allowed(
    settings: MastodonSettings,
    illustration: Illustration,
) -> bool:
    scope = _notify_scope(settings)
    if scope in ("all", "illustrations"):
        return True
    if scope in NOTIFY_TAG_SCOPES and scope != "tag_books":
        return _tags_match(
            illustration.tags,
            settings.notify_tag,
            settings.notify_tag_mode,
        )
    return False


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


def _normalize_hashtag(tag: str) -> str | None:
    """Turn an arbitrary tag into a hashtag that Mastodon/Misskey accept."""
    value = (tag or "").strip().lstrip("#")
    value = re.sub(r"[^\w가-힣]", "", value, flags=re.UNICODE)
    if not value:
        return None
    return f"#{value}"


def _hashtag_line(tags: list[str] | None) -> str:
    result: list[str] = []
    seen: set[str] = set()
    for tag in tags or []:
        hashtag = _normalize_hashtag(tag)
        if hashtag is None:
            continue
        key = hashtag.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(hashtag)
    return " ".join(result)


def _append_hashtags(
    text: str,
    tags: list[str] | None,
) -> str:
    """Append the content's tags as hashtags without exceeding the limit."""
    hashtags = _hashtag_line(tags)
    if not hashtags:
        return _trim_status(text)

    base = text.strip()
    separator = "\n\n"
    if len(base) + len(separator) + len(hashtags) <= STATUS_LIMIT:
        return f"{base}{separator}{hashtags}"

    available = STATUS_LIMIT - len(separator) - len(hashtags)
    if available <= 1:
        return _trim_status(hashtags)

    trimmed = base[: available - 1].rstrip() + "…"
    return f"{trimmed}{separator}{hashtags}"


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
    return _append_hashtags("\n".join(lines), chapter.tags or [])


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
    return _append_hashtags(
        "\n".join(lines),
        illustration.tags or [],
    )


def _illustration_representative_url(
    illustration: Illustration,
) -> str | None:
    """Return the dedicated representative image or the selected gallery image."""
    if illustration.representative_url:
        return illustration.representative_url
    images = illustration.images or []
    if not images:
        return None
    if illustration.representative_image_id:
        for image in images:
            if image.id == illustration.representative_image_id:
                return image.url
    return images[0].url if images[0].url else None


def _media_scope_error(provider: str, detail: str) -> str:
    scope = "드라이브 파일 생성" if provider == "misskey" else "write:media"
    return (
        "이미지 업로드 권한이 없습니다. "
        f"액세스 토큰에 {scope} 권한을 추가해 다시 발급해주세요. ({detail})"
    )


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

    target = _pin_instance_url(f"{instance}{path}")
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            return client.request(
                method,
                target.url,
                headers={
                    "Authorization": f"Bearer {token}",
                    **target.headers,
                },
                extensions=target.extensions,
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
    target = _pin_instance_url(f"{instance}{path}")

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            return client.post(
                target.url,
                headers=target.headers,
                extensions=target.extensions,
                json=body,
            )
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

    mastodon_target = _pin_instance_url(f"{instance}/api/v1/instance")
    misskey_target = _pin_instance_url(f"{instance}/api/meta")

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            mastodon = client.get(
                mastodon_target.url,
                headers=mastodon_target.headers,
                extensions=mastodon_target.extensions,
            )
            if mastodon.status_code == 200:
                data = mastodon.json()
                if isinstance(data, dict):
                    version = str(data.get("version") or "")
                    if "writ" in version.lower():
                        return "writ"
                    if "uri" in data or "version" in data:
                        return "mastodon"

            misskey = client.post(
                misskey_target.url,
                headers=misskey_target.headers,
                extensions=misskey_target.extensions,
                json={},
            )
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
        "writ": verify_mastodon_credentials,
        "misskey": verify_misskey_credentials,
    }
    try:
        return provider, verifiers[provider](settings)
    except MastodonError as primary_error:
        if provider == "writ":
            raise primary_error
        other = "misskey" if provider == "mastodon" else "mastodon"
        try:
            return other, verifiers[other](settings)
        except MastodonError:
            raise primary_error


def _post_mastodon_status(
    settings: MastodonSettings,
    text: str,
    media_ids: list[str] | None = None,
) -> str:
    visibility = (
        settings.visibility
        if settings.visibility in ("public", "unlisted", "private")
        else "public"
    )
    data = {"status": text, "visibility": visibility}
    if media_ids:
        data["media_ids[]"] = media_ids
    response = _request(
        settings,
        "POST",
        "/api/v1/statuses",
        data=data,
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
    file_ids: list[str] | None = None,
) -> str:
    visibility = {
        "public": "public",
        "unlisted": "home",
        "private": "followers",
    }.get(settings.visibility, "public")
    payload = {"text": text, "visibility": visibility}
    if file_ids:
        payload["fileIds"] = file_ids
    response = _misskey_request(
        settings,
        "/api/notes/create",
        payload,
    )
    if response.status_code not in (200, 201):
        raise MastodonError(_request_error(response))
    data = response.json()
    note = data.get("createdNote") or {}
    status_id = note.get("id") or data.get("id")
    if not status_id:
        raise MastodonError("미스키 게시물 ID를 받지 못했습니다.")
    return str(status_id)


def _prepare_social_image(
    payload: bytes,
    content_type: str | None,
) -> tuple[bytes, str]:
    """Downscale/re-encode an upload so common instance limits accept it."""
    try:
        with Image.open(BytesIO(payload)) as source:
            if getattr(source, "is_animated", False):
                return payload, content_type or "image/gif"
            image = ImageOps.exif_transpose(source)
            if (
                image.mode in ("RGBA", "LA")
                or (image.mode == "P" and "transparency" in image.info)
            ):
                rgba = image.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
            resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
            image.thumbnail(
                (SOCIAL_IMAGE_MAX_DIMENSION, SOCIAL_IMAGE_MAX_DIMENSION),
                resampling,
            )
            quality = 88
            while True:
                output = BytesIO()
                image.save(
                    output,
                    format="JPEG",
                    quality=quality,
                    optimize=True,
                )
                result = output.getvalue()
                if len(result) <= SOCIAL_IMAGE_MAX_BYTES or quality <= 60:
                    return result, "image/jpeg"
                quality -= 8
    except Exception as error:
        logger.warning("Could not optimize notification image: %s", error)
        return payload, content_type or "application/octet-stream"


def _read_media_file(url: str) -> tuple[str, bytes, str] | None:
    """Read and optimize a stored upload for social media attachment."""
    try:
        with open_uploaded_file(url) as (handle, content_type, _size):
            payload = handle.read()
    except (FileNotFoundError, OSError) as error:
        logger.warning("Could not read notification image %s: %s", url, error)
        return None
    payload, content_type = _prepare_social_image(payload, content_type)
    filename = os.path.basename(urlparse(url).path) or "image"
    if content_type == "image/jpeg" and not filename.lower().endswith(
        (".jpg", ".jpeg")
    ):
        filename = f"{os.path.splitext(filename)[0]}.jpg"
    return filename, payload, content_type


def _upload_mastodon_media_bytes(
    settings: MastodonSettings,
    filename: str,
    payload: bytes,
    content_type: str,
    description: str | None = None,
) -> str:
    """Upload image bytes to Mastodon, raising a clear error on failure."""
    try:
        response = _request(
            settings,
            "POST",
            "/api/v2/media",
            data={"description": (description or "")[:1500]},
            files={"file": (filename, payload, content_type)},
        )
    except MastodonError as error:
        raise MastodonError(f"마스토돈 미디어 업로드 실패: {error}") from error
    if response.status_code not in (200, 201, 202):
        detail = _request_error(response)
        if response.status_code == 403:
            detail = _media_scope_error("mastodon", detail)
        raise MastodonError(
            f"마스토돈 미디어 업로드 실패 ({response.status_code}): {detail}"
        )
    try:
        media_id = response.json().get("id")
    except ValueError:
        media_id = None
    if not media_id:
        raise MastodonError("마스토돈 미디어 ID를 받지 못했습니다.")
    return str(media_id)


def _upload_mastodon_media(
    settings: MastodonSettings,
    url: str,
    description: str | None = None,
) -> str | None:
    media = _read_media_file(url)
    if media is None:
        return None
    filename, payload, content_type = media
    try:
        return _upload_mastodon_media_bytes(
            settings,
            filename,
            payload,
            content_type,
            description,
        )
    except MastodonError as error:
        logger.warning("Mastodon media upload failed: %s", error)
        return None


def _upload_misskey_media_bytes(
    settings: MastodonSettings,
    filename: str,
    payload: bytes,
    content_type: str,
    description: str | None = None,
) -> str:
    """Upload image bytes to Misskey, raising a clear error on failure."""
    instance = normalize_instance_url(settings.instance_url)
    token = (settings.access_token or "").strip()
    if not instance or not token:
        raise MastodonError("연결 정보를 먼저 저장해주세요.")
    target = _pin_instance_url(f"{instance}/api/drive/files/create")
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.post(
                target.url,
                headers=target.headers,
                extensions=target.extensions,
                data={"i": token, "comment": (description or "")[:1500]},
                files={"file": (filename, payload, content_type)},
            )
    except httpx.HTTPError as error:
        raise MastodonError(f"미스키 미디어 업로드 실패: {error}") from error
    if response.status_code not in (200, 201):
        detail = _request_error(response)
        if response.status_code == 403:
            detail = _media_scope_error("misskey", detail)
        raise MastodonError(
            f"미스키 미디어 업로드 실패 ({response.status_code}): {detail}"
        )
    try:
        file_id = response.json().get("id")
    except ValueError:
        file_id = None
    if not file_id:
        raise MastodonError("미스키 파일 ID를 받지 못했습니다.")
    return str(file_id)


def _upload_misskey_media(
    settings: MastodonSettings,
    url: str,
    description: str | None = None,
) -> str | None:
    media = _read_media_file(url)
    if media is None:
        return None
    filename, payload, content_type = media
    try:
        return _upload_misskey_media_bytes(
            settings,
            filename,
            payload,
            content_type,
            description,
        )
    except MastodonError as error:
        logger.warning("Misskey media upload failed: %s", error)
        return None


def probe_media_upload(settings: MastodonSettings) -> None:
    """Check that the token can upload images, then delete the probe file."""
    output = BytesIO()
    Image.new("RGB", (1, 1), "white").save(output, format="PNG")
    payload = output.getvalue()
    provider = (
        settings.provider
        if settings.provider in ("mastodon", "misskey", "writ")
        else "mastodon"
    )
    if provider == "misskey":
        file_id = _upload_misskey_media_bytes(
            settings,
            "notification-probe.png",
            payload,
            "image/png",
            "알림 연결 확인용 이미지",
        )
        try:
            _misskey_request(
                settings,
                "/api/drive/files/delete",
                {"fileId": file_id},
            )
        except MastodonError:
            logger.warning("Could not delete Misskey probe file %s", file_id)
        return

    media_id = _upload_mastodon_media_bytes(
        settings,
        "notification-probe.png",
        payload,
        "image/png",
        "알림 연결 확인용 이미지",
    )
    try:
        _request(settings, "DELETE", f"/api/v2/media/{media_id}")
    except MastodonError:
        logger.warning("Could not delete Mastodon probe media %s", media_id)


def post_status(
    settings: MastodonSettings,
    text: str,
    *,
    image_url: str | None = None,
    image_description: str | None = None,
) -> str:
    provider = (
        settings.provider
        if settings.provider in ("mastodon", "misskey", "writ")
        else "mastodon"
    )
    media_id = None
    if image_url:
        if provider == "misskey":
            media_id = _upload_misskey_media(
                settings, image_url, image_description
            )
        else:
            media_id = _upload_mastodon_media(
                settings, image_url, image_description
            )
    media_ids = [media_id] if media_id else None
    if provider == "misskey":
        return _post_misskey_status(settings, text, media_ids)
    return _post_mastodon_status(settings, text, media_ids)


def maybe_notify_chapter(db: Session, chapter: Chapter) -> bool:
    """Post a chapter notification to every matching profile.

    Returns True when at least one notification was created.
    """
    delivered = _delivered_profiles(db, "chapter", chapter.id)

    # Content posted before multiple profiles existed has no delivery rows.
    # Do not send it again just because a new profile was added.
    if chapter.mastodon_status_id and not delivered:
        if chapter.mastodon_pending:
            chapter.mastodon_pending = False
            db.commit()
        return False

    if chapter.book is not None and chapter.book.visible is False:
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

    profiles = list_active_notification_profiles(db, chapter.user_id)
    matched_profiles = [
        profile
        for profile in profiles
        if profile.id not in delivered
        and _chapter_notify_allowed(profile, chapter)
    ]
    if not matched_profiles:
        if chapter.mastodon_pending:
            chapter.mastodon_pending = False
            db.commit()
        return False

    posted_any = False
    last_status_id = None
    for profile in matched_profiles:
        try:
            status_id = post_status(
                profile,
                _chapter_text(profile, chapter),
            )
        except MastodonError as error:
            logger.warning(
                "Could not post chapter %s to %s: %s",
                chapter.id,
                profile.name or profile.id,
                error,
            )
            continue

        _record_delivery(
            db,
            profile.id,
            "chapter",
            chapter.id,
            status_id,
        )
        delivered.add(profile.id)
        posted_any = True
        last_status_id = status_id

    if posted_any:
        chapter.mastodon_status_id = last_status_id
        chapter.mastodon_posted_at = datetime.utcnow()
        chapter.mastodon_pending = False
        db.commit()
    return posted_any


def maybe_notify_illustration(
    db: Session,
    illustration: Illustration,
) -> bool:
    """Post an illustration notification to every matching profile."""
    delivered = _delivered_profiles(db, "illustration", illustration.id)

    if illustration.mastodon_status_id and not delivered:
        return False
    if illustration.visible is False:
        return False

    profiles = list_active_notification_profiles(db, illustration.user_id)
    if not profiles:
        return False

    posted_any = False
    last_status_id = None
    for profile in profiles:
        if profile.id in delivered:
            continue
        if not _illustration_notify_allowed(profile, illustration):
            continue

        try:
            status_id = post_status(
                profile,
                _illustration_text(profile, illustration),
                image_url=_illustration_representative_url(illustration),
                image_description=illustration.title,
            )
        except MastodonError as error:
            logger.warning(
                "Could not post illustration %s to %s: %s",
                illustration.id,
                profile.name or profile.id,
                error,
            )
            continue

        _record_delivery(
            db,
            profile.id,
            "illustration",
            illustration.id,
            status_id,
        )
        delivered.add(profile.id)
        posted_any = True
        last_status_id = status_id

    if posted_any:
        illustration.mastodon_status_id = last_status_id
        illustration.mastodon_posted_at = datetime.utcnow()
        db.commit()
    return posted_any


def publish_pending_chapters() -> int:
    """Post scheduled chapter notifications that are now due."""
    from db.session import SessionLocal

    db = SessionLocal()
    posted = 0
    try:
        try:
            purge_notification_deliveries(db)
        except Exception:
            logger.exception("Could not purge old Mastodon delivery records")

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
