from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.uploads import delete_replaced_upload, delete_uploaded_file
from models.links import Link, Category
from schemas.links import (
    LinkCreate,
    LinkUpdate,
    Category as CategorySchema,
    ReorderRequest,
    CategoryReorderRequest,
)


def _serialize_link(link: Link) -> dict:
    category = link.category_relation
    return {
        "id": link.id,
        "user_id": link.user_id,
        "owner": link.user.username if link.user else link.owner,
        "name": link.name,
        "banner_url": link.banner_url,
        "url": link.url,
        "order": link.order,
        "description": link.description,
        "created_at": link.created_at,
        "updated_at": link.updated_at,
        "category": {
            "id": category.id,
            "name": category.name,
            "banner_url": category.banner_url,
            "description": category.description,
            "is_special": category.is_special,
            "order": category.order,
        } if category else None,
    }


def _serialize_category(category: Category) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "banner_url": category.banner_url,
        "description": category.description,
        "is_special": category.is_special,
        "order": category.order,
    }


def _next_link_order(db: Session, category_id: int) -> int:
    max_order = (
        db.query(func.max(Link.order))
        .filter(Link.category == category_id)
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


def _next_category_order(db: Session, user_id: int) -> int:
    max_order = (
        db.query(func.max(Category.order))
        .filter(Category.user_id == user_id)
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


def _clear_other_special_categories(
    db: Session,
    user_id: int,
    category_id: int | None = None,
) -> None:
    query = db.query(Category).filter(
        Category.user_id == user_id,
        Category.is_special.is_(True),
    )
    if category_id is not None:
        query = query.filter(Category.id != category_id)
    query.update(
        {Category.is_special: False},
        synchronize_session=False,
    )


def _get_link_category_or_404(
    db: Session,
    category_id: int,
    user_id: int,
    *,
    allow_special: bool = True,
) -> Category:
    category = (
        db.query(Category)
        .filter(
            Category.id == category_id,
            Category.user_id == user_id,
        )
        .first()
    )
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link's category",
        )
    if category.is_special and not allow_special:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="배너 소개 카테고리에는 링크를 추가할 수 없습니다.",
        )
    return category


# Link CRUD Operations
def get_all_links(
    db: Session,
    user_id: int | None = None,
    owner: str | None = None,
):
    """
    Get all links, or only one author's links.
    """
    query = (
        db.query(Link)
        .join(Category, Link.category == Category.id)
        .order_by(Category.order, Category.id, Link.order, Link.id)
    )
    if user_id is not None:
        query = query.filter(Link.user_id == user_id)
    elif owner is not None:
        query = query.filter(Link.owner == owner)
    return [_serialize_link(link) for link in query.all()]


def get_link(
    db: Session,
    link_id: int,
    user_id: int | None = None,
    owner: str | None = None,
):
    """
    Get a single link, optionally scoped to one author.
    """
    query = db.query(Link).filter(Link.id == link_id)
    if user_id is not None:
        query = query.filter(Link.user_id == user_id)
    elif owner is not None:
        query = query.filter(Link.owner == owner)
    link = query.first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link",
        )
    return _serialize_link(link)


def create_link(
    db: Session,
    link: LinkCreate,
    user_id: int,
    owner: str | None = None,
):
    """
    Create a new link owned by the signed-in author.
    """
    _get_link_category_or_404(db, link.category, user_id, allow_special=False)
    data = link.model_dump(exclude={"owner", "order"})
    data["user_id"] = user_id
    data["owner"] = owner or "admin"
    data["order"] = (
        link.order
        if link.order is not None
        else _next_link_order(db, link.category)
    )

    db_link = Link(**data)
    db.add(db_link)
    db.commit()
    db.refresh(db_link)
    return _serialize_link(db_link)


