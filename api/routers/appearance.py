from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from crud.appearance import get_public_appearance
from db.session import get_db
from schemas.appearance import AppearanceRead

router = APIRouter()


@router.get("", response_model=AppearanceRead)
@router.get("/", response_model=AppearanceRead, include_in_schema=False)
def read_appearance(db: Session = Depends(get_db)):
    """Return the public site-wide layout."""
    return get_public_appearance(db)
