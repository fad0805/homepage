from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from crud.tags import list_tag_names
from db.session import get_db
from routers.utils import require_auth

router = APIRouter()


@router.get("", response_model=list[str])
def read_tags(
    query: str = Query(default="", max_length=255),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return list_tag_names(db, user.id, query)
