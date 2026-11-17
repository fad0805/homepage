"""Date markers and D-days for the planner calendar."""

from .common import *  # noqa: F401,F403


def _marker_char(title: str) -> str:
    cleaned = (title or "").strip()
    return cleaned[:1] if cleaned else "•"


def _date_marker_dict(marker: BookmarkDateMarker) -> dict[str, Any]:
    return {
        "id": marker.id,
        "title": marker.title,
        "memo": marker.memo,
        "marker_date": marker.marker_date,
        "is_dday": bool(marker.is_dday),
        "pinned": bool(marker.pinned),
        "interval_days": marker.interval_days,
        "marker": _marker_char(marker.title),
        "created_at": marker.created_at,
        "updated_at": marker.updated_at,
    }


def _normalize_date_marker(
    marker: BookmarkDateMarker,
) -> None:
    if not marker.is_dday:
        marker.pinned = False
        marker.interval_days = None


def list_date_markers(db: Session, user_id: int) -> dict[str, Any]:
    markers = (
        db.query(BookmarkDateMarker)
        .filter(BookmarkDateMarker.user_id == user_id)
        .order_by(
            BookmarkDateMarker.marker_date,
            BookmarkDateMarker.id,
        )
        .all()
    )
    return {
        "markers": [
            _date_marker_dict(marker)
            for marker in markers
        ]
    }


def create_date_marker(
    db: Session,
    payload: BookmarkDateMarkerCreate,
    user_id: int,
) -> dict[str, Any]:
    marker = BookmarkDateMarker(
        user_id=user_id,
        title=_clean_title(payload.title),
        memo=_clean_notes(payload.memo),
        marker_date=payload.marker_date,
        is_dday=bool(payload.is_dday),
        pinned=bool(payload.pinned),
        interval_days=payload.interval_days,
    )
    _normalize_date_marker(marker)
    db.add(marker)
    db.commit()
    db.refresh(marker)
    return _date_marker_dict(marker)


def update_date_marker(
    db: Session,
    marker_id: int,
    payload: BookmarkDateMarkerUpdate,
    user_id: int,
) -> dict[str, Any]:
    marker = (
        db.query(BookmarkDateMarker)
        .filter(
            BookmarkDateMarker.id == marker_id,
            BookmarkDateMarker.user_id == user_id,
        )
        .first()
    )
    if marker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="날짜 마커를 찾을 수 없습니다.",
        )

    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        marker.title = _clean_title(data["title"])
    if "memo" in data:
        marker.memo = _clean_notes(data["memo"])
    if "marker_date" in data and data["marker_date"] is not None:
        marker.marker_date = data["marker_date"]
    if "is_dday" in data and data["is_dday"] is not None:
        marker.is_dday = bool(data["is_dday"])
    if "pinned" in data and data["pinned"] is not None:
        marker.pinned = bool(data["pinned"])
    if "interval_days" in data:
        marker.interval_days = data["interval_days"]

    _normalize_date_marker(marker)
    db.commit()
    db.refresh(marker)
    return _date_marker_dict(marker)


def delete_date_marker(
    db: Session,
    marker_id: int,
    user_id: int,
) -> dict[str, Any]:
    marker = (
        db.query(BookmarkDateMarker)
        .filter(
            BookmarkDateMarker.id == marker_id,
            BookmarkDateMarker.user_id == user_id,
        )
        .first()
    )
    if marker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="날짜 마커를 찾을 수 없습니다.",
        )
    db.delete(marker)
    db.commit()
    return {"success": True}
