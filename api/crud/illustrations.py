import os
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import false, func, or_
from sqlalchemy.orm import Session, selectinload

from core.audit import queue_illustration_history
from core.mastodon import maybe_notify_illustration
from core.search import like_pattern, search_tokens
from core.uploads import delete_replaced_upload, delete_uploaded_file
from crud.tags import sync_illustration_tags
from models.illustrations import (
    Illustration,
    IllustrationImage,
    IllustrationView,
)
from models.tags import IllustrationTag, Tag
from schemas.illustrations import (
    IllustrationBulkUpdate,
    IllustrationImageReorderRequest,
    IllustrationReorderRequest,
    IllustrationUpdate,
)

ILLUSTRATION_VIEW_DEDUP_MINUTES = int(
    os.getenv("ILLUSTRATION_VIEW_DEDUP_MINUTES", "60")
)


def _ready_upload_filter():
    """Exclude illustrations whose files are still being saved.

    ``NULL`` is treated as ready so rows created before the status column
    remain visible after the migration.
    """
    return or_(
        Illustration.upload_status.is_(None),
        Illustration.upload_status == "ready",
    )


def _has_image_filter():
    """Keep rows with no stored image in the admin list only."""
    return or_(
        Illustration.images.any(),
        Illustration.representative_url.isnot(None),
    )


def _ensure_editable(illustration: Illustration) -> None:
    """Block edits while the background upload still owns the row."""
    if illustration.upload_status == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미지 업로드가 완료된 뒤 이용할 수 있습니다.",
        )


