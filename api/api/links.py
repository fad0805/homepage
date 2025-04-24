from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from crud.links import get_all_links, create_link, update_link, delete_link, \
    create_link_category, update_link_category, delete_link_category
from schemas.links import LinkCreate, LinkUpdate, Category

router = APIRouter()

@router.get("/")
def get_links(db: Session = Depends(get_db)):
    """
    Get all links.
    """
    return get_all_links(db)


@router.post("/")
def post_link(link: LinkCreate, db: Session = Depends(get_db)):
    """
    Create a new link.
    """
    return create_link(db, link)


@router.put("/{link_id}")
def modify_link(link_id: int, link: LinkUpdate, db: Session = Depends(get_db)):
    """
    Update an existing link.
    """
    return update_link(db, link_id, link)


@router.delete("/{link_id}")
def remove_link(link_id: int, db: Session = Depends(get_db)):
    """
    Delete a link.
    """
    return delete_link(db, link_id)


@router.post("/categories/")
def post_link_category(category: Category, db: Session = Depends(get_db)):
    """
    Create a new link category.
    """
    return create_link_category(db, category)


@router.put("/categories/{category_id}")
def modify_link_category(category_id: int, category: Category, db: Session = Depends(get_db)):
    """
    Update an existing link category.
    """
    return update_link_category(db, category_id, category)


@router.delete("/categories/{category_id}")
def remove_link_category(category_id: int, db: Session = Depends(get_db)):
    """
    Delete a link category.
    """
    return delete_link_category(db, category_id)
