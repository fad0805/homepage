import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session, joinedload

from core.config import (
    ENVIRONMENT,
    GALLERY_COOKIE_MAX_AGE,
    GALLERY_COOKIE_NAME,
    GALLERY_INVITE_HOURS,
    GALLERY_INVITE_RETENTION_DAYS,
    GALLERY_SESSION_DAYS,
)
from core.rate_limit import FailureRateLimiter
from core.security import (
    generate_gallery_code,
    hash_gallery_code,
    hash_gallery_token,
    normalize_gallery_code,
)
from crud import gallery as gallery_crud
from db.session import get_db
from models.books import Book, Chapter
from models.illustrations import Illustration
from models.users import User
from routers.utils import get_client_ip, is_admin, require_auth
from schemas.gallery import (
    GalleryInviteCreate,
    GalleryInviteCreated,
    GalleryInviteRead,
    GallerySessionRead,
    GalleryUnlockRequest,
)

router = APIRouter()

# Codes are one-time secrets, so failed guesses get a progressively longer
# lockout: 5 failures -> 1 minute, then 2, 4, ... up to one hour.
_unlock_limiter = FailureRateLimiter(max_failures=5)


def _reject_unlock(ip: str) -> None:
    _unlock_limiter.record_failure(ip)
    raise HTTPException(
        status_code=401,
        detail="비밀번호가 올바르지 않거나 만료되었습니다.",
    )


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=GALLERY_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=ENVIRONMENT == "production",
        samesite="lax",
        max_age=GALLERY_COOKIE_MAX_AGE,
        path="/",
    )


def _invite_status(invite, now: datetime) -> str:
    if invite.revoked_at is not None:
        return "revoked"
    if invite.used_at is not None:
        return "used"
    if invite.expires_at <= now:
        return "expired"
    return "unused"


def _session_status(session, now: datetime) -> str:
    if session.revoked_at is not None:
        return "revoked"
    if session.expires_at <= now:
        return "expired"
    return "active"


def _owner_name_map(
    db: Session,
    owner_ids: set[int | None],
) -> dict[int, str]:
    ids = {owner_id for owner_id in owner_ids if owner_id is not None}
    if not ids:
        return {}

    users = (
        db.query(User)
        .options(joinedload(User.author_settings))
        .filter(User.id.in_(ids))
        .all()
    )
    return {
        user.id: (
            user.author_settings.nickname
            if user.author_settings
            else user.username
        )
        for user in users
    }


def _resource(
    illustration_id,
    chapter_id,
    book_id,
    relation,
    owner_names: dict[int, str],
):
    owner_id = relation.user_id if relation is not None else None
    owner_name = owner_names.get(owner_id) if owner_id is not None else None
    if owner_name is None and relation is not None:
        owner_name = getattr(relation, "owner", None)

    if illustration_id is not None:
        return {
            "type": "illustration",
            "id": illustration_id,
            "title": relation.title if relation is not None else "",
            "owner_id": owner_id,
            "owner_name": owner_name,
        }
    if chapter_id is not None:
        return {
            "type": "chapter",
            "id": chapter_id,
            "title": relation.title if relation is not None else "",
            "owner_id": owner_id,
            "owner_name": owner_name,
        }
    if book_id is not None:
        return {
            "type": "book",
            "id": book_id,
            "title": relation.title if relation is not None else "",
            "owner_id": owner_id,
            "owner_name": owner_name,
        }
    return None


def _invite_owner_id(invite) -> int | None:
    if invite.illustration_id is not None and invite.illustration is not None:
        return invite.illustration.user_id
    if invite.chapter_id is not None and invite.chapter is not None:
        return invite.chapter.user_id
    if invite.book_id is not None and invite.book is not None:
        return invite.book.user_id
    return None


def _invite_resource(invite, owner_names: dict[int, str]):
    if invite.illustration_id is not None:
        return _resource(
            invite.illustration_id,
            None,
            None,
            invite.illustration,
            owner_names,
        )
    if invite.chapter_id is not None:
        return _resource(
            None,
            invite.chapter_id,
            None,
            invite.chapter,
            owner_names,
        )
    if invite.book_id is not None:
        return _resource(
            None,
            None,
            invite.book_id,
            invite.book,
            owner_names,
        )
    return None