def _clean_tags(tags: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for tag in tags or []:
        value = tag.strip()[:255]
        key = value.lower()
        if value and key not in seen:
            seen.add(key)
            cleaned.append(value)
    return cleaned[:20]


def _representative_image(
    illustration: Illustration,
) -> IllustrationImage | None:
    images = illustration.images or []
    for image in images:
        if image.id == illustration.representative_image_id:
            return image
    return images[0] if images else None


def _serialize_image(image: IllustrationImage) -> dict:
    return {
        "id": image.id,
        "url": image.url,
        "order": image.order,
    }


def _serialize_summary(illustration: Illustration) -> dict:
    representative = _representative_image(illustration)
    representative_url = illustration.representative_url or (
        representative.url if representative else None
    )
    return {
        "id": illustration.id,
        "user_id": illustration.user_id,
        "title": illustration.title,
        "description": illustration.description,
        "tags": illustration.tags or [],
        "taken_at": illustration.taken_at,
        "visible": illustration.visible,
        "protected": bool(illustration.protected),
        "upload_status": illustration.upload_status or "ready",
        "view_count": illustration.view_count or 0,
        "representative_image_id": (
            representative.id if representative else None
        ),
        "representative_url": representative_url,
        "image_count": len(illustration.images or []),
        "order": illustration.order,
        "created_at": illustration.created_at,
        "updated_at": illustration.updated_at,
    }


def _serialize_list_item(
    illustration: Illustration,
    locked: bool = False,
) -> dict:
    """Serialize a list row without touching the image relationship.

    Image count and representative image are filled in afterwards for the
    whole page in one batch (see ``_attach_list_image_info``).
    """
    return {
        "id": illustration.id,
        "user_id": illustration.user_id,
        "title": illustration.title,
        "description": illustration.description,
        "tags": illustration.tags or [],
        "taken_at": illustration.taken_at,
        "visible": illustration.visible,
        "protected": bool(illustration.protected),
        "upload_status": illustration.upload_status or "ready",
        "view_count": illustration.view_count or 0,
        "representative_image_id": illustration.representative_image_id,
        "representative_url": illustration.representative_url,
        "image_count": 0,
        "order": illustration.order,
        "created_at": illustration.created_at,
        "updated_at": illustration.updated_at,
        "locked": locked,
    }


def _attach_list_image_info(db: Session, items: list[dict]) -> None:
    """Add representative image and count for a page of illustration rows."""
    ids = [item["id"] for item in items]
    if not ids:
        return

    counts = dict(
        db.query(
            IllustrationImage.illustration_id,
            func.count(IllustrationImage.id),
        )
        .filter(IllustrationImage.illustration_id.in_(ids))
        .group_by(IllustrationImage.illustration_id)
        .all()
    )

    representatives: dict[int, dict] = {}
    explicit_ids = [
        item["representative_image_id"]
        for item in items
        if item.get("representative_image_id")
    ]
    if explicit_ids:
        for image in (
            db.query(IllustrationImage)
            .filter(IllustrationImage.id.in_(explicit_ids))
            .all()
        ):
            representatives[image.illustration_id] = {
                "id": image.id,
                "url": image.url,
            }

    missing_ids = [illustration_id for illustration_id in ids if illustration_id not in representatives]
    if missing_ids:
        ranked = (
            db.query(
                IllustrationImage.illustration_id.label("illustration_id"),
                IllustrationImage.id.label("image_id"),
                IllustrationImage.url.label("url"),
                func.row_number()
                .over(
                    partition_by=IllustrationImage.illustration_id,
                    order_by=(
                        IllustrationImage.order,
                        IllustrationImage.id,
                    ),
                )
                .label("position"),
            )
            .filter(IllustrationImage.illustration_id.in_(missing_ids))
            .subquery()
        )
        for row in db.query(ranked).filter(ranked.c.position == 1).all():
            representatives[row.illustration_id] = {
                "id": row.image_id,
                "url": row.url,
            }

    for item in items:
        item["image_count"] = counts.get(item["id"], 0)
        representative = representatives.get(item["id"])
        item["representative_image_id"] = (
            representative["id"] if representative else None
        )
        item["representative_url"] = item.get("representative_url") or (
            representative["url"] if representative else None
        )


def _utc_boundary(value: date, *, end: bool = False) -> datetime:
    """Convert a KST calendar date to its UTC boundary.

    Dates coming from the UI are KST dates, while ``created_at`` is stored as
    naive UTC, so a KST day is shifted by nine hours.
    """
    boundary = datetime.combine(value, time.min) - timedelta(hours=9)
    return boundary + timedelta(days=1) if end else boundary


def _locked_for_viewer(
    illustration: Illustration,
    *,
    viewer_user_id: int | None,
    is_admin_view: bool,
    granted_illustrations: frozenset[int],
) -> bool:
    if not illustration.protected:
        return False
    if is_admin_view:
        return False
    if viewer_user_id is not None and illustration.user_id == viewer_user_id:
        return False
    return illustration.id not in granted_illustrations


def _list_query(
    db: Session,
    *,
    viewer_user_id: int | None,
    include_hidden: bool,
    author_user_id: int | None,
    query: str | None,
    tag: str | None,
    sort: str,
    filter_basis: str,
    date_from: date | None,
    date_to: date | None,
    include_undated: bool,
    include_unpublished: bool = False,
):
    illustrations_query = db.query(Illustration)
    if author_user_id is not None:
        illustrations_query = illustrations_query.filter(
            Illustration.user_id == author_user_id
        )
    if include_hidden and viewer_user_id is None:
        pass
    elif viewer_user_id is None:
        illustrations_query = illustrations_query.filter(
            Illustration.visible.is_(True)
        )
    else:
        illustrations_query = illustrations_query.filter(
            or_(
                Illustration.visible.is_(True),
                Illustration.user_id == viewer_user_id,
            )
        )
    if not include_unpublished:
        illustrations_query = illustrations_query.filter(
            _ready_upload_filter(),
            _has_image_filter(),
        )

    tokens = search_tokens(query)
    for token in tokens:
        pattern = like_pattern(token)
        tag_match = (
            db.query(IllustrationTag.illustration_id)
            .join(Tag, Tag.id == IllustrationTag.tag_id)
            .filter(
                IllustrationTag.illustration_id == Illustration.id,
                Tag.name.ilike(pattern, escape="\\"),
            )
            .exists()
        )
        illustrations_query = illustrations_query.filter(
            or_(
                Illustration.title.ilike(pattern, escape="\\"),
                tag_match,
            )
        )

    if tag is not None:
        normalized = tag.strip().lower()
        if not normalized:
            illustrations_query = illustrations_query.filter(false())
        else:
            illustrations_query = illustrations_query.filter(
                db.query(IllustrationTag.illustration_id)
                .join(Tag, Tag.id == IllustrationTag.tag_id)
                .filter(
                    IllustrationTag.illustration_id == Illustration.id,
                    Tag.normalized_name == normalized,
                )
                .exists()
            )

    if filter_basis == "created":
        if date_from:
            illustrations_query = illustrations_query.filter(
                Illustration.created_at >= _utc_boundary(date_from)
            )
        if date_to:
            illustrations_query = illustrations_query.filter(
                Illustration.created_at < _utc_boundary(date_to, end=True)
            )
    else:
        if date_from:
            illustrations_query = illustrations_query.filter(
                Illustration.taken_at >= date_from
            )
            if not include_undated:
                illustrations_query = illustrations_query.filter(
                    Illustration.taken_at.isnot(None)
                )
        if date_to:
            illustrations_query = illustrations_query.filter(
                Illustration.taken_at <= date_to
            )

    if sort == "created":
        order_by = (
            Illustration.created_at.desc().nullslast(),
            Illustration.id.desc(),
        )
    elif sort == "order":
        order_by = (
            Illustration.order.asc(),
            Illustration.created_at.desc(),
            Illustration.id.desc(),
        )
    else:
        order_by = (
            Illustration.taken_at.desc().nullslast(),
            Illustration.created_at.desc().nullslast(),
            Illustration.id.desc(),
        )
    return illustrations_query.order_by(*order_by)


def _serialize_detail(
    illustration: Illustration,
    locked: bool = False,
) -> dict:
    data = _serialize_summary(illustration)
    data["locked"] = locked
    data["images"] = (
        []
        if locked
        else [
            _serialize_image(image)
            for image in (illustration.images or [])
        ]
    )
    return data


def _group_query(db: Session):
    return db.query(Illustration).options(selectinload(Illustration.images))


def get_visible_illustrations(
    db: Session,
    viewer_user_id: int | None = None,
    include_hidden: bool = False,
    query: str | None = None,
    tag: str | None = None,
    *,
    author_user_id: int | None = None,
    granted_illustrations: frozenset[int] = frozenset(),
    sort: str = "taken",
    filter_basis: str = "taken",
    date_from: date | None = None,
    date_to: date | None = None,
    include_undated: bool = True,
    page: int = 1,
    page_size: int = 12,
    include_unpublished: bool = False,
) -> tuple[list[dict], int]:
    """Return one page of visible groups plus the total matching count."""
    illustrations_query = _list_query(
        db,
        viewer_user_id=viewer_user_id,
        include_hidden=include_hidden,
        author_user_id=author_user_id,
        query=query,
        tag=tag,
        sort=sort,
        filter_basis=filter_basis,
        date_from=date_from,
        date_to=date_to,
        include_undated=include_undated,
        include_unpublished=include_unpublished,
    )
    total = illustrations_query.count()
    illustrations = (
        illustrations_query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    is_admin_view = include_hidden and viewer_user_id is None
    items = [
        _serialize_list_item(
            illustration,
            locked=_locked_for_viewer(
                illustration,
                viewer_user_id=viewer_user_id,
                is_admin_view=is_admin_view,
                granted_illustrations=granted_illustrations,
            ),
        )
        for illustration in illustrations
    ]
    _attach_list_image_info(db, items)
    return items, total


def get_visible_illustration(
    db: Session,
    illustration_id: int,
    *,
    include_hidden: bool = False,
    granted_illustrations: frozenset[int] = frozenset(),
    viewer_user_id: int | None = None,
    owner_user_id: int | None = None,
    include_unpublished: bool = False,
):
    """Return one illustration, masking its images while it stays locked."""
    query = _group_query(db).filter(Illustration.id == illustration_id)
    if not include_unpublished:
        query = query.filter(_ready_upload_filter(), _has_image_filter())
    if owner_user_id is not None:
        query = query.filter(Illustration.user_id == owner_user_id)
    elif not include_hidden:
        query = query.filter(Illustration.visible.is_(True))
    elif viewer_user_id is not None:
        query = query.filter(
            or_(
                Illustration.visible.is_(True),
                Illustration.user_id == viewer_user_id,
            )
        )
    illustration = query.first()
    if not illustration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="삽화를 찾을 수 없습니다.",
        )

    is_admin_view = (
        include_hidden
        and owner_user_id is None
        and viewer_user_id is None
    )
    is_owner = (
        is_admin_view
        or owner_user_id is not None
        or (
            viewer_user_id is not None
            and illustration.user_id == viewer_user_id
        )
    )
    locked = (
        bool(illustration.protected)
        and not is_owner
        and illustration.id not in granted_illustrations
    )
    return _serialize_detail(illustration, locked=locked)


def get_all_illustrations(
    db: Session,
    owner_user_id: int | None,
    *,
    query: str | None = None,
    page: int = 1,
    page_size: int = 12,
) -> tuple[list[dict], int]:
    """Return one page of admin list rows plus the total matching count."""
    illustrations_query = _list_query(
        db,
        viewer_user_id=owner_user_id,
        include_hidden=True,
        author_user_id=owner_user_id,
        query=query,
        tag=None,
        sort="order",
        filter_basis="taken",
        date_from=None,
        date_to=None,
        include_undated=True,
        include_unpublished=True,
    )
    total = illustrations_query.count()
    illustrations = (
        illustrations_query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [_serialize_list_item(illustration) for illustration in illustrations]
    _attach_list_image_info(db, items)
    return items, total


def get_popular_illustrations(
    db: Session,
    owner_user_id: int | None,
    *,
    limit: int = 10,
) -> list[dict]:
    """Return the most viewed illustrations for the dashboard ranking."""
    illustrations_query = _list_query(
        db,
        viewer_user_id=owner_user_id,
        include_hidden=True,
        author_user_id=owner_user_id,
        query=None,
        tag=None,
        sort="order",
        filter_basis="taken",
        date_from=None,
        date_to=None,
        include_undated=True,
        include_unpublished=True,
    )
    illustrations = (
        illustrations_query.order_by(None)
        .order_by(
            Illustration.view_count.desc().nullslast(),
            Illustration.id.desc(),
        )
        .limit(limit)
        .all()
    )
    items = [
        _serialize_list_item(illustration)
        for illustration in illustrations
    ]
    _attach_list_image_info(db, items)
    return items


def get_illustration_stats(
    db: Session,
    owner_user_id: int | None,
) -> dict:
    """Return illustration totals and accumulated views for the dashboard."""
    illustrations_query = _list_query(
        db,
        viewer_user_id=owner_user_id,
        include_hidden=True,
        author_user_id=owner_user_id,
        query=None,
        tag=None,
        sort="order",
        filter_basis="taken",
        date_from=None,
        date_to=None,
        include_undated=True,
        include_unpublished=True,
    )
    count = illustrations_query.order_by(None).count()
    visible = (
        illustrations_query.order_by(None)
        .filter(Illustration.visible.is_(True))
        .count()
    )
    total_views = (
        illustrations_query.order_by(None)
        .with_entities(
            func.coalesce(func.sum(Illustration.view_count), 0)
        )
        .scalar()
        or 0
    )
    return {
        "count": count,
        "visible": visible,
        "total_views": int(total_views),
    }


def _get_illustration_or_404(db: Session, illustration_id: int):
    illustration = (
        _group_query(db)
        .filter(Illustration.id == illustration_id)
        .first()
    )
    if not illustration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="삽화를 찾을 수 없습니다.",
        )
    return illustration


def _build_images(
    uploads: list[str],
    start_order: int = 0,
) -> list[IllustrationImage]:
    return [
        IllustrationImage(
            url=url,
            order=start_order + index,
        )
        for index, url in enumerate(uploads)
    ]


def _next_illustration_order(db: Session) -> int:
    """Place a newly uploaded illustration above the current list."""
    minimum = db.query(func.min(Illustration.order)).scalar()
    return 0 if minimum is None else minimum - 1


def create_pending_illustration_group(
    db: Session,
    *,
    user_id: int,
    title: str,
    description: str | None = None,
    tags: list[str] | None = None,
    taken_at: date | None = None,
    visible: bool = True,
    protected: bool = False,
):
    """Register the admin row before its files finish uploading."""
    group = Illustration(
        user_id=user_id,
        title=title,
        description=description,
        tags=_clean_tags(tags),
        taken_at=taken_at,
        visible=visible,
        protected=bool(visible and protected),
        order=_next_illustration_order(db),
        images=[],
        upload_status="processing",
    )
    try:
        db.add(group)
        db.flush()
        sync_illustration_tags(db, group)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return _serialize_detail(_get_illustration_or_404(db, group.id))


def finish_illustration_upload(
    db: Session,
    illustration_id: int,
    uploads: list[str],
    representative_url: str | None = None,
    *,
    queue_history: bool = True,
):
    """Attach background-saved files and publish the illustration row."""
    group = _get_illustration_or_404(db, illustration_id)
    start_order = max((image.order for image in group.images), default=-1) + 1
    images = _build_images(uploads, start_order=start_order)
    group.images.extend(images)
    if representative_url:
        group.representative_url = representative_url
    elif group.representative_image_id is None and images:
        group.representative_image_id = images[0].id
    group.upload_status = "ready"
    if queue_history:
        queue_illustration_history(db, group)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return _serialize_detail(_get_illustration_or_404(db, illustration_id))


def append_illustration_images(
    db: Session,
    illustration_id: int,
    uploads: list[str],
):
    """Add more uploaded images to an existing illustration group."""
    group = _get_illustration_or_404(db, illustration_id)
    _ensure_editable(group)
    start_order = max((image.order for image in group.images), default=-1) + 1
    images = _build_images(uploads, start_order=start_order)

    try:
        group.images.extend(images)
        if group.representative_image_id is None and images:
            group.representative_image_id = images[0].id
        db.commit()
    except Exception:
        db.rollback()
        raise

    return _serialize_detail(
        _get_illustration_or_404(db, illustration_id)
    )


def set_illustration_representative(
    db: Session,
    illustration_id: int,
    url: str,
):
    """Replace an illustration's separately uploaded representative image."""
    illustration = _get_illustration_or_404(db, illustration_id)
    _ensure_editable(illustration)
    old_url = illustration.representative_url

    illustration.representative_url = url

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    delete_replaced_upload(old_url, url)
    return _serialize_detail(
        _get_illustration_or_404(db, illustration_id)
    )


def update_illustration(
    db: Session,
    illustration_id: int,
    payload: IllustrationUpdate,
):
    illustration = _get_illustration_or_404(db, illustration_id)
    _ensure_editable(illustration)
    was_visible = illustration.visible is not False
    data = payload.model_dump(exclude_unset=True)
    replaced_representative_url: str | None = None

    if "title" in data:
        title = data["title"]
        if not isinstance(title, str) or not title.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="삽화 제목을 입력해주세요.",
            )
        data["title"] = title.strip()

    if "description" in data:
        description = data["description"]
        if isinstance(description, str):
            description = description.strip()
        data["description"] = description or None

    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])

    if "representative_image_id" in data:
        representative_id = data["representative_image_id"]
        if representative_id is not None:
            if not any(
                image.id == representative_id
                for image in illustration.images
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "이 삽화에 속한 이미지만 대표 이미지로 선택할 수 "
                        "있습니다."
                    ),
                )
            # Selecting a gallery image clears the separately uploaded cover.
            replaced_representative_url = illustration.representative_url
            illustration.representative_url = None

    for key, value in data.items():
        setattr(illustration, key, value)

    db.flush()
    sync_illustration_tags(db, illustration)
    became_public = not was_visible and illustration.visible is not False
    visibility_changed = (
        "visible" in data
        and (illustration.visible is not False) != was_visible
    )
    if visibility_changed:
        queue_illustration_history(
            db,
            illustration,
            action="updated",
            changes=[
                {
                    "field": "visible",
                    "kind": "changed",
                    "before": was_visible,
                    "after": illustration.visible is not False,
                }
            ],
        )
    db.commit()
    db.refresh(illustration)
    if became_public:
        maybe_notify_illustration(db, illustration)
    if replaced_representative_url:
        delete_uploaded_file(replaced_representative_url)
    return _serialize_detail(
        _get_illustration_or_404(db, illustration_id)
    )


