from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.memos import Memo
from schemas.memos import MemoCreate, MemoUpdate

MEMO_TTL = timedelta(days=1)


def _utcnow() -> datetime:
    """Return a naive UTC datetime matching the database column type."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _delete_expired(db: Session, owner: str) -> None:
    """Remove this user's unpinned memos whose 24-hour window has ended."""
    deleted = (
        db.query(Memo)
        .filter(
            Memo.owner == owner,
            Memo.pinned.is_(False),
            Memo.expires_at <= _utcnow(),
        )
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()


def get_memos(db: Session, owner: str):
    """
    Get all current one-line memos belonging to the given user.

    Pinned memos are shown first, oldest first. Unpinned memos follow in
    newest-first order. Unpinned memos are kept for one day from creation and
    are removed lazily whenever the list is read.
    """
    _delete_expired(db, owner)
    pinned = (
        db.query(Memo)
        .filter(Memo.owner == owner, Memo.pinned.is_(True))
        .order_by(Memo.created_at.asc(), Memo.id.asc())
        .all()
    )
    unpinned = (
        db.query(Memo)
        .filter(Memo.owner == owner, Memo.pinned.is_(False))
        .order_by(Memo.created_at.desc(), Memo.id.desc())
        .all()
    )
    return [*pinned, *unpinned]


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

    db_memo = Memo(
        owner=owner,
        content=content,
        pinned=False,
        expires_at=_utcnow() + MEMO_TTL,
    )
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

    Content and pin state are independent. Unpinning starts a fresh one-day
    lifetime so an old pinned memo does not disappear immediately.
    """
    if memo.content is None and memo.pinned is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 내용이 없습니다.",
        )

    _delete_expired(db, owner)
    db_memo = _get_owned_memo(db, owner, memo_id)

    if memo.content is not None:
        content = memo.content.strip()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="메모 내용을 입력해주세요.",
            )
        db_memo.content = content

    if memo.pinned is not None:
        db_memo.pinned = memo.pinned
        if not memo.pinned:
            db_memo.expires_at = _utcnow() + MEMO_TTL

    db.commit()
    db.refresh(db_memo)
    return db_memo


def delete_memo(db: Session, owner: str, memo_id: int):
    """
    Delete a one-line memo belonging to the given user.
    """
    _delete_expired(db, owner)
    db_memo = _get_owned_memo(db, owner, memo_id)
    db.delete(db_memo)
    db.commit()
    return True
