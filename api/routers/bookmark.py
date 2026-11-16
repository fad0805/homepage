from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from crud.bookmark import (
    create_routine,
    create_routine_category,
    delete_routine,
    delete_routine_category,
    get_period,
    get_routine_history,
    get_today,
    list_routine_categories,
    save_goal,
    save_rating,
    save_review,
    set_routine_check,
    stop_routine,
    update_routine,
    update_routine_category,
)
from db.session import get_db
from routers.utils import require_auth
from schemas.bookmark import (
    BookmarkGoalRead,
    BookmarkGoalUpdate,
    BookmarkRoutineCategoryCreate,
    BookmarkRoutineCategoryRead,
    BookmarkRoutineCategoryUpdate,
    BookmarkPeriodRead,
    BookmarkRatingRead,
    BookmarkRatingUpdate,
    BookmarkReviewRead,
    BookmarkReviewUpdate,
    BookmarkRoutineCheckUpdate,
    BookmarkRoutineCreate,
    BookmarkRoutineHistoryRead,
    BookmarkRoutinePeriodRead,
    BookmarkRoutineRead,
    BookmarkRoutineUpdate,
)

router = APIRouter()


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@router.get("", response_model=BookmarkPeriodRead)
def read_period(
    period_type: str,
    period_start: date,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_period(
        db,
        user.id,
        period_type=period_type,
        period_start=period_start,
    )


@router.get(
    "/categories",
    response_model=list[BookmarkRoutineCategoryRead],
)
def read_categories(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return list_routine_categories(db, user.id)


@router.post(
    "/categories",
    response_model=BookmarkRoutineCategoryRead,
)
def post_category(
    payload: BookmarkRoutineCategoryCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_routine_category(db, payload, user.id)


@router.patch(
    "/categories/{category_id}",
    response_model=BookmarkRoutineCategoryRead,
)
def patch_category(
    category_id: int,
    payload: BookmarkRoutineCategoryUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return update_routine_category(db, category_id, payload, user.id)


@router.delete("/categories/{category_id}")
def remove_category(
    category_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return delete_routine_category(db, category_id, user.id)


@router.get("/today", response_model=BookmarkPeriodRead)
def read_today(
    response: Response,
    period_start: date | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_today(db, user.id, day=period_start)


@router.post("/routines", response_model=BookmarkRoutineRead)
def post_routine(
    payload: BookmarkRoutineCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_routine(db, payload, user.id)


@router.patch("/routines/{routine_id}", response_model=BookmarkRoutineRead)
def patch_routine(
    routine_id: int,
    payload: BookmarkRoutineUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return update_routine(db, routine_id, payload, user.id)


@router.post(
    "/routines/{routine_id}/stop",
    response_model=BookmarkRoutineRead,
)
def stop_routine_route(
    routine_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return stop_routine(db, routine_id, user.id)


@router.delete("/routines/{routine_id}")
def remove_routine(
    routine_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return delete_routine(db, routine_id, user.id)


@router.get(
    "/routines/{routine_id}/history",
    response_model=BookmarkRoutineHistoryRead,
)
def read_routine_history(
    routine_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_routine_history(db, routine_id, user.id)


@router.put(
    "/routines/{routine_id}/check",
    response_model=BookmarkRoutinePeriodRead,
)
def put_routine_check(
    routine_id: int,
    payload: BookmarkRoutineCheckUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return set_routine_check(db, routine_id, payload, user.id)


@router.put("/goals", response_model=BookmarkGoalRead)
def put_goal(
    payload: BookmarkGoalUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return save_goal(db, payload, user.id)


@router.put("/rating", response_model=BookmarkRatingRead | None)
def put_rating(
    payload: BookmarkRatingUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return save_rating(db, payload, user.id)


@router.put("/review", response_model=BookmarkReviewRead)
def put_review(
    payload: BookmarkReviewUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return save_review(db, payload, user.id)