def delete_illustration_image(
    db: Session,
    illustration_id: int,
    image_id: int,
):
    """Remove one photo from a group and keep the remaining order valid."""
    illustration = _get_illustration_or_404(db, illustration_id)
    _ensure_editable(illustration)
    image = next(
        (item for item in illustration.images if item.id == image_id),
        None,
    )
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="삽화 사진을 찾을 수 없습니다.",
        )

    remaining = [
        item for item in illustration.images if item.id != image_id
    ]
    if not remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="삽화에는 최소 한 장의 사진이 필요합니다.",
        )

    url = image.url
    db.delete(image)
    for index, item in enumerate(remaining):
        item.order = index
    if illustration.representative_image_id == image_id:
        illustration.representative_image_id = remaining[0].id

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    delete_uploaded_file(url)
    return _serialize_detail(
        _get_illustration_or_404(db, illustration_id)
    )


def reorder_illustration_images(
    db: Session,
    illustration_id: int,
    payload: IllustrationImageReorderRequest,
):
    """Persist the order of photos inside one illustration group."""
    illustration = _get_illustration_or_404(db, illustration_id)
    _ensure_editable(illustration)
    images = {
        image.id: image for image in (illustration.images or [])
    }
    ids = [item.id for item in payload.items]
    missing = set(ids) - set(images)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이 삽화에 속하지 않은 이미지가 포함되어 있습니다.",
        )

    try:
        for item in payload.items:
            images[item.id].order = item.order
        db.commit()
    except Exception:
        db.rollback()
        raise

    return _serialize_detail(
        _get_illustration_or_404(db, illustration_id)
    )


