from urllib.parse import quote

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.scrivener import read_upload_limited
from crud import manuscript as crud
from crud import serial_nodes as toc_crud
from db.session import get_db
from schemas import manuscript as schemas

from .utils import get_default_author_id, get_optional_user, is_admin, require_auth

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


@router.post("/scrivener/import", status_code=status.HTTP_202_ACCEPTED)
async def import_scrivener(
    background_tasks: BackgroundTasks,
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

    project = crud.create_import_project(db, user.id, data, file.filename or "")
    background_tasks.add_task(
        crud.run_import_in_background,
        project["project_id"],
        user.id,
        data,
    )
    return project


def _zip_download(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(filename)}"
            )
        },
    )


@router.get("/projects/{project_id}/scrivener/export")
def export_scrivener(
    project_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    data, filename = crud.export_scrivener(db, project_id, user.id)
    return _zip_download(data, filename)


@router.post("/projects/{project_id}/scrivener/export")
def export_scrivener_selection(
    project_id: int,
    payload: schemas.ScrivenerExportRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    data, filename = crud.export_scrivener(
        db,
        project_id,
        user.id,
        payload.node_ids,
    )
    return _zip_download(data, filename)


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


@public_router.get("/{book_id}/toc")
def get_public_toc(
    book_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    return crud.get_public_toc(
        db,
        book_id,
        author_id=get_default_author_id(db),
        viewer_user_id=current_user.id if current_user else None,
        can_view_hidden=current_user is not None and is_admin(current_user),
    )


@public_router.get("/{book_id}/toc/manage")
def get_manage_toc(
    book_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return toc_crud.get_manage_toc(db, book_id, user.id)


@public_router.post("/{book_id}/toc/folders")
def post_toc_folder(
    book_id: int,
    payload: schemas.TocFolderCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return toc_crud.create_folder(
        db, book_id, user.id, payload.label, payload.parent_id
    )


@public_router.post("/{book_id}/toc/posts")
def post_toc_post(
    book_id: int,
    payload: schemas.TocPostCreate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    return toc_crud.add_post(
        db,
        book_id,
        user.id,
        payload.chapter_id,
        payload.parent_id,
        payload.position,
    )


@public_router.patch("/{book_id}/toc/nodes/{node_id}")
def patch_toc_node(
    book_id: int,
    node_id: int,
    payload: schemas.TocNodeUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    node = toc_crud._node_or_404(db, node_id, user.id)
    if node.book_id != book_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist TOC node",
        )
    return toc_crud.update_node(
        db,
        node_id,
        user.id,
        label=payload.label,
        label_set="label" in payload.model_fields_set,
        parent_id=payload.parent_id,
        parent_set="parent_id" in payload.model_fields_set,
    )


@public_router.post("/{book_id}/toc/nodes/{node_id}/move")
def move_toc_node(
    book_id: int,
    node_id: int,
    payload: schemas.TocNodeMoveRequest,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    node = toc_crud._node_or_404(db, node_id, user.id)
    if node.book_id != book_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist TOC node",
        )
    return toc_crud.move_node(
        db, node_id, user.id, payload.parent_id, payload.position
    )


@public_router.delete("/{book_id}/toc/nodes/{node_id}")
def delete_toc_node(
    book_id: int,
    node_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    node = toc_crud._node_or_404(db, node_id, user.id)
    if node.book_id != book_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist TOC node",
        )
    return toc_crud.delete_node(db, node_id, user.id)