def _grant_resource(grant, owner_names: dict[int, str]):
    if grant.illustration_id is not None:
        return _resource(
            grant.illustration_id,
            None,
            None,
            grant.illustration,
            owner_names,
        )
    if grant.chapter_id is not None:
        return _resource(
            None,
            grant.chapter_id,
            None,
            grant.chapter,
            owner_names,
        )
    if grant.book_id is not None:
        return _resource(
            None,
            None,
            grant.book_id,
            grant.book,
            owner_names,
        )
    return None


def _grant_owner_id(grant) -> int | None:
    if grant.illustration_id is not None and grant.illustration is not None:
        return grant.illustration.user_id
    if grant.chapter_id is not None and grant.chapter is not None:
        return grant.chapter.user_id
    if grant.book_id is not None and grant.book is not None:
        return grant.book.user_id
    return None


def _session_resources(
    session,
    owner_user_id: int | None,
    owner_names: dict[int, str],
):
    resources = []
    for grant in session.grants:
        if (
            owner_user_id is not None
            and _grant_owner_id(grant) != owner_user_id
        ):
            continue
        resource = _grant_resource(grant, owner_names)
        if resource is not None:
            resources.append(resource)
    return resources


@router.post("/unlock")
def unlock_gallery(
    payload: GalleryUnlockRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Consume a one-time code and grant access to its resource."""
    ip = get_client_ip(request)
    _unlock_limiter.check(ip)

    normalized = normalize_gallery_code(payload.code)
    if not normalized:
        _reject_unlock(ip)

    now = datetime.utcnow()
    invite = gallery_crud.get_invite_by_hash(
        db,
        hash_gallery_code(normalized),
    )
    owner_names = (
        _owner_name_map(db, {_invite_owner_id(invite)})
        if invite is not None
        else {}
    )
    resource = (
        _invite_resource(invite, owner_names)
        if invite is not None
        else None
    )
    if (
        invite is None
        or invite.used_at is not None
        or invite.revoked_at is not None
        or invite.expires_at <= now
        or resource is None
    ):
        _reject_unlock(ip)

    # Only one concurrent request can mark the invite used.
    if not gallery_crud.consume_invite(
        db,
        invite.id,
        now,
        ip,
    ):
        db.rollback()
        _reject_unlock(ip)

    token = request.cookies.get(GALLERY_COOKIE_NAME)
    session = None
    if token:
        session = gallery_crud.get_session_by_hash(
            db,
            hash_gallery_token(token),
        )
        if session is not None and (
            session.revoked_at is not None
            or session.expires_at <= now
        ):
            session = None

    new_session = session is None
    if new_session:
        token = secrets.token_urlsafe(32)
        expires_at = now + timedelta(days=GALLERY_SESSION_DAYS)
        session = gallery_crud.create_session(
            db,
            hash_gallery_token(token),
            expires_at,
            get_client_ip(request),
            (request.headers.get("user-agent") or "")[:255] or None,
        )

    if invite.illustration_id is not None:
        gallery_crud.add_grant(
            db,
            session.id,
            illustration_id=invite.illustration_id,
        )
    elif invite.chapter_id is not None:
        gallery_crud.add_grant(
            db,
            session.id,
            chapter_id=invite.chapter_id,
        )
    else:
        gallery_crud.add_grant(
            db,
            session.id,
            book_id=invite.book_id,
        )

    db.commit()
    _unlock_limiter.reset(ip)

    if new_session:
        _set_cookie(response, token)

    return {
        "success": True,
        "resource": resource,
        "expires_at": session.expires_at,
    }


@router.get("/status")
def gallery_status(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Return the resources this browser is allowed to open."""
    empty = {
        "unlocked": False,
        "illustration_ids": [],
        "chapter_ids": [],
        "book_ids": [],
    }
    token = request.cookies.get(GALLERY_COOKIE_NAME)
    if not token:
        return empty

    now = datetime.utcnow()
    session = gallery_crud.get_session_by_hash(
        db,
        hash_gallery_token(token),
    )
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at <= now
    ):
        response.delete_cookie(GALLERY_COOKIE_NAME, path="/")
        return empty

    # Avoid a write on every page view.
    if (
        session.last_seen_at is None
        or now - session.last_seen_at > timedelta(minutes=5)
    ):
        session.last_seen_at = now
        db.commit()

    return {
        "unlocked": True,
        "illustration_ids": [
            grant.illustration_id
            for grant in session.grants
            if grant.illustration_id is not None
        ],
        "chapter_ids": [
            grant.chapter_id
            for grant in session.grants
            if grant.chapter_id is not None
        ],
        "book_ids": [
            grant.book_id
            for grant in session.grants
            if grant.book_id is not None
        ],
        "expires_at": session.expires_at,
    }


