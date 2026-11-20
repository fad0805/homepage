"""Author-only manuscript tree and public serial table-of-contents helpers."""

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import hashlib
import json

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, load_only

from core.image_urls import public_url
from core.publish_html import prepare_chapter_html
from core.scrivener import (
    IMAGE_PLACEHOLDER_PREFIX,
    IMAGE_PLACEHOLDER_SUFFIX,
    ExportNode,
    build_scrivener_zip,
    html_to_rtf_with_images,
    parse_scrivener_zip,
    read_scrivener_project_title,
    safe_filename,
)
from core.search import like_pattern, search_tokens
from core.text_stats import count_characters, html_to_plain
from core.uploads import open_uploaded_file, save_image_bytes
from crud import serial_nodes as serial_node_crud
from crud.books import _category_is_visible_to
from db.session import SessionLocal
from models.books import Book, Chapter
from models.manuscript import ManuscriptNode, ManuscriptProject, SerialNode
from schemas import manuscript as schemas

TRASH_RETENTION_DAYS = 30
PUBLISH_COOLDOWN_SECONDS = 5


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
    for_update: bool = False,
) -> ManuscriptNode:
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.id == node_id,
        ManuscriptNode.user_id == user_id,
    )
    if not include_deleted:
        query = query.filter(ManuscriptNode.deleted_at.is_(None))
    if for_update:
        query = query.with_for_update()
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
    include_publication: bool = True,
    chapter: Chapter | None = None,
) -> dict:
    data = {
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
        "deleted_at": _iso(node.deleted_at),
        "created_at": _iso(node.created_at),
        "updated_at": _iso(node.updated_at),
        **({"body": node.body} if include_body else {}),
    }
    if include_publication:
        data["published_chapter_exists"] = bool(
            node.published_chapter_id and chapter is not None
        )
        data["published_state"] = _published_state(node, chapter)
    return data


def _serialize_project(project: ManuscriptProject, node_count: int = 0) -> dict:
    return {
        "id": project.id,
        "title": project.title,
        "linked_book_id": project.linked_book_id,
        "linked_book_title": project.book.title if project.book else None,
        "node_count": node_count,
        "created_at": _iso(project.created_at),
        "updated_at": _iso(project.updated_at),
        "import_status": project.import_status or "ready",
        "import_error": project.import_error,
    }


def get_projects(db: Session, user_id: int) -> list[dict]:
    from sqlalchemy import func

    projects = (
        db.query(ManuscriptProject)
        .options(joinedload(ManuscriptProject.book))
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


def delete_project(db: Session, project_id: int, user_id: int) -> dict:
    project = _get_project_or_404(db, project_id, user_id)
    db.delete(project)
    db.commit()
    return {"id": project_id}


def get_tree(db: Session, project_id: int, user_id: int) -> list[dict]:
    _get_project_or_404(db, project_id, user_id)
    nodes = (
        db.query(ManuscriptNode)
        .options(
            load_only(
                ManuscriptNode.id,
                ManuscriptNode.project_id,
                ManuscriptNode.parent_id,
                ManuscriptNode.node_type,
                ManuscriptNode.title,
                ManuscriptNode.subtitle,
                ManuscriptNode.synopsis,
                ManuscriptNode.status,
                ManuscriptNode.notes,
                ManuscriptNode.target_chars,
                ManuscriptNode.position,
                ManuscriptNode.char_count_with_spaces,
                ManuscriptNode.char_count_plain,
                ManuscriptNode.published_chapter_id,
                ManuscriptNode.deleted_at,
                ManuscriptNode.created_at,
                ManuscriptNode.updated_at,
            )
        )
        .filter(
            ManuscriptNode.project_id == project_id,
            ManuscriptNode.user_id == user_id,
            ManuscriptNode.deleted_at.is_(None),
        )
        .order_by(ManuscriptNode.position.asc(), ManuscriptNode.id.asc())
        .all()
    )
    return [
        _serialize_node(node, include_publication=False)
        for node in nodes
    ]


def _parent_map(db: Session, project_id: int, user_id: int) -> dict[int, int | None]:
    rows = (
        db.query(ManuscriptNode.id, ManuscriptNode.parent_id)
        .filter(
            ManuscriptNode.project_id == project_id,
            ManuscriptNode.user_id == user_id,
            ManuscriptNode.deleted_at.is_(None),
        )
        .all()
    )
    return {node_id: parent_id for node_id, parent_id in rows}


def _validate_parent(
    db: Session,
    project_id: int,
    user_id: int,
    parent_id: int | None,
    *,
    node_id: int | None = None,
    parent_map: dict[int, int | None] | None = None,
) -> None:
    """Validate a parent change, including cycles for an existing node.

    ``parent_map`` can describe the *final* hierarchy for a batch reorder; when
    omitted the current database state is used.
    """
    if parent_id is None:
        return
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.id == parent_id,
        ManuscriptNode.project_id == project_id,
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.deleted_at.is_(None),
    )
    if node_id is not None:
        query = query.filter(ManuscriptNode.id != node_id)
    if query.first() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid parent node",
        )
    if node_id is None:
        return

    if parent_map is None:
        parent_map = _parent_map(db, project_id, user_id)
    seen = {node_id}
    current = parent_id
    while current is not None:
        if current in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move a node into its own descendant",
            )
        seen.add(current)
        current = parent_map.get(current)


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
            node_id=node.id,
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


