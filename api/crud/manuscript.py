"""Author-only manuscript tree and public serial table-of-contents helpers."""

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import hashlib
import json

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.search import like_pattern, search_tokens
from core.text_stats import count_characters, html_to_plain
from models.books import Book, Chapter
from models.manuscript import ManuscriptNode, ManuscriptProject, SerialNode
from schemas import manuscript as schemas

TRASH_RETENTION_DAYS = 30


def _utcnow() -> datetime:
    """Naive UTC matching the project's DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(value) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _content_hash(title: str | None, subtitle: str | None, body: str | None) -> str:
    payload = json.dumps(
        {
            "title": title or "",
            "subtitle": subtitle or "",
            "body": body or "",
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _get_book_or_404(db: Session, book_id: int, user_id: int) -> Book:
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.user_id == user_id)
        .first()
    )
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )
    return book


def _get_project_or_404(db: Session, project_id: int, user_id: int) -> ManuscriptProject:
    project = (
        db.query(ManuscriptProject)
        .filter(
            ManuscriptProject.id == project_id,
            ManuscriptProject.user_id == user_id,
        )
        .first()
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist manuscript project",
        )
    return project


def _get_node_or_404(
    db: Session,
    node_id: int,
    user_id: int,
    *,
    include_deleted: bool = False,
) -> ManuscriptNode:
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.id == node_id,
        ManuscriptNode.user_id == user_id,
    )
    if not include_deleted:
        query = query.filter(ManuscriptNode.deleted_at.is_(None))
    node = query.first()
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist manuscript node",
        )
    return node


def _published_state(node: ManuscriptNode, chapter: Chapter | None) -> str:
    if not node.published_chapter_id:
        return "unpublished"
    if chapter is None:
        return "published_missing"

    manuscript_changed = (
        node.published_manuscript_hash is None
        or _content_hash(node.title, node.subtitle, node.body)
        != node.published_manuscript_hash
    )
    chapter_changed = (
        node.published_chapter_hash is None
        or _content_hash(chapter.title, chapter.subtitle, chapter.body)
        != node.published_chapter_hash
    )
    if manuscript_changed and chapter_changed:
        return "diverged"
    if manuscript_changed:
        return "needs_republish"
    if chapter_changed:
        return "chapter_edited"
    return "published"


def _serialize_node(
    node: ManuscriptNode,
    *,
    include_body: bool = False,
    chapter: Chapter | None = None,
) -> dict:
    return {
        "id": node.id,
        "project_id": node.project_id,
        "parent_id": node.parent_id,
        "node_type": node.node_type,
        "title": node.title,
        "subtitle": node.subtitle if node.node_type == "chapter" else None,
        "synopsis": node.synopsis,
        "status": node.status,
        "notes": node.notes,
        "target_chars": node.target_chars,
        "position": node.position,
        "char_count_with_spaces": node.char_count_with_spaces or 0,
        "char_count_plain": node.char_count_plain or 0,
        "published_chapter_id": node.published_chapter_id,
        "published_state": _published_state(node, chapter),
        "deleted_at": _iso(node.deleted_at),
        "created_at": _iso(node.created_at),
        "updated_at": _iso(node.updated_at),
        **({"body": node.body} if include_body else {}),
    }


def _serialize_project(project: ManuscriptProject, node_count: int = 0) -> dict:
    return {
        "id": project.id,
        "title": project.title,
        "linked_book_id": project.linked_book_id,
        "linked_book_title": project.book.title if project.book else None,
        "node_count": node_count,
        "created_at": _iso(project.created_at),
        "updated_at": _iso(project.updated_at),
    }


def get_projects(db: Session, user_id: int) -> list[dict]:
    from sqlalchemy import func

    projects = (
        db.query(ManuscriptProject)
        .filter(ManuscriptProject.user_id == user_id)
        .order_by(ManuscriptProject.id.asc())
        .all()
    )
    counts = {
        project_id: count
        for project_id, count in (
            db.query(ManuscriptNode.project_id, func.count(ManuscriptNode.id))
            .filter(
                ManuscriptNode.user_id == user_id,
                ManuscriptNode.deleted_at.is_(None),
            )
            .group_by(ManuscriptNode.project_id)
            .all()
        )
    }
    return [_serialize_project(project, counts.get(project.id, 0)) for project in projects]


def create_project(db: Session, payload: schemas.ProjectCreate, user_id: int) -> dict:
    if payload.linked_book_id is not None:
        _get_book_or_404(db, payload.linked_book_id, user_id)
    project = ManuscriptProject(
        user_id=user_id,
        title=payload.title,
        linked_book_id=payload.linked_book_id,
    )
    db.add(project)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This book is already linked to another manuscript",
        ) from exc
    db.refresh(project)
    return _serialize_project(project)


def update_project(
    db: Session,
    project_id: int,
    payload: schemas.ProjectUpdate,
    user_id: int,
) -> dict:
    project = _get_project_or_404(db, project_id, user_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("linked_book_id") is not None:
        _get_book_or_404(db, data["linked_book_id"], user_id)
    for key, value in data.items():
        setattr(project, key, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This book is already linked to another manuscript",
        ) from exc
    db.refresh(project)
    return _serialize_project(project)


def get_tree(db: Session, project_id: int, user_id: int) -> list[dict]:
    _get_project_or_404(db, project_id, user_id)
    nodes = (
        db.query(ManuscriptNode)
        .filter(
            ManuscriptNode.project_id == project_id,
            ManuscriptNode.user_id == user_id,
            ManuscriptNode.deleted_at.is_(None),
        )
        .order_by(ManuscriptNode.position.asc(), ManuscriptNode.id.asc())
        .all()
    )
    chapter_ids = [
        node.published_chapter_id for node in nodes if node.published_chapter_id
    ]
    chapters = {
        chapter.id: chapter
        for chapter in db.query(Chapter).filter(Chapter.id.in_(chapter_ids)).all()
    } if chapter_ids else {}
    return [
        _serialize_node(node, chapter=chapters.get(node.published_chapter_id))
        for node in nodes
    ]


def _validate_parent(
    db: Session,
    project_id: int,
    user_id: int,
    parent_id: int | None,
    *,
    exclude_id: int | None = None,
) -> None:
    if parent_id is None:
        return
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.id == parent_id,
        ManuscriptNode.project_id == project_id,
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.deleted_at.is_(None),
    )
    if exclude_id is not None:
        query = query.filter(ManuscriptNode.id != exclude_id)
    if query.first() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid parent node",
        )


def create_node(db: Session, payload: schemas.NodeCreate, user_id: int) -> dict:
    project = _get_project_or_404(db, payload.project_id, user_id)
    _validate_parent(db, project.id, user_id, payload.parent_id)
    with_spaces, plain = count_characters(payload.body)
    node = ManuscriptNode(
        project_id=project.id,
        user_id=user_id,
        parent_id=payload.parent_id,
        node_type=payload.node_type,
        title=payload.title,
        subtitle=payload.subtitle,
        synopsis=payload.synopsis,
        status=payload.status,
        notes=payload.notes,
        body=payload.body,
        target_chars=payload.target_chars,
        position=payload.position,
        char_count_with_spaces=with_spaces,
        char_count_plain=plain,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return _serialize_node(node, include_body=True)


def get_node(
    db: Session,
    node_id: int,
    user_id: int,
    *,
    include_deleted: bool = False,
) -> dict:
    node = _get_node_or_404(db, node_id, user_id, include_deleted=include_deleted)
    chapter = (
        db.query(Chapter).filter(Chapter.id == node.published_chapter_id).first()
        if node.published_chapter_id
        else None
    )
    return _serialize_node(node, include_body=True, chapter=chapter)


def update_node(
    db: Session,
    node_id: int,
    payload: schemas.NodeUpdate,
    user_id: int,
) -> dict:
    node = _get_node_or_404(db, node_id, user_id)
    data = payload.model_dump(exclude_unset=True)
    if "parent_id" in data:
        _validate_parent(
            db,
            node.project_id,
            user_id,
            data["parent_id"],
            exclude_id=node.id,
        )
    if "body" in data:
        data["char_count_with_spaces"], data["char_count_plain"] = count_characters(
            data["body"]
        )
    for key, value in data.items():
        setattr(node, key, value)
    db.commit()
    db.refresh(node)
    return get_node(db, node.id, user_id)


def _descendant_ids(db: Session, node: ManuscriptNode) -> list[int]:
    rows = (
        db.query(ManuscriptNode.id, ManuscriptNode.parent_id)
        .filter(
            ManuscriptNode.project_id == node.project_id,
            ManuscriptNode.user_id == node.user_id,
        )
        .all()
    )
    children: dict[int | None, list[int]] = defaultdict(list)
    for row_id, parent_id in rows:
        children[parent_id].append(row_id)

    found: list[int] = []
    queue = deque([node.id])
    while queue:
        current = queue.popleft()
        found.append(current)
        queue.extend(children.get(current, []))
    return found


def delete_node(db: Session, node_id: int, user_id: int) -> dict:
    node = _get_node_or_404(db, node_id, user_id)
    ids = _descendant_ids(db, node)
    deleted_at = _utcnow()
    db.query(ManuscriptNode).filter(ManuscriptNode.id.in_(ids)).update(
        {ManuscriptNode.deleted_at: deleted_at},
        synchronize_session=False,
    )
    db.commit()
    return {"moved_to_trash": len(ids), "deleted_at": _iso(deleted_at)}


def restore_node(db: Session, node_id: int, user_id: int) -> dict:
    node = _get_node_or_404(db, node_id, user_id, include_deleted=True)
    if node.deleted_at is None:
        return {"restored": 0}

    # If the original parent is still in the trash, attach to its nearest
    # living ancestor so the restored subtree is visible again.
    parent_id = node.parent_id
    while parent_id is not None:
        parent = (
            db.query(ManuscriptNode)
            .filter(ManuscriptNode.id == parent_id)
            .first()
        )
        if parent is None:
            parent_id = None
            break
        if parent.deleted_at is None:
            break
        parent_id = parent.parent_id
    node.parent_id = parent_id

    ids = _descendant_ids(db, node)
    db.query(ManuscriptNode).filter(ManuscriptNode.id.in_(ids)).update(
        {ManuscriptNode.deleted_at: None},
        synchronize_session=False,
    )
    db.commit()
    return {"restored": len(ids)}


def get_trash(
    db: Session, user_id: int, project_id: int | None = None
) -> list[dict]:
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.deleted_at.is_not(None),
    )
    if project_id is not None:
        query = query.filter(ManuscriptNode.project_id == project_id)
    nodes = query.order_by(
        ManuscriptNode.deleted_at.desc(), ManuscriptNode.id.desc()
    ).all()
    return [
        {
            "id": node.id,
            "project_id": node.project_id,
            "title": node.title,
            "node_type": node.node_type,
            "deleted_at": _iso(node.deleted_at),
            "expires_at": _iso(
                node.deleted_at + timedelta(days=TRASH_RETENTION_DAYS)
                if node.deleted_at
                else None
            ),
        }
        for node in nodes
    ]


def purge_expired(
    db: Session,
    *,
    retention_days: int = TRASH_RETENTION_DAYS,
    project_id: int | None = None,
) -> int:
    cutoff = _utcnow() - timedelta(days=retention_days)
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.deleted_at.is_not(None),
        ManuscriptNode.deleted_at < cutoff,
    )
    if project_id is not None:
        query = query.filter(ManuscriptNode.project_id == project_id)
    count = query.delete(synchronize_session=False)
    db.commit()
    return count


def move_node(
    db: Session,
    node_id: int,
    payload: schemas.NodeMoveRequest,
    user_id: int,
) -> dict:
    node = _get_node_or_404(db, node_id, user_id)
    _validate_parent(db, node.project_id, user_id, payload.parent_id)

    parent_id = payload.parent_id
    while parent_id is not None:
        if parent_id == node.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move a node into itself",
            )
        parent = (
            db.query(ManuscriptNode)
            .filter(ManuscriptNode.id == parent_id)
            .first()
        )
        parent_id = parent.parent_id if parent else None

    node.parent_id = payload.parent_id
    node.position = payload.position
    db.commit()
    return get_node(db, node.id, user_id)


def reorder_nodes(
    db: Session,
    project_id: int,
    payload: schemas.NodeReorderRequest,
    user_id: int,
) -> list[dict]:
    _get_project_or_404(db, project_id, user_id)
    ids = [item.id for item in payload.items]
    nodes = {
        node.id: node
        for node in db.query(ManuscriptNode)
        .filter(
            ManuscriptNode.id.in_(ids),
            ManuscriptNode.project_id == project_id,
            ManuscriptNode.user_id == user_id,
            ManuscriptNode.deleted_at.is_(None),
        )
        .all()
    }
    if len(nodes) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist manuscript node",
        )
    for item in payload.items:
        _validate_parent(
            db,
            project_id,
            user_id,
            item.parent_id,
            exclude_id=item.id,
        )
        nodes[item.id].parent_id = item.parent_id
        nodes[item.id].position = item.position
    db.commit()
    return get_tree(db, project_id, user_id)


def _snippet(text: str, tokens: list[str], width: int = 120) -> str:
    lowered = text.lower()
    positions = [lowered.find(token.lower()) for token in tokens]
    positions = [position for position in positions if position >= 0]
    start = max(0, min(positions) - 30) if positions else 0
    end = min(len(text), start + width)
    snippet = text[start:end].replace("\n", " ").strip()
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet += "…"
    return snippet


def search_nodes(
    db: Session,
    user_id: int,
    query: str | None,
    *,
    limit: int = 50,
) -> list[dict]:
    tokens = search_tokens(query)
    if not tokens:
        return []

    nodes_query = db.query(ManuscriptNode).filter(
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.deleted_at.is_(None),
    )
    for token in tokens:
        pattern = like_pattern(token)
        nodes_query = nodes_query.filter(
            or_(
                ManuscriptNode.title.ilike(pattern, escape="\\"),
                ManuscriptNode.synopsis.ilike(pattern, escape="\\"),
                ManuscriptNode.notes.ilike(pattern, escape="\\"),
                ManuscriptNode.body.ilike(pattern, escape="\\"),
            )
        )
    nodes = (
        nodes_query.order_by(
            ManuscriptNode.updated_at.desc(), ManuscriptNode.id.desc()
        )
        .limit(limit)
        .all()
    )
    if not nodes:
        return []

    all_nodes = (
        db.query(ManuscriptNode.id, ManuscriptNode.parent_id, ManuscriptNode.title)
        .filter(
            ManuscriptNode.user_id == user_id,
            ManuscriptNode.deleted_at.is_(None),
        )
        .all()
    )
    by_id = {node_id: (parent_id, title) for node_id, parent_id, title in all_nodes}
    results = []
    for node in nodes:
        path: list[dict] = []
        parent_id = node.parent_id
        seen = {node.id}
        while parent_id is not None and parent_id in by_id and parent_id not in seen:
            seen.add(parent_id)
            parent_title = by_id[parent_id][1]
            path.append({"id": parent_id, "title": parent_title})
            parent_id = by_id[parent_id][0]
        results.append(
            {
                "id": node.id,
                "project_id": node.project_id,
                "node_type": node.node_type,
                "title": node.title,
                "path": list(reversed(path)),
                "snippet": _snippet(html_to_plain(node.body), tokens),
                "char_count_with_spaces": node.char_count_with_spaces or 0,
                "updated_at": _iso(node.updated_at),
            }
        )
    return results


def _preorder_nodes(
    db: Session,
    user_id: int,
    *,
    project_id: int | None,
    root_id: int | None,
) -> list[ManuscriptNode]:
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.deleted_at.is_(None),
    )
    if project_id is not None:
        query = query.filter(ManuscriptNode.project_id == project_id)
    nodes = query.all()
    by_id = {node.id: node for node in nodes}
    children: dict[int | None, list[ManuscriptNode]] = defaultdict(list)
    for node in nodes:
        children[node.parent_id].append(node)
    for siblings in children.values():
        siblings.sort(key=lambda item: (item.position, item.id))

    roots = [by_id[root_id]] if root_id is not None and root_id in by_id else children.get(None, [])
    ordered: list[ManuscriptNode] = []
    queue = deque(reversed(roots))
    while queue:
        node = queue.popleft()
        ordered.append(node)
        queue.extend(reversed(children.get(node.id, [])))
    return ordered


def get_scrivenings(
    db: Session,
    user_id: int,
    *,
    project_id: int | None = None,
    root_id: int | None = None,
) -> list[dict]:
    if project_id is None and root_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id or root_id is required",
        )
    if root_id is not None:
        root = _get_node_or_404(db, root_id, user_id)
        project_id = root.project_id
    ordered = _preorder_nodes(db, user_id, project_id=project_id, root_id=root_id)
    return [
        {
            "id": node.id,
            "title": node.title,
            "node_type": node.node_type,
            "body": node.body,
            "char_count_with_spaces": node.char_count_with_spaces or 0,
            "char_count_plain": node.char_count_plain or 0,
        }
        for node in ordered
        if node.node_type == "chapter"
    ]


def _ensure_serial_folder(
    db: Session,
    user_id: int,
    book_id: int,
    parent_id: int | None,
    label: str,
) -> int:
    existing = (
        db.query(SerialNode)
        .filter(
            SerialNode.book_id == book_id,
            SerialNode.node_type == "folder",
            SerialNode.parent_id.is_(parent_id) if parent_id is None else SerialNode.parent_id == parent_id,
            SerialNode.label == label,
        )
        .first()
    )
    if existing is not None:
        return existing.id
    position = _next_position(db, book_id, parent_id)
    folder = SerialNode(
        user_id=user_id,
        book_id=book_id,
        parent_id=parent_id,
        node_type="folder",
        label=label,
        position=position,
    )
    db.add(folder)
    db.flush()
    return folder.id


def _next_position(db: Session, book_id: int, parent_id: int | None) -> int:
    from sqlalchemy import func

    query = db.query(func.max(SerialNode.position)).filter(
        SerialNode.book_id == book_id,
    )
    if parent_id is None:
        query = query.filter(SerialNode.parent_id.is_(None))
    else:
        query = query.filter(SerialNode.parent_id == parent_id)
    return (query.scalar() or 0) + 1


def _sync_serial_node(
    db: Session,
    node: ManuscriptNode,
    chapter: Chapter,
    *,
    user_id: int,
    sync_structure: bool,
) -> SerialNode:
    book_id = chapter.book_id
    existing = (
        db.query(SerialNode)
        .filter(
            SerialNode.book_id == book_id,
            SerialNode.chapter_id == chapter.id,
        )
        .first()
    )
    if existing is not None and existing.book_id != book_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chapter is placed in a different book's TOC",
        )

    parent_id = existing.parent_id if existing is not None else None
    if existing is None or sync_structure:
        parent_id = None
        ancestors = []
        current = db.query(ManuscriptNode).filter(
            ManuscriptNode.id == node.parent_id
        ).first()
        while current is not None:
            ancestors.append(current)
            current = (
                db.query(ManuscriptNode)
                .filter(ManuscriptNode.id == current.parent_id)
                .first()
                if current.parent_id
                else None
            )
        for folder in reversed(ancestors):
            if folder.node_type != "folder":
                continue
            parent_id = _ensure_serial_folder(
                db, user_id, book_id, parent_id, folder.title
            )

    if existing is not None:
        if sync_structure:
            existing.parent_id = parent_id
        return existing

    post = SerialNode(
        user_id=user_id,
        book_id=book_id,
        parent_id=parent_id,
        node_type="post",
        chapter_id=chapter.id,
        label=None,
        position=_next_position(db, book_id, parent_id),
    )
    db.add(post)
    db.flush()
    return post


def publish_node(
    db: Session,
    node_id: int,
    payload: schemas.PublishRequest,
    user_id: int,
) -> dict:
    node = _get_node_or_404(db, node_id, user_id)
    if node.node_type != "chapter":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only chapter nodes can be published",
        )

    chapter = None
    if node.published_chapter_id:
        chapter = (
            db.query(Chapter)
            .filter(
                Chapter.id == node.published_chapter_id,
                Chapter.user_id == user_id,
            )
            .first()
        )
        if chapter is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Linked chapter no longer exists",
            )
        if payload.target_book_id is not None and payload.target_book_id != chapter.book_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A published chapter cannot change books; unlink it first",
            )
    else:
        if payload.target_book_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="target_book_id is required for the first publish",
            )
        _get_book_or_404(db, payload.target_book_id, user_id)
        chapter = Chapter(
            user_id=user_id,
            book_id=payload.target_book_id,
            title=node.title,
            subtitle=node.subtitle,
            body=node.body,
            tags=[],
            order=_next_chapter_order(db, payload.target_book_id),
        )
        db.add(chapter)
        db.flush()

    # Content ownership only. Publication settings stay in book management.
    chapter.title = node.title
    chapter.subtitle = node.subtitle
    chapter.body = node.body
    db.flush()

    _sync_serial_node(
        db,
        node,
        chapter,
        user_id=user_id,
        sync_structure=payload.sync_structure,
    )

    content_hash = _content_hash(node.title, node.subtitle, node.body)
    node.published_chapter_id = chapter.id
    node.published_manuscript_hash = content_hash
    node.published_chapter_hash = content_hash
    node.published_at = _utcnow()
    db.commit()
    db.refresh(node)
    return {
        "node": get_node(db, node.id, user_id),
        "chapter_id": chapter.id,
        "book_id": chapter.book_id,
    }


def _next_chapter_order(db: Session, book_id: int) -> int:
    from sqlalchemy import func

    return (db.query(func.max(Chapter.order)).filter(Chapter.book_id == book_id).scalar() or 0) + 1


def unlink_node(
    db: Session,
    node_id: int,
    payload: schemas.UnlinkRequest,
    user_id: int,
) -> dict:
    node = _get_node_or_404(db, node_id, user_id)
    if not node.published_chapter_id:
        return {"unlinked": False, "book_deleted": False}

    chapter = (
        db.query(Chapter)
        .filter(
            Chapter.id == node.published_chapter_id,
            Chapter.user_id == user_id,
        )
        .first()
    )
    book_id = chapter.book_id if chapter else None
    book_deleted = False

    if payload.delete_book and book_id is not None:
        chapter_ids = [
            item.id
            for item in db.query(Chapter.id).filter(Chapter.book_id == book_id).all()
        ]
        if chapter_ids:
            db.query(ManuscriptNode).filter(
                ManuscriptNode.published_chapter_id.in_(chapter_ids)
            ).update(
                {
                    ManuscriptNode.published_chapter_id: None,
                    ManuscriptNode.published_manuscript_hash: None,
                    ManuscriptNode.published_chapter_hash: None,
                    ManuscriptNode.published_at: None,
                },
                synchronize_session=False,
            )
        db.query(SerialNode).filter(SerialNode.book_id == book_id).delete(
            synchronize_session=False
        )
        book = db.query(Book).filter(Book.id == book_id, Book.user_id == user_id).first()
        if book is not None:
            db.delete(book)
            book_deleted = True
    else:
        node.published_chapter_id = None
        node.published_manuscript_hash = None
        node.published_chapter_hash = None
        node.published_at = None

    db.commit()
    return {"unlinked": True, "book_deleted": book_deleted}


def get_public_toc(db: Session, book_id: int) -> list[dict]:
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.visible.is_(True))
        .first()
    )
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist book",
        )

    chapters = {
        chapter.id: chapter
        for chapter in db.query(Chapter)
        .filter(Chapter.book_id == book_id, Chapter.visible.is_(True))
        .all()
    }
    nodes = db.query(SerialNode).filter(SerialNode.book_id == book_id).all()

    def chapter_summary(chapter: Chapter) -> dict:
        return {
            "id": chapter.id,
            "title": chapter.title,
            "subtitle": chapter.subtitle,
            "locked": bool(chapter.protected),
            "published_at": _iso(chapter.published_at),
            "updated_at": _iso(chapter.updated_at),
        }

    if not nodes:
        return [
            {
                "id": None,
                "node_type": "post",
                "label": chapter.title,
                "position": chapter.order,
                "chapter": chapter_summary(chapter),
                "children": [],
            }
            for chapter in sorted(
                chapters.values(), key=lambda item: (item.order, item.id)
            )
        ]

    children: dict[int | None, list[SerialNode]] = defaultdict(list)
    for node in nodes:
        if node.node_type == "post":
            chapter = chapters.get(node.chapter_id)
            if chapter is None:
                continue
        children[node.parent_id].append(node)
    for siblings in children.values():
        siblings.sort(key=lambda item: (item.position, item.id))

    def build(node: SerialNode) -> dict:
        chapter = chapters.get(node.chapter_id) if node.node_type == "post" else None
        return {
            "id": node.id,
            "node_type": node.node_type,
            "label": node.label or (chapter.title if chapter else None),
            "position": node.position,
            "chapter": chapter_summary(chapter) if chapter else None,
            "children": [build(child) for child in children.get(node.id, [])],
        }

    return [build(node) for node in children.get(None, [])]