def reorder_illustrations(
    db: Session,
    payload: IllustrationReorderRequest,
    owner_user_id: int | None,
):
    """Persist the display order of one user's or every group's order."""
    ids = [item.id for item in payload.items]
    query = db.query(Illustration).filter(Illustration.id.in_(ids))
    if owner_user_id is not None:
        query = query.filter(Illustration.user_id == owner_user_id)
    illustrations = {
        illustration.id: illustration for illustration in query.all()
    }

    for illustration in illustrations.values():
        _ensure_editable(illustration)

    missing = set(ids) - set(illustrations)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"삽화를 찾을 수 없습니다: {sorted(missing)}",
        )

    try:
        for item in payload.items:
            illustrations[item.id].order = item.order
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True


def bulk_update_illustrations(
    db: Session,
    payload: IllustrationBulkUpdate,
    owner_user_id: int | None,
):
    """Apply visibility or shooting date changes to many groups at once."""
    ids = set(payload.ids)
    if not ids:
        return 0

    data = payload.model_dump(
        exclude_unset=True,
        exclude={"ids"},
    )
    query = db.query(Illustration).filter(Illustration.id.in_(ids))
    if owner_user_id is not None:
        query = query.filter(Illustration.user_id == owner_user_id)
    illustrations = query.all()
    if not illustrations:
        return 0
    for illustration in illustrations:
        _ensure_editable(illustration)

    became_visible: list[Illustration] = []
    visibility_changes: list[tuple[Illustration, bool, bool]] = []
    for illustration in illustrations:
        was_visible = illustration.visible is not False
        if "visible" in data and data["visible"] is not None:
            illustration.visible = data["visible"]
        if "protected" in data and data["protected"] is not None:
            illustration.protected = data["protected"]
        if "taken_at" in data:
            illustration.taken_at = data["taken_at"]
        if "tags" in data and data["tags"] is not None:
            illustration.tags = _clean_tags(data["tags"])
        now_visible = illustration.visible is not False
        if was_visible != now_visible:
            visibility_changes.append((illustration, was_visible, now_visible))
        if not was_visible and now_visible:
            became_visible.append(illustration)

    db.flush()
    if "tags" in data:
        for illustration in illustrations:
            sync_illustration_tags(db, illustration)
    for illustration, was_visible, now_visible in visibility_changes:
        queue_illustration_history(
            db,
            illustration,
            action="updated",
            changes=[
                {
                    "field": "visible",
                    "kind": "changed",
                    "before": was_visible,
                    "after": now_visible,
                }
            ],
        )
    db.commit()
    for illustration in became_visible:
        maybe_notify_illustration(db, illustration)
    return len(illustrations)


