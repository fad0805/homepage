from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.scrivener import read_upload_limited
from crud import manuscript as crud
from db.session import get_db
from schemas import manuscript as schemas

from .utils import get_default_author_id, require_auth

router = APIRouter()
public_router = APIRouter()


@router.get("/projects")
def get_projects(
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.get_projects(db, user.id)


@router.post("/projects")
def post_project(
    payload: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.create_project(db, payload, user.id)


@router.patch("/projects/{project_id}")
def patch_project(
    project_id: int,
    payload: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.update_project(db, project_id, payload, user.id)


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.delete_project(db, project_id, user.id)


@router.post("/scrivener/import")
async def import_scrivener(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    try:
        data = await read_upload_limited(file)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(exc),
        ) from exc
    return crud.import_scrivener(db, user.id, data)


@router.get("/projects/{project_id}/scrivener/export")
def export_scrivener(
    project_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    data, filename = crud.export_scrivener(db, project_id, user.id)
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(filename)}"
            )
        },
    )


@router.get("/projects/{project_id}/tree")
def get_tree(
    project_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.get_tree(db, project_id, user.id)


@router.post("/nodes")
def post_node(
    payload: schemas.NodeCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.create_node(db, payload, user.id)


@router.post("/nodes/reorder")
def post_reorder(
    project_id: int,
    payload: schemas.NodeReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.reorder_nodes(db, project_id, payload, user.id)


@router.get("/nodes/{node_id}")
def get_node(
    node_id: int,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.get_node(db, node_id, user.id, include_deleted=include_deleted)


@router.patch("/nodes/{node_id}")
def patch_node(
    node_id: int,
    payload: schemas.NodeUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.update_node(db, node_id, payload, user.id)


@router.post("/nodes/{node_id}/save-combined")
def post_save_combined(
    node_id: int,
    payload: schemas.CombinedSaveRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.save_combined(db, node_id, payload, user.id)


@router.post("/nodes/{node_id}/move")
def post_move(
    node_id: int,
    payload: schemas.NodeMoveRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.move_node(db, node_id, payload, user.id)


@router.delete("/nodes/{node_id}")
def delete_node(
    node_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.delete_node(db, node_id, user.id)


@router.post("/nodes/{node_id}/restore")
def restore_node(
    node_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.restore_node(db, node_id, user.id)


@router.post("/nodes/{node_id}/publish")
def publish_node(
    node_id: int,
    payload: schemas.PublishRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.publish_node(db, node_id, payload, user.id)


@router.get("/trash")
def get_trash(
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.get_trash(db, user.id, project_id=project_id)


@router.post("/trash/purge")
def purge_trash(
    retention_days: int = Query(default=crud.TRASH_RETENTION_DAYS, ge=1),
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return {
        "purged": crud.purge_expired(
            db,
            retention_days=retention_days,
            project_id=project_id,
            user_id=user.id,
        )
    }


@router.get("/search")
def search(
    q: str | None = None,
    project_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.search_nodes(
        db, user.id, q, project_id=project_id, limit=limit
    )


@router.get("/scrivenings")
def get_scrivenings(
    project_id: int | None = None,
    root_id: int | None = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return crud.get_scrivenings(
        db,
        user.id,
        project_id=project_id,
        root_id=root_id,
        include_deleted=include_deleted,
    )


@public_router.get("/books/{book_id}/toc")
def get_public_toc(
    book_id: int,
    db: Session = Depends(get_db),
):
    return crud.get_public_toc(db, book_id, author_id=get_default_author_id(db))