def save_combined(
    db: Session,
    folder_id: int,
    payload: schemas.CombinedSaveRequest,
    user_id: int,
) -> dict:
    """Save every document body plus the folder metadata in one commit.

    Validating all nodes before writing prevents a partial save when one id is
    stale or belongs to another project. A database error still triggers a
    rollback so the folder view cannot show bodies that were never persisted.
    """
    folder = _get_node_or_404(db, folder_id, user_id)
    if folder.node_type != "folder":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "합본 저장은 폴더에서만 가능합니다.")

    data = payload.model_dump(exclude_unset=True)
    bodies = data.pop("bodies", {})
    folder_fields = {
        key: data[key] for key in ("subtitle", "synopsis", "notes") if key in data
    }
    if not bodies and not folder_fields:
        return {"saved": 0}

    updates: list[tuple[ManuscriptNode, str]] = []
    for node_id, body in bodies.items():
        node = _get_node_or_404(db, node_id, user_id)
        if node.project_id != folder.project_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "다른 프로젝트의 문서는 저장할 수 없습니다."
            )
        if node.node_type != "chapter":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "문서 본문만 합본으로 저장할 수 있습니다."
            )
        updates.append((node, body))

    try:
        for node, body in updates:
            node.body = body
            node.char_count_with_spaces, node.char_count_plain = count_characters(body)
        for key, value in folder_fields.items():
            setattr(folder, key, value)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"saved": len(updates)}


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
    seen = {node.id}
    queue = deque([node.id])
    while queue:
        current = queue.popleft()
        found.append(current)
        for child in children.get(current, []):
            if child in seen:
                continue
            seen.add(child)
            queue.append(child)
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
        ManuscriptNode.deleted_at.desc(),
        ManuscriptNode.position.asc(),
        ManuscriptNode.id.asc(),
    ).all()
    return [
        {
            "id": node.id,
            "project_id": node.project_id,
            "parent_id": node.parent_id,
            "title": node.title,
            "node_type": node.node_type,
            "position": node.position,
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
    user_id: int | None = None,
) -> int:
    cutoff = _utcnow() - timedelta(days=retention_days)
    query = db.query(ManuscriptNode).filter(
        ManuscriptNode.deleted_at.is_not(None),
        ManuscriptNode.deleted_at < cutoff,
    )
    if project_id is not None:
        query = query.filter(ManuscriptNode.project_id == project_id)
    if user_id is not None:
        query = query.filter(ManuscriptNode.user_id == user_id)
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
    _validate_parent(
        db, node.project_id, user_id, payload.parent_id, node_id=node.id
    )

    old_parent_id = node.parent_id

    def siblings(
        parent_id: int | None, *, include_node: bool = False
    ) -> list[ManuscriptNode]:
        query = db.query(ManuscriptNode).filter(
            ManuscriptNode.project_id == node.project_id,
            ManuscriptNode.user_id == user_id,
            ManuscriptNode.deleted_at.is_(None),
        )
        if not include_node:
            query = query.filter(ManuscriptNode.id != node.id)
        if parent_id is None:
            query = query.filter(ManuscriptNode.parent_id.is_(None))
        else:
            query = query.filter(ManuscriptNode.parent_id == parent_id)
        return query.order_by(
            ManuscriptNode.position.asc(), ManuscriptNode.id.asc()
        ).all()

    old_index = next(
        (
            index
            for index, sibling in enumerate(
                siblings(old_parent_id, include_node=True)
            )
            if sibling.id == node.id
        ),
        0,
    )

    index = max(0, payload.position)
    if old_parent_id == payload.parent_id and old_index < index:
        index -= 1
    target_siblings = siblings(payload.parent_id)
    index = min(index, len(target_siblings))
    target_siblings.insert(index, node)
    for position, sibling in enumerate(target_siblings):
        sibling.parent_id = payload.parent_id
        sibling.position = position

    if old_parent_id != payload.parent_id:
        for position, sibling in enumerate(siblings(old_parent_id)):
            sibling.position = position

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
    final_parents = _parent_map(db, project_id, user_id)
    for item in payload.items:
        final_parents[item.id] = item.parent_id
    for item in payload.items:
        _validate_parent(
            db,
            project_id,
            user_id,
            item.parent_id,
            node_id=item.id,
            parent_map=final_parents,
        )
        nodes[item.id].parent_id = item.parent_id
        nodes[item.id].position = item.position
    db.commit()
    return get_tree(db, project_id, user_id)


def _snippet(text: str, tokens: list[str], max_chars: int = 240) -> str:
    """Return the matching sentence plus one sentence before and after."""
    if not text:
        return ""
    lowered = text.lower()
    positions = [lowered.find(token.lower()) for token in tokens if token]
    positions = [position for position in positions if position >= 0]
    focus = min(positions) if positions else 0

    starts = [0]
    for index, char in enumerate(text):
        if char in ".!?。？！" and (
            index + 1 == len(text) or text[index + 1].isspace()
        ):
            following = index + 1
            while following < len(text) and text[following].isspace():
                following += 1
            if following < len(text):
                starts.append(following)
    bounds = starts + [len(text)]
    sentences = [
        (bounds[index], bounds[index + 1])
        for index in range(len(bounds) - 1)
        if bounds[index + 1] > bounds[index]
    ]
    if not sentences:
        return ""
    match_index = next(
        (
            index
            for index, (start, end) in enumerate(sentences)
            if start <= focus < end
        ),
        len(sentences) - 1,
    )
    first = max(0, match_index - 1)
    last = min(len(sentences) - 1, match_index + 1)
    start = sentences[first][0]
    end = sentences[last][1]

    # Keep the excerpt compact when surrounding sentences are very long.
    if end - start > max_chars:
        start = max(start, focus - max_chars // 3)
        end = min(end, start + max_chars)
    snippet = " ".join(text[start:end].split())
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
    project_id: int | None = None,
    limit: int = 50,
) -> list[dict]:
    tokens = search_tokens(query)
    if not tokens:
        return []

    nodes_query = db.query(ManuscriptNode).filter(
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.deleted_at.is_(None),
    )
    if project_id is not None:
        nodes_query = nodes_query.filter(
            ManuscriptNode.project_id == project_id
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

    path_query = db.query(
        ManuscriptNode.id, ManuscriptNode.parent_id, ManuscriptNode.title
    ).filter(
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.deleted_at.is_(None),
    )
    if project_id is not None:
        path_query = path_query.filter(
            ManuscriptNode.project_id == project_id
        )
    all_nodes = path_query.all()
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


def _subtree_ids(
    db: Session,
    user_id: int,
    *,
    project_id: int,
    root_id: int | None,
    include_deleted: bool,
) -> set[int]:
    """Collect ids under ``root_id`` using only lightweight id/parent rows."""
    query = db.query(ManuscriptNode.id, ManuscriptNode.parent_id).filter(
        ManuscriptNode.user_id == user_id,
        ManuscriptNode.project_id == project_id,
    )
    if not include_deleted:
        query = query.filter(ManuscriptNode.deleted_at.is_(None))
    rows = query.all()
    ids = {row.id for row in rows}
    children: dict[int | None, list[int]] = defaultdict(list)
    for row in rows:
        children[row.parent_id].append(row.id)

    starts = [root_id] if root_id is not None and root_id in ids else children.get(None, [])
    found: set[int] = set()
    queue = deque(starts)
    while queue:
        current = queue.popleft()
        if current in found:
            continue
        found.add(current)
        queue.extend(children.get(current, []))
    return found


def _preorder_nodes(
    db: Session,
    user_id: int,
    *,
    project_id: int | None,
    root_id: int | None,
    include_deleted: bool = False,
) -> list[dict]:
    if project_id is None:
        return []
    subtree_ids = _subtree_ids(
        db,
        user_id,
        project_id=project_id,
        root_id=root_id,
        include_deleted=include_deleted,
    )
    if not subtree_ids:
        return []

    # Metadata first; body is fetched separately and only for chapters that
    # will actually be returned. Folders and unrelated documents never load it.
    rows = (
        db.query(
            ManuscriptNode.id,
            ManuscriptNode.parent_id,
            ManuscriptNode.position,
            ManuscriptNode.node_type,
            ManuscriptNode.title,
            ManuscriptNode.char_count_with_spaces,
            ManuscriptNode.char_count_plain,
        )
        .filter(
            ManuscriptNode.id.in_(subtree_ids),
            ManuscriptNode.user_id == user_id,
        )
        .all()
    )
    by_id = {row.id: row for row in rows}
    children: dict[int | None, list[int]] = defaultdict(list)
    for row in rows:
        children[row.parent_id].append(row.id)
    for siblings in children.values():
        siblings.sort(key=lambda node_id: (by_id[node_id].position, node_id))

    starts = [root_id] if root_id is not None and root_id in by_id else children.get(None, [])
    ordered_rows: list = []
    seen: set[int] = set()
    stack = list(reversed(starts))
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        row = by_id.get(current)
        if row is None:
            continue
        ordered_rows.append(row)
        stack.extend(reversed(children.get(current, [])))

    chapter_ids = [row.id for row in ordered_rows if row.node_type == "chapter"]
    bodies: dict[int, str | None] = {}
    if chapter_ids:
        bodies = dict(
            db.query(ManuscriptNode.id, ManuscriptNode.body)
            .filter(ManuscriptNode.id.in_(chapter_ids))
            .all()
        )
    return [
        {
            "id": row.id,
            "title": row.title,
            "node_type": row.node_type,
            "body": bodies.get(row.id),
            "char_count_with_spaces": row.char_count_with_spaces or 0,
            "char_count_plain": row.char_count_plain or 0,
        }
        for row in ordered_rows
    ]


def get_scrivenings(
    db: Session,
    user_id: int,
    *,
    project_id: int | None = None,
    root_id: int | None = None,
    include_deleted: bool = False,
) -> list[dict]:
    if project_id is None and root_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id or root_id is required",
        )
    if root_id is not None:
        root = _get_node_or_404(
            db, root_id, user_id, include_deleted=include_deleted
        )
        project_id = root.project_id
    ordered = _preorder_nodes(
        db,
        user_id,
        project_id=project_id,
        root_id=root_id,
        include_deleted=include_deleted,
    )
    return [node for node in ordered if node["node_type"] == "chapter"]


def publish_node(
    db: Session,
    node_id: int,
    payload: schemas.PublishRequest,
    user_id: int,
) -> dict:
    node = _get_node_or_404(db, node_id, user_id, for_update=True)
    if node.node_type != "chapter":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only chapter nodes can be published",
        )
    now = _utcnow()
    if (
        node.published_at is not None
        and (now - node.published_at).total_seconds() < PUBLISH_COOLDOWN_SECONDS
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="발행 후 5초 동안 다시 발행할 수 없습니다.",
        )

    project = (
        db.query(ManuscriptProject)
        .filter(ManuscriptProject.id == node.project_id)
        .first()
    )
    linked_book_id = project.linked_book_id if project else None
    target_book_id = (
        payload.target_book_id
        if payload.target_book_id is not None
        else linked_book_id
    )
    if target_book_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connect a book to the project or choose a target book",
        )
    _get_book_or_404(db, target_book_id, user_id)
    # Publishing to the project's linked book keeps the manuscript/chapter
    # link. Publishing elsewhere only creates a chapter in that book's TOC.
    is_linked_target = target_book_id == linked_book_id

    chapter = None
    if is_linked_target and node.published_chapter_id:
        chapter = (
            db.query(Chapter)
            .filter(
                Chapter.id == node.published_chapter_id,
                Chapter.user_id == user_id,
                Chapter.book_id == target_book_id,
            )
            .first()
        )
    chapter_body = prepare_chapter_html(node.body)
    if chapter is None:
        # The linked post may have been deleted on the bookshelf side. The two
        # tables are independent, so publish a fresh chapter instead.
        chapter = Chapter(
            user_id=user_id,
            book_id=target_book_id,
            title=node.title,
            subtitle=node.subtitle,
            body=chapter_body,
            tags=[],
            order=_next_chapter_order(db, target_book_id),
        )
        db.add(chapter)
        db.flush()

    # Content ownership only. Publication settings stay in book management.
    chapter.title = node.title
    chapter.subtitle = node.subtitle
    chapter.body = chapter_body
    db.flush()

    # Place the post where the author chose.  Re-publishing without an
    # explicit ``toc_parent_id`` keeps the node where it already is.
    serial_node_crud.ensure_post(
        db,
        user_id,
        target_book_id,
        chapter.id,
        payload.toc_parent_id,
        set_parent="toc_parent_id" in payload.model_fields_set,
    )

    if is_linked_target:
        node.published_chapter_id = chapter.id
        node.published_manuscript_hash = _content_hash(
            node.title, node.subtitle, node.body
        )
        node.published_chapter_hash = _content_hash(
            chapter.title, chapter.subtitle, chapter.body
        )
    node.published_at = _utcnow()
    db.commit()
    db.refresh(node)
    return {
        "node": get_node(db, node.id, user_id),
        "chapter_id": chapter.id,
        "book_id": chapter.book_id,
        "linked": is_linked_target,
    }


