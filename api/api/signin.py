from fastapi import APIRouter, Depends, HTTPException
from fastapi import Form
from sqlalchemy.orm import Session

from db.session import get_db

router = APIRouter()

@router.post("/")
@router.post("")
async def signin(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """
    Endpoint to handle user login.
    This is a placeholder implementation.
    """
    print(f"Login attempt with username: {username} and password: {password}")
    return {"message": "Login successful", "username": username}
