from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from crud.memos import create_memo, delete_memo, get_memos, update_memo
from db.session import get_db
from schemas.memos import MemoCreate, MemoRead, MemoUpdate

from .utils import require_auth

router = APIRouter()


@router.get("", response_model=list[MemoRead])
@router.get("/", response_model=list[MemoRead], include_in_schema=False)
def read_memos(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Get all one-line memos belonging to the current user.
    """
    return get_memos(db, user.username)


@router.post("", response_model=MemoRead)
@router.post("/", response_model=MemoRead, include_in_schema=False)
def add_memo(
    memo: MemoCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Create a one-line memo for the current user.
    """
    return create_memo(db, user.username, memo)


@router.put("/{memo_id}", response_model=MemoRead)
def modify_memo(
    memo_id: int,
    memo: MemoUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Update one of the current user's one-line memos.
    """
    return update_memo(db, user.username, memo_id, memo)


@router.delete("/{memo_id}")
def remove_memo(
    memo_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Delete one of the current user's one-line memos.
    """
    return delete_memo(db, user.username, memo_id)