def _next_chapter_order(db: Session, book_id: int) -> int:
    from sqlalchemy import func

    return (db.query(func.max(Chapter.order)).filter(Chapter.book_id == book_id).scalar() or 0) + 1


def get_public_toc(
    db: Session,
    book_id: int,
    *,
    author_id: int | None,
    viewer_user_id: int | None = None,
    can_view_hidden: bool = False,
) -> list[dict]:
    """Return the reader TOC, including a viewer's own hidden posts."""
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Does not exist book",
    )
    if author_id is None:
        raise not_found
    book_query = (
        db.query(Book)
        .options(joinedload(Book.category_relation))
        .filter(Book.id == book_id)
    )
    if can_view_hidden:
        pass
    elif viewer_user_id is not None:
        book_query = book_query.filter(
            or_(
                and_(Book.visible.is_(True), Book.user_id == author_id),
                Book.user_id == viewer_user_id,
            )
        )
    else:
        book_query = book_query.filter(
            Book.visible.is_(True),
            Book.user_id == author_id,
        )
    book = book_query.first()
    if book is None or not _category_is_visible_to(
        book,
        viewer_user_id=viewer_user_id,
        can_view_hidden=can_view_hidden,
    ):
        raise not_found

    chapter_filters = [
        Chapter.book_id == book_id,
        or_(
            Chapter.published_at.is_(None),
            Chapter.published_at <= _utcnow(),
        ),
    ]
    if not can_view_hidden:
        if viewer_user_id is None:
            chapter_filters.append(Chapter.visible.is_(True))
        elif book.user_id != viewer_user_id:
            # Book owners see every chapter in their book. Other signed-in
            # readers only gain access to their own hidden chapters.
            chapter_filters.append(
                or_(
                    Chapter.visible.is_(True),
                    Chapter.user_id == viewer_user_id,
                )
            )

    chapters = {
        chapter.id: chapter
        for chapter in db.query(Chapter)
        .options(
            load_only(
                Chapter.id,
                Chapter.title,
                Chapter.subtitle,
                Chapter.protected,
                Chapter.published_at,
                Chapter.updated_at,
                Chapter.order,
            )
        )
        .filter(*chapter_filters)
        .order_by(Chapter.order.asc(), Chapter.id.asc())
        .all()
    }
    nodes = (
        db.query(SerialNode)
        .filter(SerialNode.book_id == book_id)
        .order_by(
            SerialNode.parent_id.asc().nullsfirst(),
            SerialNode.position.asc(),
            SerialNode.id.asc(),
        )
        .all()
    )

    def chapter_summary(chapter: Chapter) -> dict:
        return {
            "id": chapter.id,
            "title": chapter.title,
            "subtitle": chapter.subtitle,
            "locked": bool(book.protected or chapter.protected),
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

    result = [build(node) for node in children.get(None, [])]
    placed_ids = {
        node.chapter_id for node in nodes if node.node_type == "post"
    }
    unassigned = [
        chapter
        for chapter_id, chapter in chapters.items()
        if chapter_id not in placed_ids
    ]
    if unassigned:
        result.append(
            {
                "id": -1,
                "node_type": "folder",
                "label": "목차에 소속되지 않은 게시글",
                "position": 10**9,
                "unassigned": True,
                "children": [
                    {
                        "id": None,
                        "node_type": "post",
                        "label": chapter.title,
                        "position": index,
                        "chapter": chapter_summary(chapter),
                        "children": [],
                    }
                    for index, chapter in enumerate(unassigned)
                ],
            }
        )
    return result


def _numbered_title(title: str, existing: set[str]) -> str:
    """Return ``title`` or ``title 2``/``title 3`` like a filesystem."""
    if title not in existing:
        return title

    counter = 2
    while f"{title} {counter}" in existing:
        counter += 1
    return f"{title} {counter}"


def _unique_project_title(db: Session, user_id: int, title: str) -> str:
    existing = {
        value
        for (value,) in db.query(ManuscriptProject.title)
        .filter(ManuscriptProject.user_id == user_id)
        .all()
    }
    return _numbered_title(title, existing)


def _upload_name_stem(filename: str) -> str:
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    stem = name.rsplit(".", 1)[0] if "." in name else name
    return stem or "가져온 원고"


def _add_parsed_nodes(
    db: Session,
    project: ManuscriptProject,
    user_id: int,
    parsed: list,
) -> int:
    ids: list[int | None] = []
    used_titles: dict[int | None, set[str]] = defaultdict(set)
    for position, item in enumerate(parsed):
        parent_id = (
            ids[item.parent_index] if item.parent_index is not None else None
        )
        title = _numbered_title(item.title, used_titles[parent_id])
        used_titles[parent_id].add(title)
        body = item.body or ""
        for image_index, image in enumerate(item.images):
            placeholder = (
                f"{IMAGE_PLACEHOLDER_PREFIX}{image_index}"
                f"{IMAGE_PLACEHOLDER_SUFFIX}"
            )
            try:
                url = public_url(save_image_bytes(image))
            except Exception:
                # A corrupt or unsupported attachment must not block the import.
                body = body.replace(placeholder, "")
                continue
            width, height = (
                item.image_sizes[image_index]
                if image_index < len(item.image_sizes)
                else (None, None)
            )
            size_attrs = ""
            if width:
                size_attrs += f' width="{width}"'
            if height:
                size_attrs += f' height="{height}"'
            image_html = f'<img src="{url}" alt=""{size_attrs} />'
            if placeholder in body:
                body = body.replace(placeholder, image_html)
            else:
                body += f"<p>{image_html}</p>"
        with_spaces, plain = count_characters(body)
        node = ManuscriptNode(
            project_id=project.id,
            user_id=user_id,
            parent_id=parent_id,
            node_type=item.node_type,
            title=title,
            body=body or None,
            synopsis=item.synopsis or None,
            notes=item.notes or None,
            position=position,
            char_count_with_spaces=with_spaces,
            char_count_plain=plain,
        )
        db.add(node)
        db.flush()
        ids.append(node.id)
    return len(parsed)


def create_import_project(
    db: Session,
    user_id: int,
    data: bytes,
    filename: str,
) -> dict:
    """Create the project shell before the expensive archive parsing starts."""
    try:
        title = read_scrivener_project_title(
            data, fallback=_upload_name_stem(filename)
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    project = ManuscriptProject(
        user_id=user_id,
        title=_unique_project_title(db, user_id, title),
        import_status="importing",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        "project_id": project.id,
        "project_title": project.title,
        "import_status": "importing",
    }


def finish_scrivener_import(
    db: Session,
    project_id: int,
    user_id: int,
    data: bytes,
) -> dict:
    """Populate a project shell and record the final import state."""
    project = (
        db.query(ManuscriptProject)
        .filter(ManuscriptProject.id == project_id, ManuscriptProject.user_id == user_id)
        .one_or_none()
    )
    if project is None:
        return {"status": "missing"}

    try:
        _source_title, parsed = parse_scrivener_zip(data)
        db.query(ManuscriptNode).filter(
            ManuscriptNode.project_id == project_id,
            ManuscriptNode.user_id == user_id,
        ).delete(synchronize_session=False)
        count = _add_parsed_nodes(db, project, user_id, parsed)
        project.import_status = "ready"
        project.import_error = None
        db.commit()
        return {"status": "ready", "imported_count": count}
    except Exception as exc:
        db.rollback()
        project = (
            db.query(ManuscriptProject)
            .filter(
                ManuscriptProject.id == project_id,
                ManuscriptProject.user_id == user_id,
            )
            .one_or_none()
        )
        if project is not None:
            project.import_status = "failed"
            project.import_error = str(exc)[:1000]
            db.commit()
        return {"status": "failed", "error": str(exc)}


def run_import_in_background(project_id: int, user_id: int, data: bytes) -> dict:
    """Background-task entry point with its own database session."""
    db = SessionLocal()
    try:
        return finish_scrivener_import(db, project_id, user_id, data)
    finally:
        db.close()


def import_scrivener(
    db: Session,
    user_id: int,
    data: bytes,
) -> dict:
    """Synchronous import kept for callers that need the finished result."""
    try:
        source_title, parsed = parse_scrivener_zip(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    project = ManuscriptProject(
        user_id=user_id,
        title=_unique_project_title(db, user_id, source_title),
        import_status="ready",
    )
    db.add(project)
    db.flush()
    count = _add_parsed_nodes(db, project, user_id, parsed)

    db.commit()
    return {
        "project_id": project.id,
        "project_title": project.title,
        "imported_count": count,
    }


def export_scrivener(
    db: Session,
    project_id: int,
    user_id: int,
) -> tuple[bytes, str]:
    """Return a zipped Scrivener project for the given manuscript project."""
    project = _get_project_or_404(db, project_id, user_id)
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
    live_ids = {node.id for node in nodes}

    def load_body_image(src: str) -> bytes | None:
        try:
            with open_uploaded_file(src) as (handle, _content_type, _size):
                return handle.read()
        except Exception:
            # External or missing images should not block the export.
            return None

    export_nodes = [
        ExportNode(
            id=node.id,
            parent_id=node.parent_id if node.parent_id in live_ids else None,
            node_type=node.node_type,
            title=node.title,
            body=node.body,
            synopsis=node.synopsis,
            notes=node.notes,
            body_rtf=(
                html_to_rtf_with_images(node.body, load_body_image)
                if node.node_type == "chapter" and node.body
                else None
            ),
        )
        for node in nodes
    ]
    return (
        build_scrivener_zip(project.title, export_nodes),
        safe_filename(project.title),
    )
