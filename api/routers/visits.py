import hashlib

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from crud.visits import get_visit_stats, normalize_source, record_visit
from db.session import get_db
from .utils import get_client_ip, get_optional_user, require_auth

router = APIRouter()


class VisitPayload(BaseModel):
    referrer: str | None = None
    path: str | None = None


@router.post("")
@router.post("/")
def post_visit(
    request: Request,
    payload: VisitPayload | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    if current_user is not None:
        return {"counted": False}

    referrer = (
        payload.referrer
        if payload and payload.referrer
        else request.headers.get("referer")
    )
    source = normalize_source(referrer, request.headers.get("host"))
    ip_hash = hashlib.sha256(get_client_ip(request).encode()).hexdigest()

    record_visit(
        db,
        ip_hash=ip_hash,
        source=source,
        referrer=referrer,
        path=payload.path if payload else None,
    )
    return {"counted": True}


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _=Depends(require_auth),
):
    return get_visit_stats(db)
