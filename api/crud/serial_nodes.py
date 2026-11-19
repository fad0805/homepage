"""Management helpers for the public per-book table of contents.

The reader-facing TOC is stored in ``serial_nodes``.  These helpers keep that
tree independent from the manuscript tree: posts are placed explicitly by the
author instead of mirroring manuscript folders automatically.
"""

from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.books import Book, Chapter
from models.manuscript import SerialNode


def _book_or_404(db: Session, book_id: int, user_id: int) -> Book:
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


def _node_or_404(db: Session, node_id: int, user_id: int) -> SerialNode:
    node = (
        db.query(SerialNode)
        .join(Book, Book.id == SerialNode.book_id)
        .filter(SerialNode.id == node_id, Book.user_id == user_id)
        .first()
    )
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist TOC node",
        )
    return node


def _parent_or_404(
    db: Session, parent_id: int | None, book_id: int
) -> SerialNode | None:
    if parent_id is None:
        return None
    parent = (
        db.query(SerialNode)
        .filter(
            SerialNode.id == parent_id,
            SerialNode.book_id == book_id,
            SerialNode.node_type == "folder",
        )
        .first()
    )
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOC parent must be a folder in the same book",
        )
    return parent


def _next_position(db: Session, book_id: int, parent_id: int | None) -> int:
    query = db.query(func.max(SerialNode.position)).filter(
        SerialNode.book_id == book_id
    )
    if parent_id is None:
        query = query.filter(SerialNode.parent_id.is_(None))
    else:
        query = query.filter(SerialNode.parent_id == parent_id)
    return (query.scalar() or 0) + 1


def _serialize_tree(db: Session, book: Book) -> list[dict]:
    chapters = {
        chapter.id: chapter
        for chapter in db.query(Chapter)
        .filter(Chapter.book_id == book.id)
        .all()
    }
    nodes = (
        db.query(SerialNode)
        .filter(SerialNode.book_id == book.id)
        .order_by(
            SerialNode.parent_id.asc().nullsfirst(),
            SerialNode.position.asc(),
            SerialNode.id.asc(),
        )
        .all()
    )

    children: dict[int | None, list[SerialNode]] = defaultdict(list)
    for node in nodes:
        children[node.parent_id].append(node)
    for siblings in children.values():
        siblings.sort(key=lambda item: (item.position, item.id))

    def build(node: SerialNode) -> dict:
        chapter = chapters.get(node.chapter_id) if node.node_type == "post" else None
        return {
            "id": node.id,
            "parent_id": node.parent_id,
            "node_type": node.node_type,
            "label": node.label or (chapter.title if chapter else None),
            "position": node.position,
            "chapter_id": chapter.id if chapter else node.chapter_id,
            "pinned": bool(chapter and chapter.pinned),
            "locked": bool(book.protected or (chapter and chapter.protected)),
            "children": [build(child) for child in children.get(node.id, [])],
        }

    return [build(node) for node in children.get(None, [])]


def ensure_toc_started(
    db: Session,
    book_id: int,
    user_id: int,
    *,
    exclude_chapter_id: int | None = None,
) -> None:
    """Give a legacy book a managed TOC once its first node is created.

    Without this, moving one new chapter into a folder would hide every other
    chapter from the reader TOC because the flat fallback would no longer be
    used.
    """
    if db.query(SerialNode.id).filter(SerialNode.book_id == book_id).first():
        return
    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.order.asc(), Chapter.id.asc())
        .all()
    )
    for chapter in chapters:
        if chapter.id == exclude_chapter_id:
            continue
        db.add(
            SerialNode(
                user_id=user_id,
                book_id=book_id,
                parent_id=None,
                node_type="post",
                chapter_id=chapter.id,
                label=None,
                position=_next_position(db, book_id, None),
            )
        )
        db.flush()


def get_manage_toc(db: Session, book_id: int, user_id: int) -> list[dict]:
    book = _book_or_404(db, book_id, user_id)
    return _serialize_tree(db, book)


