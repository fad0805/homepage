"""Automatic, diff-only planner history for content changes.

The planner should know that a book, chapter, illustration, character, link,
profile, index page, or account setting changed without storing a copy of the
old content. SQLAlchemy's flush events are a convenient single choke point:
all content writes already go through the ORM, so a listener can collect only
the changed fields and write a compact ``planner_events`` row after commit.
"""

from __future__ import annotations

import difflib
import html
import logging
import re
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from typing import Any, Callable

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session, object_session

from db.session import SessionLocal
from models.books import Book, BookCategory, Chapter
from models.characters import Character, CharacterRelationship, Location
from models.index_page import IndexPage
from models.illustrations import Illustration, IllustrationImage
from models.links import Category, Link
from models.memos import Memo
from models.planner import PlannerEvent
from models.profiles import Profile
from models.users import AuthorSettings, User

logger = logging.getLogger("uvicorn.error")

_actor_user_id: ContextVar[int | None] = ContextVar(
    "planner_audit_actor_user_id",
    default=None,
)


def set_audit_actor(user_id: int | None):
    return _actor_user_id.set(user_id)


def reset_audit_actor(token) -> None:
    _actor_user_id.reset(token)


def get_audit_actor() -> int | None:
    return _actor_user_id.get()


@dataclass(frozen=True)
class _Tracked:
    entity_type: str
    title: Callable[[Any], str]
    owner: Callable[[Any], int | None]
    fields: frozenset[str]
    html_fields: frozenset[str] = frozenset()
    image_fields: frozenset[str] = frozenset()
    skip_create: bool = False
    track_updates: bool = True
    occurred_at: Callable[[Any], datetime | None] | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _book_category_title(obj: BookCategory) -> str:
    return _text(obj.name) or "책장 분류"


def _book_title(obj: Book) -> str:
    return _text(obj.title) or "목차"


def _chapter_title(obj: Chapter) -> str:
    return _text(obj.title) or "챕터"


def _chapter_occurred_at(obj: Chapter) -> datetime | None:
    """Anchor a post's history on its publication time, not its edit time."""
    value = getattr(obj, "published_at", None)
    if value is None:
        value = getattr(obj, "created_at", None)
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _illustration_title(obj: Illustration) -> str:
    return _text(obj.title) or "삽화"


def _character_title(obj: Character) -> str:
    return _text(obj.name) or "등장인물"


def _location_title(obj: Location) -> str:
    return _text(obj.name) or "장소"


def _link_title(obj: Link) -> str:
    return _text(obj.name) or "링크"


def _link_category_title(obj: Category) -> str:
    return _text(obj.name) or "링크 분류"


def _profile_title(obj: Profile) -> str:
    return _text(obj.title) or "프로필"


def _index_title(obj: IndexPage) -> str:
    return (
        _text(getattr(obj, "title", None))
        or ("통합 인덱스" if obj.scope == "integrated" else "작가 인덱스")
    )


def _account_title(obj: AuthorSettings) -> str:
    return _text(obj.nickname) or "계정"


def _user_title(obj: User) -> str:
    return _text(obj.username) or "계정"


def _owner_from_user_id(obj: Any) -> int | None:
    return getattr(obj, "user_id", None)


def _owner_from_actor_or_user(obj: IndexPage) -> int | None:
    return getattr(obj, "user_id", None) or get_audit_actor()


# Memos are frequently used scratch notes. They deliberately never create
# planner history, including create/update/delete events.
_IGNORED_MODELS = (Memo,)

