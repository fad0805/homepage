"""Date markers and D-days for the planner calendar."""

from .common import *  # noqa: F401,F403


def _marker_char(title: str) -> str:
    cleaned = (title or "").strip()
    return cleaned[:1] if cleaned else "•"


def _clean_intervals(
    values: list[Any] | None,
) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for item in values or []:
        if isinstance(item, dict):
            unit = item.get("unit")
            value = item.get("value")
        else:
            unit = getattr(item, "unit", None)
            value = getattr(item, "value", None)
        if unit not in ("day", "year"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="지원하지 않는 달력 표시 간격입니다.",
            )
        try:
            amount = int(value)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="달력 표시 간격을 숫자로 입력해주세요.",
            ) from None
        if amount < 1 or amount > 3650:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="달력 표시 간격은 1 이상 3650 이하로 입력해주세요.",
            )
        key = (unit, amount)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({"unit": unit, "value": amount})
    return cleaned


def _date_marker_dict(marker: BookmarkDateMarker) -> dict[str, Any]:
    return {
        "id": marker.id,
        "title": marker.title,
        "memo": marker.memo,
        "marker_date": marker.marker_date,
        "is_dday": bool(marker.is_dday),
        "pinned": bool(marker.pinned),
        "intervals": marker.intervals or [],
        "marker": _marker_char(marker.title),
        "created_at": marker.created_at,
        "updated_at": marker.updated_at,
    }


def _normalize_date_marker(
    marker: BookmarkDateMarker,
) -> None:
    if not marker.is_dday:
        marker.pinned = False
        marker.intervals = []
    else:
        marker.intervals = marker.intervals or []


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
        intervals=_clean_intervals(payload.intervals),
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
    if "intervals" in data:
        marker.intervals = _clean_intervals(data["intervals"])

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
