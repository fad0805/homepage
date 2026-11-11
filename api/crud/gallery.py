from datetime import datetime

from sqlalchemy.orm import Session, selectinload

from models.gallery import (
    GalleryInvite,
    GallerySession,
    GallerySessionGrant,
)


def create_invite(
    db: Session,
    code_hash: str,
    illustration_id: int | None,
    chapter_id: int | None,
    book_id: int | None,
    note: str | None,
    expires_at: datetime,
) -> GalleryInvite:
    invite = GalleryInvite(
        code_hash=code_hash,
        illustration_id=illustration_id,
        chapter_id=chapter_id,
        book_id=book_id,
        note=note,
        expires_at=expires_at,
    )
    db.add(invite)
    db.flush()
    return invite


def get_invite_by_hash(db: Session, code_hash: str) -> GalleryInvite | None:
    return (
        db.query(GalleryInvite)
        .filter(GalleryInvite.code_hash == code_hash)
        .first()
    )


def list_invites(db: Session) -> list[GalleryInvite]:
    return (
        db.query(GalleryInvite)
        .options(
            selectinload(GalleryInvite.illustration),
            selectinload(GalleryInvite.chapter),
            selectinload(GalleryInvite.book),
        )
        .order_by(GalleryInvite.created_at.desc(), GalleryInvite.id.desc())
        .all()
    )


def consume_invite(
    db: Session,
    invite_id: int,
    now: datetime,
    ip_address: str,
) -> bool:
    """Mark an invite used. The database decides who wins the race."""
    updated = (
        db.query(GalleryInvite)
        .filter(
            GalleryInvite.id == invite_id,
            GalleryInvite.used_at.is_(None),
            GalleryInvite.revoked_at.is_(None),
            GalleryInvite.expires_at > now,
        )
        .update(
            {
                GalleryInvite.used_at: now,
                GalleryInvite.used_ip: ip_address,
            },
            synchronize_session=False,
        )
    )
    return bool(updated)


def delete_old_revoked_invites(
    db: Session, cutoff: datetime
) -> int:
    """Remove revoked codes that are older than the retention window."""
    return (
        db.query(GalleryInvite)
        .filter(
            GalleryInvite.revoked_at.isnot(None),
            GalleryInvite.revoked_at < cutoff,
        )
        .delete(synchronize_session=False)
    )


def revoke_invite(db: Session, invite_id: int, now: datetime) -> bool:
    updated = (
        db.query(GalleryInvite)
        .filter(
            GalleryInvite.id == invite_id,
            GalleryInvite.revoked_at.is_(None),
        )
        .update(
            {GalleryInvite.revoked_at: now},
            synchronize_session=False,
        )
    )
    return bool(updated)


def create_session(
    db: Session,
    token_hash: str,
    expires_at: datetime,
    ip_address: str | None,
    user_agent: str | None,
) -> GallerySession:
    session = GallerySession(
        token_hash=token_hash,
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(session)
    db.flush()
    return session


def get_session_by_hash(
    db: Session, token_hash: str
) -> GallerySession | None:
    return (
        db.query(GallerySession)
        .filter(GallerySession.token_hash == token_hash)
        .first()
    )


def add_grant(
    db: Session,
    session_id: int,
    illustration_id: int | None = None,
    chapter_id: int | None = None,
    book_id: int | None = None,
) -> GallerySessionGrant:
    query = db.query(GallerySessionGrant).filter(
        GallerySessionGrant.session_id == session_id
    )
    if illustration_id is not None:
        query = query.filter(
            GallerySessionGrant.illustration_id == illustration_id
        )
    elif chapter_id is not None:
        query = query.filter(
            GallerySessionGrant.chapter_id == chapter_id
        )
    elif book_id is not None:
        query = query.filter(GallerySessionGrant.book_id == book_id)
    else:
        raise ValueError("a grant needs a resource")

    existing = query.first()
    if existing is not None:
        return existing

    grant = GallerySessionGrant(
        session_id=session_id,
        illustration_id=illustration_id,
        chapter_id=chapter_id,
        book_id=book_id,
    )
    db.add(grant)
    db.flush()
    return grant


def list_sessions(db: Session) -> list[GallerySession]:
    return (
        db.query(GallerySession)
        .options(
            selectinload(GallerySession.grants).selectinload(
                GallerySessionGrant.illustration
            ),
            selectinload(GallerySession.grants).selectinload(
                GallerySessionGrant.chapter
            ),
            selectinload(GallerySession.grants).selectinload(
                GallerySessionGrant.book
            ),
        )
        .order_by(GallerySession.created_at.desc(), GallerySession.id.desc())
        .all()
    )


def revoke_session(db: Session, session_id: int, now: datetime) -> bool:
    updated = (
        db.query(GallerySession)
        .filter(
            GallerySession.id == session_id,
            GallerySession.revoked_at.is_(None),
        )
        .update(
            {GallerySession.revoked_at: now},
            synchronize_session=False,
        )
    )
    return bool(updated)
