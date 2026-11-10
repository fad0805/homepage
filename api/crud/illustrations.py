from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from core.uploads import delete_replaced_upload, delete_uploaded_file
from models.illustrations import Illustration, IllustrationImage
from schemas.illustrations import (
    IllustrationBulkUpdate,
    IllustrationImageReorderRequest,
    IllustrationReorderRequest,
    IllustrationUpdate,
)


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
        "original_name": image.original_name,
        "order": image.order,
    }


def _serialize_summary(illustration: Illustration) -> dict:
    representative = _representative_image(illustration)
    representative_url = illustration.representative_url or (
        representative.url if representative else None
    )
    representative_original_name = (
        illustration.representative_original_name
        or (representative.original_name if representative else None)
    )
    return {
        "id": illustration.id,
        "title": illustration.title,
        "description": illustration.description,
        "taken_at": illustration.taken_at,
        "visible": illustration.visible,
        "representative_image_id": (
            representative.id if representative else None
        ),
        "representative_url": representative_url,
        "representative_original_name": representative_original_name,
        "image_count": len(illustration.images or []),
        "order": illustration.order,
        "created_at": illustration.created_at,
        "updated_at": illustration.updated_at,
    }


def _serialize_detail(illustration: Illustration) -> dict:
    data = _serialize_summary(illustration)
    data["images"] = [
        _serialize_image(image) for image in (illustration.images or [])
    ]
    return data


def _group_query(db: Session):
    return db.query(Illustration).options(selectinload(Illustration.images))


def get_visible_illustrations(db: Session):
    """Return only public illustration groups."""
    illustrations = (
        _group_query(db)
        .filter(Illustration.visible.is_(True))
        .order_by(
            Illustration.order.asc(),
            Illustration.created_at.desc(),
            Illustration.id.desc(),
        )
        .all()
    )
    return [_serialize_summary(illustration) for illustration in illustrations]


def get_visible_illustration(db: Session, illustration_id: int):
    """Return a single public illustration group, or 404 when hidden."""
    illustration = (
        _group_query(db)
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
    return _serialize_detail(illustration)


def get_all_illustrations(db: Session):
    """Return every illustration group for the admin board."""
    illustrations = (
        _group_query(db)
        .order_by(
            Illustration.order.asc(),
            Illustration.created_at.desc(),
            Illustration.id.desc(),
        )
        .all()
    )
    return [_serialize_detail(illustration) for illustration in illustrations]


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
    uploads: list[tuple[str, str | None]],
    start_order: int = 0,
) -> list[IllustrationImage]:
    return [
        IllustrationImage(
            url=url,
            original_name=original_name,
            order=start_order + index,
        )
        for index, (url, original_name) in enumerate(uploads)
    ]


def _next_illustration_order(db: Session) -> int:
    """Place a newly uploaded illustration above the current list."""
    minimum = db.query(func.min(Illustration.order)).scalar()
    return 0 if minimum is None else minimum - 1


def create_illustration_group(
    db: Session,
    owner: str,
    title: str,
    uploads: list[tuple[str, str | None]],
    description: str | None = None,
    taken_at: date | None = None,
    representative_index: int = 0,
):
    """Create one illustration group from a batch of images."""
    group = Illustration(
        owner=owner,
        title=title,
        description=description,
        taken_at=taken_at,
        visible=True,
        order=_next_illustration_order(db),
        images=_build_images(uploads),
    )
    try:
        db.add(group)
        db.flush()

        images = group.images or []
        if images:
            index = min(max(representative_index, 0), len(images) - 1)
            group.representative_image_id = images[index].id

        db.commit()
    except Exception:
        db.rollback()
        raise

    return _serialize_detail(_get_illustration_or_404(db, group.id))


def append_illustration_images(
    db: Session,
    illustration_id: int,
    uploads: list[tuple[str, str | None]],
):
    """Add more uploaded images to an existing illustration group."""
    group = _get_illustration_or_404(db, illustration_id)
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
    original_name: str | None,
):
    """Replace an illustration's separately uploaded representative image."""
    illustration = _get_illustration_or_404(db, illustration_id)
    old_url = illustration.representative_url

    illustration.representative_url = url
    illustration.representative_original_name = original_name

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
            illustration.representative_original_name = None

    for key, value in data.items():
        setattr(illustration, key, value)

    db.commit()
    db.refresh(illustration)
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
):
    """Persist the display order of illustration groups."""
    ids = [item.id for item in payload.items]
    illustrations = {
        illustration.id: illustration
        for illustration in db.query(Illustration)
        .filter(Illustration.id.in_(ids))
        .all()
    }

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
):
    """Apply visibility or shooting date changes to many groups at once."""
    ids = set(payload.ids)
    if not ids:
        return 0

    data = payload.model_dump(
        exclude_unset=True,
        exclude={"ids"},
    )
    illustrations = (
        db.query(Illustration)
        .filter(Illustration.id.in_(ids))
        .all()
    )
    if not illustrations:
        return 0

    for illustration in illustrations:
        if "visible" in data and data["visible"] is not None:
            illustration.visible = data["visible"]
        if "taken_at" in data:
            illustration.taken_at = data["taken_at"]

    db.commit()
    return len(illustrations)


def bulk_delete_illustrations(db: Session, ids: list[int]):
    """Delete several illustration groups and all their files."""
    selected_ids = set(ids)
    if not selected_ids:
        return 0

    illustrations = (
        _group_query(db)
        .filter(Illustration.id.in_(selected_ids))
        .all()
    )
    if not illustrations:
        return 0

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
    urls = [image.url for image in illustration.images]
    if illustration.representative_url:
        urls.append(illustration.representative_url)

    db.delete(illustration)
    db.commit()

    for url in urls:
        delete_uploaded_file(url)
    return True
