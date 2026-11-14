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
    user_id: int,
) -> GalleryInvite:
    invite = GalleryInvite(
        user_id=user_id,
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


def list_invites(
    db: Session,
    owner_user_id: int | None = None,
) -> list[GalleryInvite]:
    query = db.query(GalleryInvite).options(
        selectinload(GalleryInvite.illustration),
        selectinload(GalleryInvite.chapter),
        selectinload(GalleryInvite.book),
    )
    if owner_user_id is not None:
        query = query.filter(GalleryInvite.user_id == owner_user_id)
    return (
        query
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
    db: Session,
    cutoff: datetime,
    owner_user_id: int | None = None,
) -> int:
    """Remove revoked codes that are older than the retention window."""
    query = db.query(GalleryInvite).filter(
        GalleryInvite.revoked_at.isnot(None),
        GalleryInvite.revoked_at < cutoff,
    )
    if owner_user_id is not None:
        query = query.filter(GalleryInvite.user_id == owner_user_id)
    return query.delete(synchronize_session=False)


def revoke_invite(
    db: Session,
    invite_id: int,
    now: datetime,
    owner_user_id: int | None = None,
) -> bool:
    query = db.query(GalleryInvite).filter(
        GalleryInvite.id == invite_id,
        GalleryInvite.revoked_at.is_(None),
    )
    if owner_user_id is not None:
        query = query.filter(GalleryInvite.user_id == owner_user_id)
    updated = query.update(
        {GalleryInvite.revoked_at: now},
        synchronize_session=False,
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


def _grant_owner_id(grant: GallerySessionGrant) -> int | None:
    if grant.illustration_id is not None and grant.illustration is not None:
        return grant.illustration.user_id
    if grant.chapter_id is not None and grant.chapter is not None:
        return grant.chapter.user_id
    if grant.book_id is not None and grant.book is not None:
        return grant.book.user_id
    return None


def list_sessions(
    db: Session,
    owner_user_id: int | None = None,
) -> list[GallerySession]:
    sessions = (
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
    if owner_user_id is None:
        return sessions

    return [
        session
        for session in sessions
        if any(
            _grant_owner_id(grant) == owner_user_id
            for grant in session.grants
        )
    ]


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


def revoke_session_grant(
    db: Session,
    session_id: int,
    grant_id: int,
    owner_user_id: int | None,
) -> bool:
    """Remove one resource from a browser session."""
    grant = (
        db.query(GallerySessionGrant)
        .options(
            selectinload(GallerySessionGrant.illustration),
            selectinload(GallerySessionGrant.chapter),
            selectinload(GallerySessionGrant.book),
        )
        .filter(
            GallerySessionGrant.id == grant_id,
            GallerySessionGrant.session_id == session_id,
        )
        .first()
    )
    if grant is None:
        return False
    if owner_user_id is not None and _grant_owner_id(grant) != owner_user_id:
        return False

    db.delete(grant)
    db.flush()

    remaining = (
        db.query(GallerySessionGrant.id)
        .filter(GallerySessionGrant.session_id == session_id)
        .first()
    )
    if remaining is None:
        db.query(GallerySession).filter(
            GallerySession.id == session_id
        ).delete(synchronize_session=False)

    return True


def revoke_session_grants(
    db: Session,
    session_id: int,
    owner_user_id: int,
    now: datetime,
) -> bool:
    """Remove only this author's resources from a browser session."""
    session = (
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
        .filter(GallerySession.id == session_id)
        .first()
    )
    if session is None:
        return False

    owned = [
        grant
        for grant in session.grants
        if _grant_owner_id(grant) == owner_user_id
    ]
    if not owned:
        return False

    for grant in owned:
        db.delete(grant)
    db.flush()

    remaining = (
        db.query(GallerySessionGrant)
        .filter(GallerySessionGrant.session_id == session_id)
        .count()
    )
    if remaining == 0 and session.revoked_at is None:
        session.revoked_at = now

    return True