TRACKED: dict[type, _Tracked] = {
    BookCategory: _Tracked(
        "book_category",
        _book_category_title,
        _owner_from_user_id,
        frozenset({"name", "visible", "protected"}),
        track_updates=False,
    ),
    Book: _Tracked(
        "book",
        _book_title,
        _owner_from_user_id,
        frozenset(
            {"title", "description", "tags", "category_id", "visible", "protected"}
        ),
        html_fields=frozenset(),
        track_updates=False,
    ),
    Chapter: _Tracked(
        "chapter",
        _chapter_title,
        _owner_from_user_id,
        frozenset(
            {
                "title",
                "subtitle",
                "body",
                "tags",
                "visible",
                "protected",
                "published_at",
            }
        ),
        html_fields=frozenset({"body"}),
        track_updates=False,
        occurred_at=_chapter_occurred_at,
    ),
    Illustration: _Tracked(
        "illustration",
        _illustration_title,
        _owner_from_user_id,
        frozenset(
            {
                "title",
                "description",
                "tags",
                "taken_at",
                "representative_image_id",
                "representative_url",
                "visible",
                "protected",
            }
        ),
        image_fields=frozenset({"representative_image_id", "representative_url"}),
        track_updates=False,
    ),
    Character: _Tracked(
        "character",
        _character_title,
        _owner_from_user_id,
        frozenset(
            {
                "name",
                "thumbnail",
                "detail_image",
                "location_id",
                "alt_name",
                "nickname",
                "age",
                "serif",
                "description",
                "comming_day",
                "visible",
                "is_my_doll",
                "layout",
            }
        ),
        image_fields=frozenset({"thumbnail", "detail_image"}),
    ),
    Location: _Tracked(
        "character_location",
        _location_title,
        _owner_from_user_id,
        frozenset({"name", "description"}),
    ),
    Link: _Tracked(
        "link",
        _link_title,
        _owner_from_user_id,
        frozenset({"name", "url", "banner_url", "category", "description"}),
        image_fields=frozenset({"banner_url"}),
    ),
    Category: _Tracked(
        "link_category",
        _link_category_title,
        _owner_from_user_id,
        frozenset({"name"}),
    ),
    Profile: _Tracked(
        "profile",
        _profile_title,
        _owner_from_user_id,
        frozenset({"title", "subtitle", "profile"}),
        html_fields=frozenset({"profile"}),
    ),
    IndexPage: _Tracked(
        "index",
        _index_title,
        _owner_from_actor_or_user,
        frozenset({"title", "subtitle", "copyright_name", "content_html"}),
        html_fields=frozenset({"content_html"}),
        skip_create=True,
    ),
    AuthorSettings: _Tracked(
        "account",
        _account_title,
        _owner_from_user_id,
        frozenset({"nickname", "slug"}),
        skip_create=True,
    ),
    User: _Tracked(
        "account",
        _user_title,
        lambda obj: obj.id,
        frozenset({"username", "hashed_password", "role"}),
    ),
}

_IMAGE_FIELDS = frozenset(
    {
        "thumbnail",
        "detail_image",
        "banner_url",
        "representative_url",
        "representative_image_id",
    }
)

# Field-level safety net for scratch fields that should never be audited.
_IGNORED_FIELDS = frozenset({"notes"})

_HTML_BLOCK_TAGS = {
    "p",
    "div",
    "br",
    "li",
    "ul",
    "ol",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "pre",
    "table",
    "tr",
    "td",
    "th",
}

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。！？])\s+|\n+")
_IMG_SRC = re.compile(r"<img\b[^>]*\bsrc\s*=\s*([\"'])(.*?)\1", re.I)
_LINK_HREF = re.compile(r"<a\b[^>]*\bhref\s*=\s*([\"'])(.*?)\1", re.I)
_TAG = re.compile(r"<[^>]+>")


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() in _HTML_BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in _HTML_BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _html_to_text(value: Any) -> str:
    if value is None:
        return ""
    parser = _HTMLTextExtractor()
    try:
        parser.feed(str(value))
        parser.close()
        text = "".join(parser.parts)
    except Exception:
        text = _TAG.sub(" ", str(value))
    return _normalize_text(html.unescape(text))


def _normalize_text(value: Any) -> str:
    return re.sub(r"[ \t\r\f\v]+", " ", str(value or "")).strip()