def update_link(
    db: Session,
    link_id: int,
    updated_link: LinkUpdate,
    user_id: int,
):
    """
    Update one of the signed-in author's links.
    """
    link = (
        db.query(Link)
        .filter(
            Link.id == link_id,
            Link.user_id == user_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link",
        )

    old_banner_url = link.banner_url

    data = updated_link.model_dump(exclude_unset=True)
    if "category" in data:
        _get_link_category_or_404(
            db, data["category"], user_id, allow_special=False
        )
    if (
        "category" in data
        and "order" not in data
        and data["category"] != link.category
    ):
        data["order"] = _next_link_order(db, data["category"])

    for key, value in data.items():
        setattr(link, key, value)

    db.commit()
    db.refresh(link)

    if (
        old_banner_url
        and "banner_url" in data
        and old_banner_url != link.banner_url
    ):
        still_used = (
            db.query(Link).filter(Link.banner_url == old_banner_url).first()
        )
        if not still_used:
            delete_replaced_upload(old_banner_url, link.banner_url)

    return _serialize_link(link)


def delete_link(
    db: Session,
    link_id: int,
    user_id: int | None = None,
):
    """
    Delete a link. Administrators may delete any author's link.
    """
    query = db.query(Link).filter(Link.id == link_id)
    if user_id is not None:
        query = query.filter(Link.user_id == user_id)
    link = query.first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link",
        )

    banner_url = link.banner_url
    db.delete(link)
    db.commit()

    if banner_url:
        still_used = (
            db.query(Link).filter(Link.banner_url == banner_url).first()
        )
        if not still_used:
            delete_uploaded_file(banner_url)

    return True


def reorder_links(
    db: Session,
    payload: ReorderRequest,
    user_id: int,
):
    """
    Persist the order of the author's links.
    """
    ids = [item.id for item in payload.items]
    links = {
        link.id: link
        for link in (
            db.query(Link)
            .filter(
                Link.id.in_(ids),
                Link.user_id == user_id,
            )
            .all()
        )
    }

    missing = set(ids) - set(links)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist link: {sorted(missing)}",
        )

    try:
        for item in payload.items:
            link = links[item.id]
            if item.category is not None:
                _get_link_category_or_404(
                    db, item.category, user_id, allow_special=False
                )
                link.category = item.category
            link.order = item.order
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True


# Link Categories CRUD Operations
def get_all_link_categories(db: Session, user_id: int):
    """
    Get the signed-in author's link categories.
    """
    categories = (
        db.query(Category)
        .filter(Category.user_id == user_id)
        .order_by(Category.order, Category.id)
        .all()
    )
    return [_serialize_category(category) for category in categories]


def create_link_category(
    db: Session,
    category: CategorySchema,
    user_id: int,
):
    """
    Create a new category owned by the signed-in author.
    """
    order = (
        category.order
        if category.order is not None
        else _next_category_order(db, user_id)
    )
    if category.is_special:
        _clear_other_special_categories(db, user_id)
    db_category = Category(
        user_id=user_id,
        name=category.name,
        banner_url=category.banner_url,
        description=category.description,
        is_special=category.is_special,
        order=order,
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return _serialize_category(db_category)


def update_link_category(
    db: Session,
    category_id: int,
    updated_category: CategorySchema,
    user_id: int,
):
    """
    Update one of the signed-in author's categories.
    """
    category = _get_link_category_or_404(db, category_id, user_id)
    old_banner_url = category.banner_url

    data = updated_category.model_dump(exclude_unset=True)
    is_special = data.get("is_special", category.is_special)
    if is_special and not category.is_special:
        link_count = (
            db.query(Link).filter(Link.category == category_id).count()
        )
        if link_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "링크가 있는 카테고리는 배너 소개 카테고리로 "
                    "변경할 수 없습니다."
                ),
            )
    if is_special:
        _clear_other_special_categories(db, user_id, category_id)

    for key, value in data.items():
        setattr(category, key, value)

    db.commit()
    db.refresh(category)

    if (
        old_banner_url
        and "banner_url" in data
        and old_banner_url != category.banner_url
    ):
        delete_replaced_upload(old_banner_url, category.banner_url)

    return _serialize_category(category)


def delete_link_category(
    db: Session,
    category_id: int,
    user_id: int,
):
    """
    Delete one of the signed-in author's categories.
    """
    category = _get_link_category_or_404(db, category_id, user_id)

    link_count = db.query(Link).filter(Link.category == category_id).count()
    if link_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "이 카테고리에 링크가 남아 있어 삭제할 수 없습니다. "
                "링크를 먼저 다른 카테고리로 옮기거나 삭제해주세요."
            ),
        )

    banner_url = category.banner_url
    db.delete(category)
    db.commit()
    if banner_url:
        delete_uploaded_file(banner_url)
    return True


def reorder_link_categories(
    db: Session,
    payload: CategoryReorderRequest,
    user_id: int,
):
    """
    Persist the order of the signed-in author's categories.
    """
    ids = [item.id for item in payload.items]
    categories = {
        category.id: category
        for category in (
            db.query(Category)
            .filter(
                Category.id.in_(ids),
                Category.user_id == user_id,
            )
            .all()
        )
    }

    missing = set(ids) - set(categories)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Does not exist link's category: {sorted(missing)}",
        )

    try:
        for item in payload.items:
            categories[item.id].order = item.order
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True
