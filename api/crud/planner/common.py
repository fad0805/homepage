"""Shared imports, constants and helpers for planner CRUD."""

import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import Text, and_, cast, func, or_
from sqlalchemy.orm import Session, selectinload

from core.audit import get_audit_actor
from core.html_sanitizer import sanitize_index_html
from core.search import like_pattern, search_tokens
from models.books import Book, BookCategory, Chapter
from models.characters import Character, Location
from models.index_page import IndexPage
from models.illustrations import Illustration
from models.links import Category as LinkCategory
from models.links import Link
from models.planner import PlannerColor, PlannerEvent, PlannerTask
from models.profiles import Profile
from models.users import AuthorSettings
from schemas.planner import (
    PlannerColorReorder,
    PlannerColorUpdate,
    PlannerCompletedCreate,
    PlannerEventPreview,
    PlannerTaskCreate,
    PlannerTaskUpdate,
)

KST = ZoneInfo("Asia/Seoul")
TRASH_RETENTION_DAYS = 30
INACTIVE_RETENTION_DAYS = 30
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def kst_now() -> datetime:
    return datetime.now(KST)


def kst_today() -> date:
    return kst_now().date()


def _utc_naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _clean_title(value: str | None) -> str:
    title = (value or "").strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="일정 제목을 입력해주세요.",
        )
    return title


def _clean_notes(value: str | None) -> str | None:
    notes = (value or "").strip()
    return notes or None


def _clean_color(value: str | None) -> str | None:
    if value is None:
        return None
    color = value.strip()
    if not color:
        return None
    if not COLOR_RE.fullmatch(color):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="색상은 #RRGGBB 형식으로 입력해주세요.",
        )
    return color.lower()


def _validate_color_id(
    db: Session,
    user_id: int,
    color_id: int | None,
) -> int | None:
    if color_id is None:
        return None
    saved = (
        db.query(PlannerColor)
        .filter(
            PlannerColor.id == color_id,
            PlannerColor.user_id == user_id,
        )
        .first()
    )
    if saved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="색상 칩을 찾을 수 없습니다.",
        )
    return saved.id


def _validate_deadline_days(value: int | None) -> int:
    days = 7 if value is None else value
    if days < 1 or days > 14:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="마감 기간은 1일 이상 14일 이하로 입력해주세요.",
        )
    return days


def _validate_start_date(
    value: date | None,
    *,
    current: date | None = None,
) -> date:
    start = value or kst_today()
    if start < kst_today() and start != current:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="시작일은 오늘 이후로 지정해주세요.",
        )
    return start


def _single_dates(
    start_date: date,
    deadline_days: int,
    *,
    now: datetime | None = None,
) -> tuple[date, date, date]:
    """Return (display start, deadline base, inclusive end).

    A task registered today before noon starts its deadline today. After noon
    it still appears today, but the deadline starts tomorrow. A future start
    date is not shifted by the noon cutoff.
    """
    current = now or kst_now()
    today = current.date()
    if start_date > today:
        base = start_date
    elif start_date < today:
        # An existing task that began on a past day keeps its display start
        # date, but a newly configured deadline starts from today.
        base = today + timedelta(days=1 if current.hour >= 12 else 0)
    elif current.hour >= 12:
        base = today + timedelta(days=1)
    else:
        base = start_date
    end = base + timedelta(days=deadline_days - 1)
    return start_date, base, end


def _range_dates(
    start_date: date | None,
    end_date: date | None,
    *,
    current_start: date | None = None,
) -> tuple[date, date]:
    if start_date is None or end_date is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="범위 일정은 시작일과 종료일을 모두 입력해주세요.",
        )
    if start_date < kst_today() and start_date != current_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="시작일은 오늘 이후로 지정해주세요.",
        )
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="종료일은 시작일보다 빠를 수 없습니다.",
        )
    return start_date, end_date


def _serialize_task(task: PlannerTask) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "notes": task.notes,
        "color_id": task.color_id,
        "color": (
            task.color_relation.color
            if task.color_relation
            else None
        ),
        "schedule_type": task.schedule_type,
        "start_date": task.start_date,
        "end_date": task.end_date,
        "deadline_days": task.deadline_days,
        "status": task.status,
        "pinned": bool(task.pinned),
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "inactive_at": task.inactive_at,
        "trashed_at": task.trashed_at,
    }


def _serialize_event(event: PlannerEvent) -> dict:
    return {
        "id": event.id,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "action": event.action,
        "title": event.title,
        "notes": event.notes,
        "color_id": event.color_id,
        "changes": event.changes,
        "occurred_at": event.occurred_at,
    }


def _serialize_color(saved: PlannerColor) -> dict:
    return {
        "id": saved.id,
        "color": saved.color,
        "name": saved.name,
        "position": saved.position,
        "created_at": saved.created_at,
    }


def _clean_color_name(value: str | None) -> str | None:
    name = (value or "").strip()
    return name or None


def _kst_day_start_utc(value: date) -> datetime:
    return (
        datetime.combine(value, time.min, tzinfo=KST)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


# Re-export shared imports, constants and helpers to sibling modules.
__all__ = [name for name in globals() if not name.startswith("__")]
