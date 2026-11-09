from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.memos import Memo
from schemas.memos import MemoCreate, MemoUpdate


def get_memos(db: Session, owner: str):
    """
    Get all one-line memos belonging to the given user.
    """
    return (
        db.query(Memo)
        .filter(Memo.owner == owner)
        .order_by(Memo.created_at.desc(), Memo.id.desc())
        .all()
    )


def _get_owned_memo(db: Session, owner: str, memo_id: int):
    memo = (
        db.query(Memo)
        .filter(Memo.id == memo_id, Memo.owner == owner)
        .first()
    )
    if not memo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="메모를 찾을 수 없습니다.",
        )
    return memo


def create_memo(db: Session, owner: str, memo: MemoCreate):
    """
    Create a one-line memo for the given user.
    """
    content = memo.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="메모 내용을 입력해주세요.",
        )

    db_memo = Memo(owner=owner, content=content)
    db.add(db_memo)
    db.commit()
    db.refresh(db_memo)
    return db_memo


def update_memo(
    db: Session,
    owner: str,
    memo_id: int,
    memo: MemoUpdate,
):
    """
    Update a one-line memo belonging to the given user.
    """
    content = memo.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="메모 내용을 입력해주세요.",
        )

    db_memo = _get_owned_memo(db, owner, memo_id)
    db_memo.content = content
    db.commit()
    db.refresh(db_memo)
    return db_memo


def delete_memo(db: Session, owner: str, memo_id: int):
    """
    Delete a one-line memo belonging to the given user.
    """
    db_memo = _get_owned_memo(db, owner, memo_id)
    db.delete(db_memo)
    db.commit()
    return True