def create_folder(
    db: Session,
    book_id: int,
    user_id: int,
    label: str,
    parent_id: int | None,
) -> list[dict]:
    book = _book_or_404(db, book_id, user_id)
    title = label.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="폴더 이름을 입력해주세요.",
        )
    _parent_or_404(db, parent_id, book_id)
    existing = (
        db.query(SerialNode)
        .filter(
            SerialNode.book_id == book_id,
            SerialNode.node_type == "folder",
            SerialNode.parent_id.is_(parent_id)
            if parent_id is None
            else SerialNode.parent_id == parent_id,
            SerialNode.label == title,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="같은 위치에 같은 이름의 폴더가 있습니다.",
        )

    ensure_toc_started(db, book_id, user_id)
    folder = SerialNode(
        user_id=user_id,
        book_id=book_id,
        parent_id=parent_id,
        node_type="folder",
        label=title,
        position=_next_position(db, book_id, parent_id),
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _serialize_tree(db, book)


def _validate_parent(
    db: Session, node: SerialNode, parent_id: int | None
) -> None:
    parent = _parent_or_404(db, parent_id, node.book_id)
    current = parent
    while current is not None:
        if current.id == node.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="폴더를 자기 하위로 옮길 수 없습니다.",
            )
        current = (
            db.query(SerialNode)
            .filter(SerialNode.id == current.parent_id)
            .first()
            if current.parent_id
            else None
        )


def update_node(
    db: Session,
    node_id: int,
    user_id: int,
    *,
    label: str | None = None,
    label_set: bool = False,
    parent_id: int | None = None,
    parent_set: bool = False,
) -> list[dict]:
    node = _node_or_404(db, node_id, user_id)
    book = _book_or_404(db, node.book_id, user_id)
    if label_set:
        if node.node_type != "folder":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="게시글 노드의 이름은 챕터 제목을 따릅니다.",
            )
        title = (label or "").strip()
        if not title:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="폴더 이름을 입력해주세요.",
            )
        duplicate = (
            db.query(SerialNode.id)
            .filter(
                SerialNode.book_id == node.book_id,
                SerialNode.node_type == "folder",
                SerialNode.parent_id.is_(node.parent_id)
                if node.parent_id is None
                else SerialNode.parent_id == node.parent_id,
                SerialNode.label == title,
                SerialNode.id != node.id,
            )
            .first()
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="같은 위치에 같은 이름의 폴더가 있습니다.",
            )
        node.label = title
    if parent_set:
        _validate_parent(db, node, parent_id)
        if parent_id != node.parent_id:
            node.parent_id = parent_id
            node.position = _next_position(db, node.book_id, parent_id)
    db.commit()
    db.refresh(node)
    return _serialize_tree(db, book)


def move_node(
    db: Session,
    node_id: int,
    user_id: int,
    parent_id: int | None,
    position: int,
) -> list[dict]:
    """Move a node to ``parent_id`` at ``position`` in one transaction."""
    node = _node_or_404(db, node_id, user_id)
    book = _book_or_404(db, node.book_id, user_id)
    _validate_parent(db, node, parent_id)

    old_parent_id = node.parent_id
    old_position = node.position

    def siblings(parent: int | None) -> list[SerialNode]:
        query = db.query(SerialNode).filter(
            SerialNode.book_id == book.id,
            SerialNode.id != node.id,
        )
        if parent is None:
            query = query.filter(SerialNode.parent_id.is_(None))
        else:
            query = query.filter(SerialNode.parent_id == parent)
        return query.order_by(
            SerialNode.position.asc(), SerialNode.id.asc()
        ).all()

    index = max(0, position)
    if old_parent_id == parent_id and old_position < index:
        index -= 1
    target_siblings = siblings(parent_id)
    index = min(index, len(target_siblings))
    target_siblings.insert(index, node)
    for sibling_position, sibling in enumerate(target_siblings):
        sibling.parent_id = parent_id
        sibling.position = sibling_position

    if old_parent_id != parent_id:
        for sibling_position, sibling in enumerate(siblings(old_parent_id)):
            sibling.position = sibling_position

    db.commit()
    return _serialize_tree(db, book)


def delete_node(db: Session, node_id: int, user_id: int) -> list[dict]:
    node = _node_or_404(db, node_id, user_id)
    book = _book_or_404(db, node.book_id, user_id)
    child_count = (
        db.query(SerialNode.id).filter(SerialNode.parent_id == node.id).count()
    )
    if child_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="하위 항목을 먼저 옮기거나 삭제해주세요.",
        )
    db.delete(node)
    db.commit()
    return _serialize_tree(db, book)


def ensure_post(
    db: Session,
    user_id: int,
    book_id: int,
    chapter_id: int,
    parent_id: int | None,
    *,
    set_parent: bool,
) -> SerialNode:
    """Create or position the serial node that represents a chapter."""
    chapter = (
        db.query(Chapter)
        .filter(
            Chapter.id == chapter_id,
            Chapter.book_id == book_id,
            Chapter.user_id == user_id,
        )
        .first()
    )
    if chapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Does not exist chapter",
        )
    existing = (
        db.query(SerialNode)
        .filter(SerialNode.chapter_id == chapter_id)
        .first()
    )
    if existing is not None:
        book_changed = existing.book_id != book_id
        if set_parent or book_changed:
            final_parent = parent_id if set_parent else None
            _parent_or_404(db, final_parent, book_id)
            existing.book_id = book_id
            existing.user_id = user_id
            existing.parent_id = final_parent
            existing.position = _next_position(db, book_id, final_parent)
        return existing

    ensure_toc_started(
        db, book_id, user_id, exclude_chapter_id=chapter_id
    )
    _parent_or_404(db, parent_id, book_id)
    post = SerialNode(
        user_id=user_id,
        book_id=book_id,
        parent_id=parent_id,
        node_type="post",
        chapter_id=chapter_id,
        label=None,
        position=_next_position(db, book_id, parent_id),
    )
    db.add(post)
    db.flush()
    return post


def add_post(
    db: Session,
    book_id: int,
    user_id: int,
    chapter_id: int,
    parent_id: int | None,
    position: int | None = None,
) -> list[dict]:
    """Register an existing chapter in the managed table of contents."""
    book = _book_or_404(db, book_id, user_id)
    post = ensure_post(
        db,
        user_id,
        book_id,
        chapter_id,
        parent_id,
        set_parent=True,
    )
    if position is None:
        db.commit()
    else:
        move_node(db, post.id, user_id, parent_id, position)
    return _serialize_tree(db, book)
