from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi import Form
from sqlalchemy.orm import Session

from api.utils import hash_password, verify_password, \
    create_access_token, create_refresh_token
from crud.users import get_user, create_user, update_user
from db.session import get_db
from schemas.users import UserCreate, UserRefreshToken

router = APIRouter()

@router.post("/signin")
async def signin(
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Endpoint to handle user login.
    This is a placeholder implementation.
    """

    hashed_password = get_user(db, username).hashed_password
    verified = verify_password(password, hashed_password)

    if not verified:
        raise HTTPException(status_code=400, detail="Invalid username or password")

    access_token = create_access_token(data={"sub": username})
    refresh_token = create_refresh_token(data={"sub": username})

    new_user = UserRefreshToken(refresh_token=refresh_token)
    result = update_user(db, username, new_user)

    if not result:
        raise HTTPException(status_code=500, detail="Failed to update user refresh token")

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="Strict"
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="Strict"
    )

    return {"message": "Login successful"}


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
