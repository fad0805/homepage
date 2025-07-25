from sqlalchemy.orm import Session

from models.links import Link, Category
from schemas.links import LinkCreate, LinkUpdate, Category as CategorySchema


# Link CRUD Operations
def get_all_links(db: Session):
    """
    Get all links from the database.
    """
    results = db.query(Link, Category).join(Category, Link.category == Category.id).all()
    links = [
        {
            "id": link.id,
            "name": link.name,
            "banner_url": link.banner_url,
            "url": link.url,
            "order": link.order,
            "category": {
                "id": category.id,
                "name": category.name,
                "order": category.order
            }
        } for link, category in results
    ]
    return links


def create_link(db: Session, link: LinkCreate):
    """
    Create a new link in the database.
    """
    db_link = Link(**link.dict())
    db.add(db_link)
    db.commit()
    db.refresh(db_link)
    return link


def update_link(db: Session, link_id: int, updated_link: LinkUpdate):
    """
    Update an existing link in the database.
    """
    db.query(Link).filter(Link.id == link_id).update(updated_link.dict())
    db.commit()
    return db.query(Link).filter(Link.id == link_id).first()


def delete_link(db: Session, link_id: int):
    """
    Delete a link from the database.
    """
    db.query(Link).filter(Link.id == link_id).delete()
    db.commit()
    return True



# Link Categories CRUD Operations
def create_link_category(db: Session, category: Category):
    """
    Create a new category in the database.
    """
    db_category = Category(**category.dict())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return category


def update_link_category(db: Session, category_id: int, updated_category: CategorySchema):
    """
    Update an existing category in the database.
    """
    db.query(Category).filter(Category.id == category_id).update(updated_category.dict())
    db.commit()
    return db.query(Category).filter(Category.id == category_id).first()


def delete_link_category(db: Session, category_id: int):
    """
    Delete a category from the database.
    """
    db.query(Category).filter(Category.id == category_id).delete()
    db.commit()
    return True
