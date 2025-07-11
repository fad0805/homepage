from sqlalchemy.orm import Session

from models.users import User
from schemas.users import UserCreate, UserUpdate, UserSigninHistory


def get_user(db: Session, username: str):
    """
    Get user from the database
    """
    query = db.query(User).filter(User.username == username)
    user = query.first()
    if not user:
        raise ValueError("User not found")
    return user


def create_user(db: Session, user: UserCreate):
    """
    Create a new user in the database
    """
    db_user = User(**user.dict())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return get_user(db, user.username)


def update_user(db: Session, username: str, user_update: UserUpdate):
    """
    Update an existing user in the database
    """
    user = get_user(db, username)
    for key, value in user_update.dict(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return True if user else False