def bulk_delete_illustrations(
    db: Session,
    ids: list[int],
    owner_user_id: int | None,
):
    """Delete one user's illustration groups and all their files."""
    selected_ids = set(ids)
    if not selected_ids:
        return 0

    query = _group_query(db).filter(Illustration.id.in_(selected_ids))
    if owner_user_id is not None:
        query = query.filter(Illustration.user_id == owner_user_id)
    illustrations = query.all()
    if not illustrations:
        return 0
    for illustration in illustrations:
        _ensure_editable(illustration)

    urls = {
        image.url
        for illustration in illustrations
        for image in (illustration.images or [])
    }
    urls.update(
        illustration.representative_url
        for illustration in illustrations
        if illustration.representative_url
    )
    for illustration in illustrations:
        db.delete(illustration)
    db.commit()

    for url in urls:
        delete_uploaded_file(url)
    return len(illustrations)


def delete_illustration(db: Session, illustration_id: int):
    illustration = _get_illustration_or_404(db, illustration_id)
    _ensure_editable(illustration)
    urls = [image.url for image in illustration.images]
    if illustration.representative_url:
        urls.append(illustration.representative_url)

    db.delete(illustration)
    db.commit()

    for url in urls:
        delete_uploaded_file(url)
    return True


def register_illustration_view(
    db: Session,
    illustration_id: int,
    ip_hash: str,
    count: bool = True,
):
    """Count one public illustration view, deduplicated by IP."""
    illustration = (
        db.query(Illustration)
        .filter(
            Illustration.id == illustration_id,
            Illustration.visible.is_(True),
        )
        .first()
    )
    if not illustration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="삽화를 찾을 수 없습니다.",
        )

    if not count:
        return {"view_count": illustration.view_count or 0}

    now = datetime.utcnow()
    view = (
        db.query(IllustrationView)
        .filter(
            IllustrationView.illustration_id == illustration_id,
            IllustrationView.ip_hash == ip_hash,
        )
        .first()
    )

    counted = False
    if view is None:
        db.add(
            IllustrationView(
                illustration_id=illustration_id,
                ip_hash=ip_hash,
                last_viewed_at=now,
            )
        )
        counted = True
    elif now - view.last_viewed_at >= timedelta(
        minutes=ILLUSTRATION_VIEW_DEDUP_MINUTES
    ):
        view.last_viewed_at = now
        counted = True

    if counted:
        illustration.view_count = (illustration.view_count or 0) + 1
        db.commit()
        db.refresh(illustration)

    return {"view_count": illustration.view_count or 0}
