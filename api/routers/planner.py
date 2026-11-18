from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from crud.planner import (
    complete_task,
    create_completed_record,
    create_task,
    deactivate_task,
    delete_color,
    delete_task_permanently,
    get_colors,
    get_event_preview,
    get_events,
    get_tasks,
    reorder_colors,
    restore_task,
    save_color,
    search_planner,
    trash_task,
    update_color,
    update_task,
)
from db.session import get_db
from routers.utils import require_auth
from schemas.planner import (
    PlannerColorCreate,
    PlannerColorRead,
    PlannerColorReorder,
    PlannerColorsResponse,
    PlannerColorUpdate,
    PlannerCompletedCreate,
    PlannerEventPreview,
    PlannerEventRead,
    PlannerEventsResponse,
    PlannerSearchResponse,
    PlannerTaskCreate,
    PlannerTaskRead,
    PlannerTasksResponse,
    PlannerTaskUpdate,
)

router = APIRouter()


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@router.get("/colors", response_model=PlannerColorsResponse)
def read_colors(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_colors(db, user.id)


@router.put("/colors/order", response_model=PlannerColorsResponse)
def put_color_order(
    payload: PlannerColorReorder,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return reorder_colors(db, payload, user.id)


@router.post("/colors", response_model=PlannerColorRead)
def post_color(
    payload: PlannerColorCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return save_color(db, payload.color, user.id, payload.name)


@router.patch("/colors/{color_id}", response_model=PlannerColorRead)
def patch_color(
    color_id: int,
    payload: PlannerColorUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return update_color(db, color_id, payload, user.id)


@router.delete("/colors/{color_id}")
def remove_color(
    color_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return delete_color(db, color_id, user.id)


@router.get("/search", response_model=PlannerSearchResponse)
def read_search(
    start: date,
    end: date,
    response: Response,
    q: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return search_planner(
        db,
        user.id,
        start_date=start,
        end_date=end,
        query=q,
    )


@router.get("/tasks", response_model=PlannerTasksResponse)
def read_tasks(
    response: Response,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_tasks(db, user.id, start_date=start, end_date=end)


@router.post("/tasks", response_model=PlannerTaskRead)
def post_task(
    payload: PlannerTaskCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_task(db, payload, user.id)


@router.post("/completed", response_model=PlannerEventRead)
def post_completed(
    payload: PlannerCompletedCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_completed_record(db, payload, user.id)


@router.patch("/tasks/{task_id}", response_model=PlannerTaskRead)
def patch_task(
    task_id: int,
    payload: PlannerTaskUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return update_task(db, task_id, payload, user.id)


@router.post("/tasks/{task_id}/complete")
def post_task_complete(
    task_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return complete_task(db, task_id, user.id)


@router.post("/tasks/{task_id}/deactivate", response_model=PlannerTaskRead)
def post_task_deactivate(
    task_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return deactivate_task(db, task_id, user.id)


@router.delete("/tasks/{task_id}")
def remove_task(
    task_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return trash_task(db, task_id, user.id)


@router.post("/tasks/{task_id}/restore", response_model=PlannerTaskRead)
def post_task_restore(
    task_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return restore_task(db, task_id, user.id)


@router.delete("/tasks/{task_id}/permanent")
def remove_task_permanently(
    task_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return delete_task_permanently(db, task_id, user.id)


@router.get("/events", response_model=PlannerEventsResponse)
def read_events(
    start: date,
    end: date,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_events(
        db,
        user.id,
        start_date=start,
        end_date=end,
    )


@router.get(
    "/events/{event_id}/preview",
    response_model=PlannerEventPreview,
)
def read_event_preview(
    event_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_event_preview(db, event_id, user.id)