def _truncate(value: str, limit: int = 500) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def _json_safe(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _split_sentences(value: str) -> list[str]:
    parts = [part.strip() for part in _SENTENCE_SPLIT.split(value)]
    return [part for part in parts if part]


def _text_diff(field: str, old: Any, new: Any) -> list[dict]:
    old_text = _normalize_text(old)
    new_text = _normalize_text(new)
    if old_text == new_text:
        return []

    old_sentences = _split_sentences(old_text) or [old_text]
    new_sentences = _split_sentences(new_text) or [new_text]
    matcher = difflib.SequenceMatcher(
        None,
        old_sentences,
        new_sentences,
        autojunk=False,
    )
    changes: list[dict] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        before = " ".join(old_sentences[i1:i2]).strip()
        after = " ".join(new_sentences[j1:j2]).strip()
        if not before and not after:
            continue
        changes.append(
            {
                "field": field,
                "kind": "text",
                "before": _truncate(before),
                "after": _truncate(after),
            }
        )
        if len(changes) >= 10:
            break
    return changes


def _html_diff(field: str, old: Any, new: Any) -> list[dict]:
    changes = _text_diff(field, _html_to_text(old), _html_to_text(new))
    old_html = str(old or "")
    new_html = str(new or "")
    if sorted(_IMG_SRC.findall(old_html)) != sorted(_IMG_SRC.findall(new_html)):
        changes.append({"field": field, "kind": "image_changed"})
    if sorted(_LINK_HREF.findall(old_html)) != sorted(_LINK_HREF.findall(new_html)):
        changes.append({"field": field, "kind": "link_changed"})
    return changes


def _value_diff(field: str, old: Any, new: Any) -> list[dict]:
    if old == new:
        return []
    return [
        {
            "field": field,
            "kind": "value",
            "before": _json_safe(old),
            "after": _json_safe(new),
        }
    ]


def _changes_for_field(
    tracked: _Tracked,
    field: str,
    old: Any,
    new: Any,
) -> list[dict]:
    if field in _IGNORED_FIELDS:
        return []
    if field == "hashed_password":
        return [{"field": "password", "kind": "password_changed"}]
    if field in tracked.html_fields:
        return _html_diff(field, old, new)
    if field in tracked.image_fields or field in _IMAGE_FIELDS:
        if old == new:
            return []
        return [{"field": field, "kind": "image_changed"}]
    if field in {"description", "serif", "notes"}:
        return _text_diff(field, old, new)
    if field in {"tags", "relationships", "images"}:
        return _value_diff(field, old, new)
    return _value_diff(field, old, new)


def _changes_for_update(obj: Any, tracked: _Tracked) -> list[dict]:
    state = inspect(obj)
    changes: list[dict] = []
    for field in tracked.fields:
        if field not in state.attrs:
            continue
        history = state.attrs[field].history
        if not history.has_changes():
            continue
        old = history.deleted[0] if history.deleted else None
        new = history.added[0] if history.added else getattr(obj, field)
        changes.extend(_changes_for_field(tracked, field, old, new))
    return _dedupe_changes(changes)


def _dedupe_changes(changes: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    result: list[dict] = []
    for change in changes:
        key = (
            change.get("field"),
            change.get("kind"),
            str(change.get("before")),
            str(change.get("after")),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(change)
    return result[:20]


def _meta_for(obj: Any) -> _Tracked | None:
    if isinstance(obj, _IGNORED_MODELS):
        return None
    return TRACKED.get(type(obj))


def _child_parent(obj: Any) -> Any | None:
    if isinstance(obj, IllustrationImage):
        parent = getattr(obj, "illustration", None)
        if parent is not None:
            return parent
        session = object_session(obj)
        if session is not None and obj.illustration_id:
            return session.get(Illustration, obj.illustration_id)
        return None
    if isinstance(obj, CharacterRelationship):
        parent = getattr(obj, "character", None)
        if parent is not None:
            return parent
        session = object_session(obj)
        if session is not None and obj.character_id:
            return session.get(Character, obj.character_id)
        return None
    return None


def _child_meta(obj: Any) -> _Tracked | None:
    parent = _child_parent(obj)
    if parent is None:
        return None
    if isinstance(parent, Illustration):
        return TRACKED[Illustration]
    if isinstance(parent, Character):
        return TRACKED[Character]
    return None


def _child_change(obj: Any) -> dict | None:
    if isinstance(obj, IllustrationImage):
        return {"field": "images", "kind": "image_changed"}
    if isinstance(obj, CharacterRelationship):
        return {"field": "relationships", "kind": "changed"}
    return None


def _event_title(obj: Any, tracked: _Tracked) -> str:
    try:
        return _truncate(tracked.title(obj), 255)
    except Exception:
        return ""


def _event_owner(obj: Any, tracked: _Tracked) -> int | None:
    try:
        return tracked.owner(obj)
    except Exception:
        return None


def _queue(
    pending: list[dict],
    obj: Any,
    tracked: _Tracked,
    action: str,
    changes: list[dict] | None,
    *,
    title_obj: Any | None = None,
    owner: int | None = None,
) -> None:
    target = title_obj or obj
    resolved_owner = owner if owner is not None else _event_owner(target, tracked)
    if resolved_owner is None:
        return
    entity_id = getattr(target, "id", None)
    if entity_id is None:
        # AuthorSettings uses user_id as its primary key.
        entity_id = getattr(target, "user_id", None)
    if entity_id is None:
        return

    key = (resolved_owner, tracked.entity_type, entity_id, action)
    for item in pending:
        if item["_key"] == key:
            if changes:
                item["changes"] = _dedupe_changes(
                    (item.get("changes") or []) + changes
                )
            return

    occurred_at = (
        tracked.occurred_at(target) if tracked.occurred_at else None
    ) or datetime.now(timezone.utc).replace(tzinfo=None)

    pending.append(
        {
            "_key": key,
            "owner_user_id": resolved_owner,
            "actor_user_id": get_audit_actor(),
            "entity_type": tracked.entity_type,
            "entity_id": entity_id,
            "action": action,
            "title": _event_title(target, tracked),
            "changes": _dedupe_changes(changes or []) or None,
            "occurred_at": occurred_at,
        }
    )


def queue_change(
    session: Session,
    obj: Any,
    change: dict,
) -> None:
    """Queue an explicit change for ORM operations that bypass flush hooks."""
    extras = session.info.setdefault("planner_audit_extra", [])
    extras.append((obj, change))


def _is_child_of_new(obj: Any, new_objects: list[Any]) -> bool:
    parent = _child_parent(obj)
    return parent is not None and parent in new_objects


def _is_child_of_deleted(obj: Any, deleted_objects: list[Any]) -> bool:
    parent = _child_parent(obj)
    return parent is not None and parent in deleted_objects


def _process_extra_changes(session: Session, pending: list[dict]) -> None:
    extras = session.info.pop("planner_audit_extra", [])
    for obj, change in extras:
        tracked = _meta_for(obj)
        if tracked is None or not tracked.track_updates:
            continue
        # A newly-created object already has a ``created`` event; the extra
        # change belongs to its initial state, not a follow-up edit.
        if obj in session.new:
            continue
        _queue(pending, obj, tracked, "updated", [change])


@event.listens_for(Session, "before_flush")
def _before_flush(session: Session, flush_context, instances) -> None:
    pending = session.info.setdefault("planner_audit_pending", [])
    new_objects = session.info.setdefault("planner_audit_new", [])

    for obj in list(session.new):
        if _meta_for(obj) is not None or _child_parent(obj) is not None:
            if obj not in new_objects:
                new_objects.append(obj)

    deleted_objects = list(session.deleted)

    for obj in list(session.dirty):
        tracked = _meta_for(obj)
        if tracked is None or not tracked.track_updates:
            continue
        if obj in session.new:
            continue
        changes = _changes_for_update(obj, tracked)
        if changes:
            _queue(pending, obj, tracked, "updated", changes)

    for obj in deleted_objects:
        tracked = _meta_for(obj)
        if tracked is not None:
            if _is_child_of_deleted(obj, deleted_objects):
                continue
            _queue(pending, obj, tracked, "deleted", None)
            continue

        parent = _child_parent(obj)
        child_meta = _child_meta(obj)
        if parent is None or child_meta is None:
            continue
        if not child_meta.track_updates:
            continue
        if _is_child_of_deleted(obj, deleted_objects):
            continue
        change = _child_change(obj)
        if change:
            _queue(
                pending,
                parent,
                child_meta,
                "updated",
                [change],
                title_obj=parent,
                owner=_event_owner(parent, child_meta),
            )

    _process_extra_changes(session, pending)


@event.listens_for(Session, "after_flush")
def _after_flush(session: Session, flush_context) -> None:
    new_objects = session.info.pop("planner_audit_new", [])
    if not new_objects:
        return
    pending = session.info.setdefault("planner_audit_pending", [])

    for obj in new_objects:
        tracked = _meta_for(obj)
        if tracked is not None:
            if tracked.skip_create:
                continue
            _queue(pending, obj, tracked, "created", None)
            continue

        parent = _child_parent(obj)
        child_meta = _child_meta(obj)
        if parent is None or child_meta is None:
            continue
        if not child_meta.track_updates:
            continue
        if _is_child_of_new(obj, new_objects):
            continue
        change = _child_change(obj)
        if change:
            _queue(
                pending,
                parent,
                child_meta,
                "updated",
                [change],
                title_obj=parent,
                owner=_event_owner(parent, child_meta),
            )


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    pending = session.info.pop("planner_audit_pending", [])
    if not pending:
        return
    try:
        with SessionLocal() as audit_db:
            audit_db.add_all(
                [
                    PlannerEvent(
                        owner_user_id=item["owner_user_id"],
                        actor_user_id=item["actor_user_id"],
                        entity_type=item["entity_type"],
                        entity_id=item["entity_id"],
                        action=item["action"],
                        title=item["title"],
                        changes=item["changes"],
                        occurred_at=item["occurred_at"],
                    )
                    for item in pending
                ]
            )
            audit_db.commit()
    except Exception:
        logger.exception("Failed to write planner history events.")


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop("planner_audit_pending", None)
    session.info.pop("planner_audit_new", None)
    session.info.pop("planner_audit_extra", None)
