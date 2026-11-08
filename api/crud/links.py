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
            "order": category.order,
        } if category else None,
    }


def _serialize_category(category: Category) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "order": category.order,
    }


def _next_link_order(db: Session, category_id: int) -> int:
    max_order = (
        db.query(func.max(Link.order))
        .filter(Link.category == category_id)
        .scalar()
    )
    return 0 if max_order is None else max_order + 1


def _next_category_order(db: Session) -> int:
    max_order = db.query(func.max(Category.order)).scalar()
    return 0 if max_order is None else max_order + 1


# Link CRUD Operations
def get_all_links(db: Session):
    """
    Get all links from the database.
    """
    links = (
        db.query(Link)
        .join(Category, Link.category == Category.id)
        .order_by(Category.order, Category.id, Link.order, Link.id)
        .all()
    )
    return [_serialize_link(link) for link in links]


def get_link(db: Session, link_id: int):
    """
    Get a single link from the database.
    """
    link = db.query(Link).filter(Link.id == link_id).first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link",
        )
    return _serialize_link(link)


def create_link(db: Session, link: LinkCreate, owner: str | None = None):
    """
    Create a new link in the database.
    """
    data = link.model_dump(exclude={"owner", "order"})
    data["owner"] = link.owner or owner or "admin"
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


def update_link(db: Session, link_id: int, updated_link: LinkUpdate):
    """
    Update an existing link in the database.
    """
    link = db.query(Link).filter(Link.id == link_id).first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link",
        )

    old_banner_url = link.banner_url

    data = updated_link.model_dump(exclude_unset=True)
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


def delete_link(db: Session, link_id: int):
    """
    Delete a link from the database.
    """
    link = db.query(Link).filter(Link.id == link_id).first()
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


def reorder_links(db: Session, payload: ReorderRequest):
    """
    Persist the order of multiple links in a single transaction.
    """
    ids = [item.id for item in payload.items]
    links = {
        link.id: link
        for link in db.query(Link).filter(Link.id.in_(ids)).all()
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
                link.category = item.category
            link.order = item.order
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True


# Link Categories CRUD Operations
def get_all_link_categories(db: Session):
    """
    Get all link categories ordered by their display order.
    """
    categories = db.query(Category).order_by(Category.order, Category.id).all()
    return [_serialize_category(category) for category in categories]


def create_link_category(db: Session, category: CategorySchema):
    """
    Create a new category in the database.
    """
    order = (
        category.order
        if category.order is not None
        else _next_category_order(db)
    )
    db_category = Category(name=category.name, order=order)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return _serialize_category(db_category)


def update_link_category(db: Session, category_id: int, updated_category: CategorySchema):
    """
    Update an existing category in the database.
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link's category",
        )

    category.name = updated_category.name
    if updated_category.order is not None:
        category.order = updated_category.order

    db.commit()
    db.refresh(category)
    return _serialize_category(category)


def delete_link_category(db: Session, category_id: int):
    """
    Delete a category from the database.
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist link's category",
        )

    link_count = db.query(Link).filter(Link.category == category_id).count()
    if link_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "이 카테고리에 링크가 남아 있어 삭제할 수 없습니다. "
                "링크를 먼저 다른 카테고리로 옮기거나 삭제해주세요."
            ),
        )

    db.delete(category)
    db.commit()
    return True


def reorder_link_categories(db: Session, payload: CategoryReorderRequest):
    """
    Persist the order of multiple categories in a single transaction.
    """
    ids = [item.id for item in payload.items]
    categories = {
        category.id: category
        for category in db.query(Category).filter(Category.id.in_(ids)).all()
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
