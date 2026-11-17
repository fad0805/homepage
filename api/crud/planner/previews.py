"""Planner previews."""

from .common import *  # noqa: F401,F403


def _preview(
    *,
    entity_type: str,
    title: str | None,
    summary: str | None = None,
    content_html: str | None = None,
    detail_url: str | None = None,
    fields: dict | None = None,
    tags: list[str] | None = None,
) -> dict:
    return {
        "available": True,
        "entity_type": entity_type,
        "title": title,
        "summary": summary,
        "content_html": content_html,
        "detail_url": detail_url,
        "fields": fields or {},
        "tags": tags or [],
    }


def get_event_preview(
    db: Session,
    event_id: int,
    user_id: int,
) -> dict:
    event = (
        db.query(PlannerEvent)
        .filter(
            PlannerEvent.id == event_id,
            PlannerEvent.owner_user_id == user_id,
        )
        .first()
    )
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="이력을 찾을 수 없습니다.",
        )

    unavailable = PlannerEventPreview(
        available=False,
        entity_type=event.entity_type,
        title=event.title,
    )
    if event.action in ("deleted", "completed") or event.entity_id is None:
        return unavailable.model_dump()

    entity_id = event.entity_id
    owner_id = event.owner_user_id

    if event.entity_type == "book":
        obj = (
            db.query(Book)
            .filter(Book.id == entity_id, Book.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="book",
                title=obj.title,
                summary=obj.description,
                detail_url=f"/books?book={obj.id}",
                fields={
                    "category": (
                        obj.category_relation.name
                        if obj.category_relation
                        else None
                    ),
                },
                tags=obj.tags or [],
            )
    elif event.entity_type == "chapter":
        obj = (
            db.query(Chapter)
            .filter(Chapter.id == entity_id, Chapter.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="chapter",
                title=obj.title,
                summary=obj.subtitle,
                content_html=sanitize_index_html(obj.body),
                detail_url=(
                    f"/books?book={obj.book_id}&chapter={obj.id}"
                ),
                fields={
                    "book": obj.book.title if obj.book else None,
                },
                tags=obj.tags or [],
            )
    elif event.entity_type == "illustration":
        obj = (
            db.query(Illustration)
            .filter(
                Illustration.id == entity_id,
                Illustration.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="illustration",
                title=obj.title,
                summary=obj.description,
                detail_url=f"/illustrations/{obj.id}",
                fields={
                    "images": f"{len(obj.images)}장",
                },
                tags=obj.tags or [],
            )
    elif event.entity_type == "character":
        obj = (
            db.query(Character)
            .filter(
                Character.id == entity_id,
                Character.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="character",
                title=obj.name,
                summary=obj.description,
                detail_url=f"/characters/profile?character={obj.id}",
                fields={
                    "nickname": obj.nickname,
                    "age": obj.age,
                    "location": (
                        obj.location_relationship.name
                        if obj.location_relationship
                        else None
                    ),
                },
            )
    elif event.entity_type == "character_location":
        obj = (
            db.query(Location)
            .filter(
                Location.id == entity_id,
                Location.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="character_location",
                title=obj.name,
                summary=obj.description,
            )
    elif event.entity_type == "link":
        obj = (
            db.query(Link)
            .filter(Link.id == entity_id, Link.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="link",
                title=obj.name,
                summary=obj.description,
                fields={
                    "url": obj.url,
                    "category": (
                        obj.category_relation.name
                        if obj.category_relation
                        else None
                    ),
                },
            )
    elif event.entity_type == "link_category":
        obj = (
            db.query(LinkCategory)
            .filter(
                LinkCategory.id == entity_id,
                LinkCategory.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="link_category",
                title=obj.name,
            )
    elif event.entity_type == "book_category":
        obj = (
            db.query(BookCategory)
            .filter(
                BookCategory.id == entity_id,
                BookCategory.user_id == owner_id,
            )
            .first()
        )
        if obj:
            return _preview(
                entity_type="book_category",
                title=obj.name,
            )
    elif event.entity_type == "profile":
        obj = (
            db.query(Profile)
            .filter(Profile.id == entity_id, Profile.user_id == owner_id)
            .first()
        )
        if obj:
            return _preview(
                entity_type="profile",
                title=obj.title,
                summary=obj.subtitle,
                content_html=sanitize_index_html(obj.profile),
            )
    elif event.entity_type == "index":
        obj = db.query(IndexPage).filter(IndexPage.id == entity_id).first()
        if obj and (obj.user_id is None or obj.user_id == owner_id):
            return _preview(
                entity_type="index",
                title=("통합 인덱스" if obj.scope == "integrated" else "작가 인덱스"),
                content_html=sanitize_index_html(obj.content_html),
            )
    elif event.entity_type == "account":
        settings = (
            db.query(AuthorSettings)
            .filter(AuthorSettings.user_id == owner_id)
            .first()
        )
        if settings:
            return _preview(
                entity_type="account",
                title=settings.nickname,
                fields={
                    "nickname": settings.nickname,
                    "slug": settings.slug,
                },
            )

    return unavailable.model_dump()
