from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from crud.bookmark import (
    create_date_marker,
    create_mood_tag,
    create_routine,
    create_routine_category,
    create_special_date,
    delete_date_marker,
    delete_mood_tag,
    delete_routine,
    delete_routine_category,
    delete_special_date,
    get_journal_tree,
    get_period,
    get_routine_history,
    get_statistics,
    get_today,
    list_date_markers,
    list_mood_tags,
    list_routine_categories,
    list_special_dates,
    reorder_mood_tags,
    reorder_routine_categories,
    reorder_routines,
    save_day_meta,
    save_goal,
    save_rating,
    save_review,
    set_routine_check,
    stop_routine,
    update_date_marker,
    update_mood_tag,
    update_routine,
    update_routine_category,
    update_special_date,
)
from db.session import get_db
from routers.utils import require_auth
from schemas.bookmark import (
    BookmarkDateMarkerCreate,
    BookmarkDateMarkerRead,
    BookmarkDateMarkersResponse,
    BookmarkDateMarkerUpdate,
    BookmarkDayMetaUpdate,
    BookmarkGoalRead,
    BookmarkGoalUpdate,
    BookmarkJournalTreeRead,
    BookmarkMoodTagCreate,
    BookmarkMoodTagRead,
    BookmarkMoodTagReorder,
    BookmarkMoodTagUpdate,
    BookmarkRoutineCategoryCreate,
    BookmarkRoutineCategoryRead,
    BookmarkRoutineCategoryReorder,
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
    BookmarkRoutineReorder,
    BookmarkRoutineUpdate,
    BookmarkSpecialDateCreate,
    BookmarkSpecialDateRead,
    BookmarkSpecialDatesResponse,
    BookmarkSpecialDateUpdate,
    BookmarkStatisticsRead,
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


@router.get("/statistics", response_model=BookmarkStatisticsRead)
def read_statistics(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_statistics(db, user.id)


@router.get(
    "/journal/tree",
    response_model=BookmarkJournalTreeRead,
)
def read_journal_tree(
    response: Response,
    decade_start: date | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return get_journal_tree(
        db,
        user.id,
        decade_start=decade_start,
    )


@router.get("/mood-tags", response_model=list[BookmarkMoodTagRead])
def read_mood_tags(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return list_mood_tags(db, user.id)


@router.post("/mood-tags", response_model=BookmarkMoodTagRead)
def post_mood_tag(
    payload: BookmarkMoodTagCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_mood_tag(db, payload, user.id)


@router.put(
    "/mood-tags/order",
    response_model=list[BookmarkMoodTagRead],
)
def put_mood_tag_order(
    payload: BookmarkMoodTagReorder,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return reorder_mood_tags(db, payload, user.id)


@router.patch(
    "/mood-tags/{tag_id}",
    response_model=BookmarkMoodTagRead,
)
def patch_mood_tag(
    tag_id: int,
    payload: BookmarkMoodTagUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return update_mood_tag(db, tag_id, payload, user.id)


@router.delete("/mood-tags/{tag_id}")
def remove_mood_tag(
    tag_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return delete_mood_tag(db, tag_id, user.id)


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


@router.put(
    "/categories/order",
    response_model=list[BookmarkRoutineCategoryRead],
)
def put_category_order(
    payload: BookmarkRoutineCategoryReorder,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return reorder_routine_categories(db, payload, user.id)


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


@router.get(
    "/special-dates",
    response_model=BookmarkSpecialDatesResponse,
)
def read_special_dates(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return list_special_dates(db, user.id)


@router.post("/special-dates", response_model=BookmarkSpecialDateRead)
def post_special_date(
    payload: BookmarkSpecialDateCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_special_date(db, payload, user.id)


@router.patch(
    "/special-dates/{routine_id}",
    response_model=BookmarkSpecialDateRead,
)
def patch_special_date(
    routine_id: int,
    payload: BookmarkSpecialDateUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return update_special_date(db, routine_id, payload, user.id)


@router.delete("/special-dates/{routine_id}")
def remove_special_date(
    routine_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return delete_special_date(db, routine_id, user.id)


@router.get(
    "/date-markers",
    response_model=BookmarkDateMarkersResponse,
)
def read_date_markers(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return list_date_markers(db, user.id)


@router.post("/date-markers", response_model=BookmarkDateMarkerRead)
def post_date_marker(
    payload: BookmarkDateMarkerCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_date_marker(db, payload, user.id)


@router.patch(
    "/date-markers/{marker_id}",
    response_model=BookmarkDateMarkerRead,
)
def patch_date_marker(
    marker_id: int,
    payload: BookmarkDateMarkerUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return update_date_marker(db, marker_id, payload, user.id)


@router.delete("/date-markers/{marker_id}")
def remove_date_marker(
    marker_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return delete_date_marker(db, marker_id, user.id)


@router.post("/routines", response_model=BookmarkRoutineRead)
def post_routine(
    payload: BookmarkRoutineCreate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return create_routine(db, payload, user.id)


@router.put("/routines/order")
def put_routine_order(
    payload: BookmarkRoutineReorder,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return reorder_routines(db, payload, user.id)


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


@router.put("/day-meta", response_model=BookmarkGoalRead)
def put_day_meta(
    payload: BookmarkDayMetaUpdate,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(require_auth),
):
    _no_store(response)
    return save_day_meta(db, payload, user.id)


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