@router.post(
    "/invites",
    response_model=GalleryInviteCreated,
)
def create_gallery_invite(
    payload: GalleryInviteCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Generate a one-time code for one illustration, chapter or book."""
    illustration_id = None
    chapter_id = None
    book_id = None

    if payload.resource_type == "illustration":
        target = db.get(Illustration, payload.resource_id)
        illustration_id = payload.resource_id
    elif payload.resource_type == "chapter":
        target = db.get(Chapter, payload.resource_id)
        chapter_id = payload.resource_id
    else:
        target = db.get(Book, payload.resource_id)
        book_id = payload.resource_id

    if target is None or (
        target.user_id != user.id and not is_admin(user)
    ):
        raise HTTPException(
            status_code=404,
            detail="대상을 찾을 수 없습니다.",
        )

    code = generate_gallery_code()
    hours = payload.expires_in_hours or GALLERY_INVITE_HOURS
    note = (payload.note or "").strip() or None
    expires_at = datetime.utcnow() + timedelta(hours=hours)

    invite = gallery_crud.create_invite(
        db,
        hash_gallery_code(code),
        illustration_id,
        chapter_id,
        book_id,
        note,
        expires_at,
        user.id,
    )
    db.commit()

    return {
        "id": invite.id,
        "resource": {
            "type": payload.resource_type,
            "id": target.id,
            "title": target.title,
        },
        "code": code,
        "note": invite.note,
        "expires_at": invite.expires_at,
    }


@router.get(
    "/invites",
    response_model=list[GalleryInviteRead],
)
def read_gallery_invites(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    owner_user_id = None if is_admin(user) else user.id
    now = datetime.utcnow()
    deleted = gallery_crud.delete_old_revoked_invites(
        db,
        now - timedelta(days=GALLERY_INVITE_RETENTION_DAYS),
        owner_user_id,
    )
    if deleted:
        db.commit()

    invites = gallery_crud.list_invites(db, owner_user_id)
    owner_names = _owner_name_map(
        db,
        {_invite_owner_id(invite) for invite in invites},
    )
    return [
        {
            "id": invite.id,
            "resource": _invite_resource(invite, owner_names),
            "note": invite.note,
            "created_at": invite.created_at,
            "expires_at": invite.expires_at,
            "used_at": invite.used_at,
            "revoked_at": invite.revoked_at,
            "status": _invite_status(invite, now),
        }
        for invite in invites
    ]


@router.delete("/invites/{invite_id}")
def revoke_gallery_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    owner_user_id = None if is_admin(user) else user.id
    if not gallery_crud.revoke_invite(
        db,
        invite_id,
        datetime.utcnow(),
        owner_user_id,
    ):
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail="초대를 찾을 수 없습니다.",
        )
    db.commit()
    return {"success": True}


@router.get(
    "/sessions",
    response_model=list[GallerySessionRead],
)
def read_gallery_sessions(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    owner_user_id = None if is_admin(user) else user.id
    now = datetime.utcnow()
    sessions = gallery_crud.list_sessions(db, owner_user_id)
    owner_names = _owner_name_map(
        db,
        {
            _grant_owner_id(grant)
            for session in sessions
            for grant in session.grants
        },
    )
    return [
        {
            "id": session.id,
            "created_at": session.created_at,
            "expires_at": session.expires_at,
            "last_seen_at": session.last_seen_at,
            "revoked_at": session.revoked_at,
            "ip_address": session.ip_address,
            "user_agent": session.user_agent,
            "status": _session_status(session, now),
            "resources": _session_resources(
                session,
                owner_user_id,
                owner_names,
            ),
        }
        for session in sessions
    ]


@router.delete("/sessions/{session_id}")
def revoke_gallery_session(
    session_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    """Revoke a browser's access to this author's resources."""
    now = datetime.utcnow()
    if is_admin(user):
        revoked = gallery_crud.revoke_session(
            db,
            session_id,
            now,
        )
    else:
        revoked = gallery_crud.revoke_session_grants(
            db,
            session_id,
            user.id,
            now,
        )

    if not revoked:
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail="세션을 찾을 수 없습니다.",
        )
    db.commit()
    return {"success": True}
