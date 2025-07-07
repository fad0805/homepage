from fastapi import APIRouter, Depends, HTTPException
from fastapi import Form
from sqlalchemy.orm import Session

from api.utils import hash_password, verify_password
from crud.users import get_user, create_user
from db.session import get_db
from schemas.users import UserCreate

router = APIRouter()

@router.post("/signin")
async def signin(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """
    Endpoint to handle user login.
    This is a placeholder implementation.
    """

    hashed_password = get_user(db, username).hashed_password
    verified = verify_password(password, hashed_password)

    if not verified:
        raise HTTPException(status_code=400, detail="Invalid username or password")

    return {"message": "Login successful", "username": username}


@router.post("/signup")
def signup(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """
    Endpoint to handle user registration.
    This is a placeholder implementation.
    """
    hashed_password = hash_password(password)

    try:
        existing_user = get_user(db, username)
    except ValueError:
        existing_user = None
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = UserCreate(username=username, hashed_password=hashed_password)
    user = create_user(db, new_user)

    return {"message": "User created successfully", "user": user.username}
