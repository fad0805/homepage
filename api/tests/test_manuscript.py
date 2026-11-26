import asyncio
import base64
from contextlib import contextmanager
import unittest
from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import patch
from zipfile import ZipFile

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.scrivener import (
    parse_scrivener_zip,
    read_scrivener_project_title,
    read_upload_limited,
)
from core.text_stats import count_characters
from crud import books as books_crud
from crud import manuscript as crud
from crud import serial_nodes as toc_crud
from db.base import Base
from models.books import Book, BookCategory, Chapter
from models.illustrations import Illustration, IllustrationImage  # noqa: F401
from models.manuscript import ManuscriptNode, ManuscriptProject, SerialNode
from models.users import User
from schemas import books as book_schemas
from schemas import manuscript as schemas


class _ChunkedUpload:
    def __init__(self, chunks, size=None) -> None:
        self.chunks = iter(chunks)
        self.size = size
        self.read_sizes: list[int] = []
        self.closed = False

    async def read(self, size: int) -> bytes:
        self.read_sizes.append(size)
        return next(self.chunks, b"")

    async def close(self) -> None:
        self.closed = True


class ReadUploadLimitedTests(unittest.TestCase):
    def test_reads_in_chunks_and_returns_full_data(self) -> None:
        upload = _ChunkedUpload([b"ab", b"cd", b""])

        data = asyncio.run(read_upload_limited(upload, limit=10, chunk_size=2))

        self.assertEqual(data, b"abcd")
        self.assertEqual(upload.read_sizes, [2, 2, 2])
        self.assertTrue(upload.closed)

    def test_stops_as_soon_as_cumulative_size_exceeds_limit(self) -> None:
        upload = _ChunkedUpload([b"a" * 4, b"b" * 4, b"c" * 4])

        with self.assertRaisesRegex(ValueError, "파일이 너무 큽니다"):
            asyncio.run(read_upload_limited(upload, limit=10, chunk_size=4))

        self.assertEqual(upload.read_sizes, [4, 4, 4])
        self.assertTrue(upload.closed)

    def test_declared_size_is_rejected_without_reading(self) -> None:
        upload = _ChunkedUpload([b"x"], size=11)

        with self.assertRaisesRegex(ValueError, "파일이 너무 큽니다"):
            asyncio.run(read_upload_limited(upload, limit=10, chunk_size=4))

        self.assertEqual(upload.read_sizes, [])
        self.assertTrue(upload.closed)


class ManuscriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.owner = User(username="owner", hashed_password="x")
        self.other = User(username="other", hashed_password="x")
        self.db.add_all([self.owner, self.other])
        self.db.flush()
        self.book = Book(user_id=self.owner.id, title="연재책", tags=[])
        self.db.add(self.book)
        self.db.flush()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _project(self, *, linked_book: bool = True) -> ManuscriptProject:
        project = ManuscriptProject(
            user_id=self.owner.id,
            title="원고",
            linked_book_id=self.book.id if linked_book else None,
        )
        self.db.add(project)
        self.db.flush()
        return project

    def _node(
        self,
        project: ManuscriptProject,
        title: str,
        *,
        node_type: str = "chapter",
        parent_id: int | None = None,
        body: str | None = None,
    ) -> ManuscriptNode:
        with_spaces, plain = count_characters(body)
        node = ManuscriptNode(
            project_id=project.id,
            user_id=self.owner.id,
            parent_id=parent_id,
            node_type=node_type,
            title=title,
            body=body,
            position=0,
            char_count_with_spaces=with_spaces,
            char_count_plain=plain,
        )
        self.db.add(node)
        self.db.flush()
        return node

    def _clear_publish_cooldown(self, node: ManuscriptNode) -> None:
        node.published_at = datetime.now(timezone.utc).replace(
            tzinfo=None
        ) - timedelta(seconds=6)
        self.db.commit()
        self.db.refresh(node)

    def test_delete_project_removes_its_nodes(self) -> None:
        project = self._project()
        self._node(project, "챕터")
        crud.delete_project(self.db, project.id, self.owner.id)
        self.assertIsNone(
            self.db.query(ManuscriptNode)
            .filter(ManuscriptNode.project_id == project.id)
            .first()
        )

    def test_linked_book_must_belong_to_owner(self) -> None:
        other_book = Book(user_id=self.other.id, title="남의 책", tags=[])
        self.db.add(other_book)
        self.db.flush()

        with self.assertRaises(HTTPException):
            crud.create_project(
                self.db,
                schemas.ProjectCreate(title="원고", linked_book_id=other_book.id),
                self.owner.id,
            )

        project = self._project(linked_book=False)
        with self.assertRaises(HTTPException):
            crud.update_project(
                self.db,
                project.id,
                schemas.ProjectUpdate(linked_book_id=other_book.id),
                self.owner.id,
            )

    def test_character_counts_include_spaces_and_separate_plain(self) -> None:
        self.assertEqual(
            count_characters("<p>가 나다</p><p>라</p>"),
            (6, 4),
        )
        self.assertEqual(count_characters("<p>가&nbsp;나</p>"), (3, 2))
        self.assertEqual(count_characters(None), (0, 0))

    def test_node_body_update_recalculates_counts(self) -> None:
        project = self._project()
        node = crud.create_node(
            self.db,
            schemas.NodeCreate(
                project_id=project.id,
                node_type="chapter",
                title="1화",
                body="<p>가 나다</p>",
            ),
            self.owner.id,
        )
        self.assertEqual(node["char_count_with_spaces"], 4)

        updated = crud.update_node(
            self.db,
            node["id"],
            schemas.NodeUpdate(body="<p>가나다</p>"),
            self.owner.id,
        )
        self.assertEqual(updated["char_count_with_spaces"], 3)
        self.assertEqual(updated["char_count_plain"], 3)

    def test_save_combined_commits_all_bodies(self) -> None:
        project = self._project()
        folder = self._node(project, "폴더", node_type="folder")
        first = self._node(project, "1", parent_id=folder.id, body="<p>old1</p>")
        second = self._node(project, "2", parent_id=folder.id, body="<p>old2</p>")

        result = crud.save_combined(
            self.db,
            folder.id,
            schemas.CombinedSaveRequest(
                bodies={first.id: "<p>new1</p>", second.id: "<p>새 본문</p>"},
                notes="작가 메모",
            ),
            self.owner.id,
        )
        self.assertEqual(result["saved"], 2)

        self.db.refresh(first)
        self.db.refresh(second)
        self.db.refresh(folder)
        self.assertEqual(first.body, "<p>new1</p>")
        self.assertEqual(second.body, "<p>새 본문</p>")
        self.assertEqual(second.char_count_plain, 3)
        self.assertEqual(folder.notes, "작가 메모")

    def test_save_combined_does_not_partially_write(self) -> None:
        project = self._project()
        folder = self._node(project, "폴더", node_type="folder")
        first = self._node(project, "1", parent_id=folder.id, body="<p>old1</p>")
        other_project = self._project(linked_book=False)
        foreign = self._node(other_project, "남의 문서")

        with self.assertRaises(HTTPException):
            crud.save_combined(
                self.db,
                folder.id,
                schemas.CombinedSaveRequest(
                    bodies={first.id: "<p>new1</p>", foreign.id: "<p>실패</p>"}
                ),
                self.owner.id,
            )
        self.db.refresh(first)
        self.assertEqual(first.body, "<p>old1</p>")
        self.db.commit()

        with patch.object(self.db, "commit", side_effect=RuntimeError("db down")):
            with self.assertRaises(RuntimeError):
                crud.save_combined(
                    self.db,
                    folder.id,
                    schemas.CombinedSaveRequest(
                        bodies={first.id: "<p>커밋 실패</p>"}
                    ),
                    self.owner.id,
                )
        fresh = self.db.get(ManuscriptNode, first.id)
        self.assertEqual(fresh.body, "<p>old1</p>")

    def test_tree_move_rejects_cycles(self) -> None:
        project = self._project()
        root = self._node(project, "1권", node_type="folder")
        child = self._node(project, "1장", node_type="folder", parent_id=root.id)
        self._node(project, "씬", parent_id=child.id)

        with self.assertRaises(HTTPException):
            crud.move_node(
                self.db,
                root.id,
                schemas.NodeMoveRequest(parent_id=child.id),
                self.owner.id,
            )

        moved = crud.move_node(
            self.db,
            child.id,
            schemas.NodeMoveRequest(parent_id=None, position=2),
            self.owner.id,
        )
        self.assertIsNone(moved["parent_id"])

    def test_update_node_rejects_cycles(self) -> None:
        project = self._project()
        first = self._node(project, "A", node_type="folder")
        second = self._node(project, "B", node_type="folder")

        crud.update_node(
            self.db,
            first.id,
            schemas.NodeUpdate(parent_id=second.id),
            self.owner.id,
        )
        with self.assertRaises(HTTPException):
            crud.update_node(
                self.db,
                second.id,
                schemas.NodeUpdate(parent_id=first.id),
                self.owner.id,
            )
        self.db.refresh(second)
        self.assertIsNone(second.parent_id)

    def test_reorder_nodes_rejects_cycles(self) -> None:
        project = self._project()
        first = self._node(project, "A", node_type="folder")
        second = self._node(project, "B", node_type="folder")

        with self.assertRaises(HTTPException):
            crud.reorder_nodes(
                self.db,
                project.id,
                schemas.NodeReorderRequest(
                    items=[
                        schemas.NodeReorderItem(
                            id=first.id, parent_id=second.id, position=0
                        ),
                        schemas.NodeReorderItem(
                            id=second.id, parent_id=first.id, position=1
                        ),
                    ]
                ),
                self.owner.id,
            )
        self.db.refresh(first)
        self.db.refresh(second)
        self.assertIsNone(first.parent_id)
        self.assertIsNone(second.parent_id)

    def test_descendant_ids_survives_a_preexisting_cycle(self) -> None:
        project = self._project()
        first = self._node(project, "A", node_type="folder")
        second = self._node(project, "B", node_type="folder")
        first.parent_id = second.id
        second.parent_id = first.id
        self.db.commit()

        result = crud.delete_node(self.db, first.id, self.owner.id)
        self.assertEqual(result["moved_to_trash"], 2)

    def test_delete_moves_subtree_to_trash_and_restore(self) -> None:
        project = self._project()
        root = self._node(project, "1권", node_type="folder")
        child = self._node(project, "1화", parent_id=root.id)

        result = crud.delete_node(self.db, root.id, self.owner.id)
        self.assertEqual(result["moved_to_trash"], 2)
        self.assertEqual(len(crud.get_trash(self.db, self.owner.id)), 2)

        restored = crud.restore_node(self.db, root.id, self.owner.id)
        self.assertEqual(restored["restored"], 2)
        self.assertEqual(crud.get_trash(self.db, self.owner.id), [])
        self.assertIsNotNone(
            self.db.query(ManuscriptNode).filter(ManuscriptNode.id == child.id).first()
        )

    def test_purge_expired_trash(self) -> None:
        project = self._project()
        node = self._node(project, "오래된 노드")
        node_id = node.id
        node.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
        self.db.commit()

        self.assertEqual(crud.purge_expired(self.db), 1)
        self.assertIsNone(
            self.db.query(ManuscriptNode)
            .filter(ManuscriptNode.id == node_id)
            .first()
        )

    def test_purge_expired_trash_is_scoped_to_owner(self) -> None:
        project = self._project()
        other_project = ManuscriptProject(
            user_id=self.other.id, title="다른 사용자 원고"
        )
        self.db.add(other_project)
        self.db.flush()

        owner_node_id = self._node(project, "내 오래된 노드").id
        other_node = self._node(other_project, "남의 오래된 노드")
        other_node.user_id = self.other.id
        other_node_id = other_node.id
        expired = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
        for node_id in (owner_node_id, other_node_id):
            self.db.query(ManuscriptNode).filter(ManuscriptNode.id == node_id).one().deleted_at = expired
        self.db.commit()

        self.assertEqual(crud.purge_expired(self.db, user_id=self.owner.id), 1)
        self.assertIsNone(
            self.db.query(ManuscriptNode).filter(ManuscriptNode.id == owner_node_id).first()
        )
        self.assertIsNotNone(
            self.db.query(ManuscriptNode).filter(ManuscriptNode.id == other_node_id).first()
        )

        self.assertEqual(crud.purge_expired(self.db, user_id=self.other.id), 1)
        self.assertIsNone(
            self.db.query(ManuscriptNode).filter(ManuscriptNode.id == other_node_id).first()
        )

    def test_trash_and_purge_can_be_scoped_to_project(self) -> None:
        project_a = self._project()
        project_b = self._project(linked_book=False)
        a_id = self._node(project_a, "A 원고").id
        b_id = self._node(project_b, "B 원고").id

        crud.delete_node(self.db, a_id, self.owner.id)
        crud.delete_node(self.db, b_id, self.owner.id)

        self.assertEqual(
            [item["id"] for item in crud.get_trash(self.db, self.owner.id, project_id=project_a.id)],
            [a_id],
        )

        expired = self.db.query(ManuscriptNode).filter(ManuscriptNode.id == b_id).one()
        expired.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
        self.db.commit()

        self.assertEqual(crud.purge_expired(self.db, project_id=project_a.id), 0)
        self.assertEqual(crud.purge_expired(self.db, project_id=project_b.id), 1)

    def test_trash_keeps_parent_structure(self) -> None:
        project = self._project()
        folder_id = self._node(project, "폴더", node_type="folder").id
        child_id = self._node(project, "챕터", parent_id=folder_id).id

        crud.delete_node(self.db, folder_id, self.owner.id)

        items = {
            item["id"]: item
            for item in crud.get_trash(self.db, self.owner.id, project_id=project.id)
        }
        self.assertIsNone(items[folder_id]["parent_id"])
        self.assertEqual(items[child_id]["parent_id"], folder_id)

    def test_convert_folder_to_document_keeps_children(self) -> None:
        project = self._project()
        folder_id = self._node(project, "폴더", node_type="folder").id
        child_id = self._node(project, "하위 문서", parent_id=folder_id).id

        converted = crud.convert_folder_to_document(
            self.db, folder_id, self.owner.id
        )

        self.assertEqual(converted["node_type"], "chapter")
        self.assertEqual(converted["body"], "<p></p>")
        self.assertEqual(converted["char_count_plain"], 0)
        tree = crud.get_tree(self.db, project.id, self.owner.id)
        self.assertEqual(tree[1]["id"], child_id)
        self.assertEqual(tree[1]["parent_id"], folder_id)
        with self.assertRaises(HTTPException):
            crud.convert_folder_to_document(self.db, folder_id, self.owner.id)

    def test_parent_document_combines_with_children(self) -> None:
        project = self._project()
        parent = self._node(project, "부모 문서", body="<p>부모</p>")
        child = self._node(
            project, "하위 문서", parent_id=parent.id, body="<p>하위</p>"
        )

        docs = crud.get_scrivenings(
            self.db, self.owner.id, root_id=parent.id
        )
        self.assertEqual([doc["id"] for doc in docs], [parent.id, child.id])

        result = crud.save_combined(
            self.db,
            parent.id,
            schemas.CombinedSaveRequest(
                bodies={
                    parent.id: "<p>새 부모</p>",
                    child.id: "<p>새 하위</p>",
                },
                synopsis="부모 요약",
            ),
            self.owner.id,
        )
        self.assertEqual(result["saved"], 2)
        self.db.refresh(parent)
        self.db.refresh(child)
        self.assertEqual(parent.body, "<p>새 부모</p>")
        self.assertEqual(parent.synopsis, "부모 요약")
        self.assertEqual(child.body, "<p>새 하위</p>")

    def test_scrivenings_can_read_deleted_folder(self) -> None:
        project = self._project()
        folder_id = self._node(project, "폴더", node_type="folder").id
        first_id = self._node(project, "1화", parent_id=folder_id).id
        second_id = self._node(project, "2화", parent_id=folder_id).id

        crud.delete_node(self.db, folder_id, self.owner.id)

        with self.assertRaises(HTTPException):
            crud.get_scrivenings(self.db, self.owner.id, root_id=folder_id)

        docs = crud.get_scrivenings(
            self.db, self.owner.id, root_id=folder_id, include_deleted=True
        )
        self.assertEqual([doc["id"] for doc in docs], [first_id, second_id])

    def test_scrivenings_scope_to_requested_subtree(self) -> None:
        project = self._project()
        target = self._node(project, "대상", node_type="folder")
        other = self._node(project, "다른 폴더", node_type="folder")
        wanted = self._node(
            project, "대상 문서", parent_id=target.id, body="<p>대상 본문</p>"
        )
        self._node(
            project, "다른 문서", parent_id=other.id, body="<p>다른 본문</p>"
        )

        docs = crud.get_scrivenings(self.db, self.owner.id, root_id=target.id)
        self.assertEqual([doc["id"] for doc in docs], [wanted.id])
        self.assertEqual([doc["body"] for doc in docs], ["<p>대상 본문</p>"])

    def test_search_covers_title_synopsis_notes_and_body(self) -> None:
        project = self._project()
        self._node(project, "찾을말 제목", body="相关内容")
        one = self._node(project, "A", body=None)
        one.synopsis = "찾을말 시놉시스"
        two = self._node(project, "B", body=None)
        two.notes = "찾을말 메모"
        three = self._node(project, "C", body="<p>찾을말 본문</p>")
        self.db.commit()

        results = crud.search_nodes(self.db, self.owner.id, "찾을말")
        self.assertEqual({item["id"] for item in results}, {
            self.db.query(ManuscriptNode)
            .filter(ManuscriptNode.title == "찾을말 제목")
            .first()
            .id,
            one.id,
            two.id,
            three.id,
        })
        self.assertTrue(all("body" not in item for item in results))

    def test_search_scopes_project_and_snippet_includes_surrounding_sentences(
        self,
    ) -> None:
        project = self._project()
        other_project = self._project(linked_book=False)
        self._node(
            project,
            "A",
            body="<p>앞 문장입니다. 가운데 찾을말이 있다. 뒤 문장입니다.</p>",
        )
        self._node(other_project, "B", body="<p>다른 프로젝트 찾을말</p>")

        results = crud.search_nodes(
            self.db, self.owner.id, "찾을말", project_id=project.id
        )

        self.assertEqual(len(results), 1)
        snippet = results[0]["snippet"]
        self.assertIn("앞 문장입니다", snippet)
        self.assertIn("찾을말", snippet)
        self.assertIn("뒤 문장입니다", snippet)

    def test_link_existing_post_without_overwriting_it(self) -> None:
        project = self._project()
        node = self._node(project, "원고 문서", body="<p>원고</p>")
        chapter = Chapter(
            user_id=self.owner.id,
            book_id=self.book.id,
            title="기존 게시물",
            body="<p>게시물 본문</p>",
            tags=[],
            order=0,
        )
        self.db.add(chapter)
        self.db.flush()

        linked = crud.link_node_chapter(
            self.db,
            node.id,
            schemas.ChapterLinkRequest(chapter_id=chapter.id),
            self.owner.id,
        )

        self.assertEqual(linked["published_chapter_id"], chapter.id)
        self.db.refresh(chapter)
        self.assertEqual(chapter.title, "기존 게시물")
        self.assertEqual(chapter.body, "<p>게시물 본문</p>")

        other = self._node(project, "다른 문서")
        with self.assertRaises(HTTPException):
            crud.link_node_chapter(
                self.db,
                other.id,
                schemas.ChapterLinkRequest(chapter_id=chapter.id),
                self.owner.id,
            )

    def test_publish_republish_and_public_toc(self) -> None:
        project = self._project()
        folder = self._node(project, "1권", node_type="folder")
        chapter_node = self._node(
            project,
            "도입",
            parent_id=folder.id,
            body="<p>첫 문장</p>",
        )

        published = crud.publish_node(
            self.db,
            chapter_node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        chapter = (
            self.db.query(Chapter).filter(Chapter.id == published["chapter_id"]).one()
        )
        self.assertEqual(chapter.title, "도입")
        self.assertEqual(
            chapter.body,
            '<div style="font-size: 10pt" data-ms-published-font-size="true">'
            "<p>첫 문장</p></div>",
        )
        self.assertEqual(chapter.tags, [])
        self.assertIsNone(chapter.published_at)

        toc = crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id)
        self.assertEqual(len(toc), 1)
        # Manuscript folders are no longer copied automatically; the post is
        # placed at the TOC root unless the author chooses a folder.
        self.assertEqual(toc[0]["label"], "도입")
        self.assertEqual(toc[0]["chapter"]["title"], "도입")

        # A bookshelf edit does not touch the manuscript.
        chapter.title = "책장에서 수정"
        self.db.commit()
        state = crud.get_node(self.db, chapter_node.id, self.owner.id)
        self.assertEqual(state["published_state"], "chapter_edited")
        self.assertEqual(state["title"], "도입")

        # Re-pushing the manuscript takes ownership of the chapter content again.
        crud.update_node(
            self.db,
            chapter_node.id,
            schemas.NodeUpdate(title="원고에서 수정"),
            self.owner.id,
        )
        self._clear_publish_cooldown(chapter_node)
        crud.publish_node(
            self.db,
            chapter_node.id,
            schemas.PublishRequest(),
            self.owner.id,
        )
        self.db.refresh(chapter)
        self.assertEqual(chapter.title, "원고에서 수정")
        self.assertEqual(
            crud.get_node(self.db, chapter_node.id, self.owner.id)["published_state"],
            "published",
        )

    def test_publish_uses_explicit_toc_folder(self) -> None:
        project = self._project()
        node = self._node(project, "도입", body="<p>본문</p>")
        tree = toc_crud.create_folder(
            self.db, self.book.id, self.owner.id, "1부", None
        )
        folder_id = tree[0]["id"]

        crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(
                target_book_id=self.book.id, toc_parent_id=folder_id
            ),
            self.owner.id,
        )
        toc = crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id)
        self.assertEqual(len(toc), 1)
        self.assertEqual(toc[0]["label"], "1부")
        self.assertEqual(toc[0]["children"][0]["chapter"]["title"], "도입")

        # Re-publishing without a selection keeps the chosen location.
        self._clear_publish_cooldown(node)
        crud.publish_node(
            self.db, node.id, schemas.PublishRequest(), self.owner.id
        )
        toc = crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id)
        self.assertEqual(toc[0]["children"][0]["chapter"]["title"], "도입")

    def test_public_toc_groups_unassigned_chapters(self) -> None:
        placed = books_crud.create_chapter(
            self.db,
            book_schemas.ChapterCreate(book_id=self.book.id, title="배치된 글"),
            self.owner.id,
        )
        unassigned = books_crud.create_chapter(
            self.db,
            book_schemas.ChapterCreate(book_id=self.book.id, title="남은 글"),
            self.owner.id,
        )
        folder = toc_crud.create_folder(
            self.db, self.book.id, self.owner.id, "1부", None
        )
        folder_id = next(
            node["id"] for node in folder if node["node_type"] == "folder"
        )
        placed_post = next(
            node["id"]
            for node in toc_crud.get_manage_toc(
                self.db, self.book.id, self.owner.id
            )
            if node["node_type"] == "post" and node["chapter_id"] == placed["id"]
        )
        toc_crud.move_node(
            self.db, placed_post, self.owner.id, folder_id, 0
        )
        unassigned_post = next(
            node["id"]
            for node in toc_crud.get_manage_toc(
                self.db, self.book.id, self.owner.id
            )
            if node["node_type"] == "post"
            and node["chapter_id"] == unassigned["id"]
        )
        toc_crud.delete_node(self.db, unassigned_post, self.owner.id)

        toc = crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id)

        self.assertEqual(toc[0]["label"], "1부")
        self.assertEqual(toc[0]["children"][0]["chapter"]["title"], "배치된 글")
        self.assertEqual(toc[-1]["id"], -1)
        self.assertEqual(toc[-1]["label"], "목차에 소속되지 않은 게시글")
        self.assertTrue(toc[-1]["unassigned"])
        self.assertEqual(
            [child["chapter"]["title"] for child in toc[-1]["children"]],
            ["남은 글"],
        )

    def test_manage_toc_folders(self) -> None:
        tree = toc_crud.create_folder(
            self.db, self.book.id, self.owner.id, "1부", None
        )
        folder_id = tree[0]["id"]
        child = toc_crud.create_folder(
            self.db, self.book.id, self.owner.id, "1장", folder_id
        )
        child_id = child[0]["children"][0]["id"]

        with self.assertRaises(HTTPException) as raised:
            toc_crud.update_node(
                self.db,
                folder_id,
                self.owner.id,
                parent_id=child_id,
                parent_set=True,
            )
        self.assertEqual(raised.exception.status_code, 400)

        with self.assertRaises(HTTPException) as raised:
            toc_crud.delete_node(self.db, folder_id, self.owner.id)
        self.assertEqual(raised.exception.status_code, 400)

        renamed = toc_crud.update_node(
            self.db,
            folder_id,
            self.owner.id,
            label="첫 권",
            label_set=True,
        )
        self.assertEqual(renamed[0]["label"], "첫 권")

        moved = toc_crud.update_node(
            self.db, child_id, self.owner.id, parent_id=None, parent_set=True
        )
        self.assertEqual([node["label"] for node in moved], ["첫 권", "1장"])

        deleted = toc_crud.delete_node(self.db, child_id, self.owner.id)
        self.assertEqual([node["label"] for node in deleted], ["첫 권"])

    def test_move_toc_node_reorders_and_reparents(self) -> None:
        for label in ("가", "나", "다"):
            toc_crud.create_folder(self.db, self.book.id, self.owner.id, label, None)
        tree = toc_crud.get_manage_toc(self.db, self.book.id, self.owner.id)
        nodes = {node["label"]: node for node in tree}
        ga, na, da = nodes["가"]["id"], nodes["나"]["id"], nodes["다"]["id"]

        moved = toc_crud.move_node(self.db, da, self.owner.id, None, 0)
        self.assertEqual([node["label"] for node in moved], ["다", "가", "나"])

        child = toc_crud.create_folder(
            self.db, self.book.id, self.owner.id, "하위", ga
        )

        def flatten(nodes):
            found = []
            for item in nodes:
                found.append(item)
                found.extend(flatten(item["children"]))
            return found

        child_id = next(
            node["id"]
            for node in flatten(child)
            if node["node_type"] == "folder" and node["label"] == "하위"
        )
        with self.assertRaises(HTTPException) as raised:
            toc_crud.move_node(self.db, ga, self.owner.id, child_id, 0)
        self.assertEqual(raised.exception.status_code, 400)

        moved = toc_crud.move_node(self.db, child_id, self.owner.id, na, 0)
        na_node = next(node for node in moved if node["id"] == na)
        self.assertEqual(na_node["children"][0]["label"], "하위")
        ga_node = next(node for node in moved if node["id"] == ga)
        self.assertEqual(ga_node["children"], [])

    def test_add_existing_chapter_to_toc(self) -> None:
        created = books_crud.create_chapter(
            self.db,
            book_schemas.ChapterCreate(book_id=self.book.id, title="등록할 글"),
            self.owner.id,
        )
        before = toc_crud.get_manage_toc(self.db, self.book.id, self.owner.id)
        post_id = next(
            node["id"]
            for node in before
            if node["node_type"] == "post" and node["chapter_id"] == created["id"]
        )
        toc_crud.delete_node(self.db, post_id, self.owner.id)

        folder = toc_crud.create_folder(
            self.db, self.book.id, self.owner.id, "1부", None
        )
        folder_id = next(
            node["id"] for node in folder if node["node_type"] == "folder"
        )
        toc_crud.add_post(
            self.db, self.book.id, self.owner.id, created["id"], folder_id
        )
        toc = crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id)
        self.assertEqual(toc[0]["label"], "1부")
        self.assertEqual(toc[0]["children"][0]["chapter"]["title"], "등록할 글")

        with self.assertRaises(HTTPException) as raised:
            toc_crud.add_post(
                self.db, self.book.id, self.other.id, created["id"], None
            )
        self.assertEqual(raised.exception.status_code, 404)

    def test_chapter_create_and_update_use_toc_parent(self) -> None:
        tree = toc_crud.create_folder(
            self.db, self.book.id, self.owner.id, "1부", None
        )
        folder_id = tree[0]["id"]
        created = books_crud.create_chapter(
            self.db,
            book_schemas.ChapterCreate(
                book_id=self.book.id,
                title="게시글",
                toc_parent_id=folder_id,
            ),
            self.owner.id,
        )
        toc = crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id)
        self.assertEqual(toc[0]["label"], "1부")
        self.assertEqual(toc[0]["children"][0]["chapter"]["title"], "게시글")

        books_crud.update_chapter(
            self.db,
            created["id"],
            book_schemas.ChapterUpdate(toc_parent_id=None),
            self.owner.id,
        )
        toc = crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id)
        self.assertEqual(
            sorted(node["label"] for node in toc), ["1부", "게시글"]
        )

    def test_chapter_delete_and_reorder_keep_toc_in_sync(self) -> None:
        def post_chapter_ids(nodes):
            found = []
            for node in nodes:
                if node["node_type"] == "post":
                    found.append(node["chapter_id"])
                found.extend(post_chapter_ids(node["children"]))
            return found

        created = books_crud.create_chapter(
            self.db,
            book_schemas.ChapterCreate(
                book_id=self.book.id,
                title="삭제될 글",
            ),
            self.owner.id,
        )
        self.assertIn(
            created["id"],
            post_chapter_ids(toc_crud.get_manage_toc(self.db, self.book.id, self.owner.id)),
        )
        books_crud.delete_chapter(self.db, created["id"], self.owner.id)
        self.assertNotIn(
            created["id"],
            post_chapter_ids(toc_crud.get_manage_toc(self.db, self.book.id, self.owner.id)),
        )

        other_book = Book(user_id=self.owner.id, title="다른 책", tags=[])
        self.db.add(other_book)
        self.db.flush()
        moved = books_crud.create_chapter(
            self.db,
            book_schemas.ChapterCreate(book_id=self.book.id, title="이동할 글"),
            self.owner.id,
        )
        books_crud.reorder_chapters(
            self.db,
            book_schemas.ChapterReorderRequest(
                items=[
                    book_schemas.ChapterReorderItem(
                        id=moved["id"], order=0, book_id=other_book.id
                    )
                ]
            ),
            self.owner.id,
        )
        self.assertNotIn(
            moved["id"],
            post_chapter_ids(toc_crud.get_manage_toc(self.db, self.book.id, self.owner.id)),
        )
        self.assertIn(
            moved["id"],
            post_chapter_ids(
                toc_crud.get_manage_toc(self.db, other_book.id, self.owner.id)
            ),
        )

    def test_publish_rejects_retry_within_cooldown(self) -> None:
        project = self._project()
        node = self._node(project, "1화", body="<p>본문</p>")
        payload = schemas.PublishRequest(target_book_id=self.book.id)

        crud.publish_node(self.db, node.id, payload, self.owner.id)

        with self.assertRaises(HTTPException) as raised:
            crud.publish_node(self.db, node.id, payload, self.owner.id)
        self.assertEqual(raised.exception.status_code, 429)

        self._clear_publish_cooldown(node)
        retried = crud.publish_node(self.db, node.id, payload, self.owner.id)
        self.assertTrue(retried["node"]["published_chapter_exists"])

    def test_publish_shrinks_font_sizes_in_chapter_html(self) -> None:
        project = self._project()
        source = (
            '<p><span style="font-size: 14pt">큰 글</span> '
            '<span style="font-size:13.0pt">기본 글</span></p>'
        )
        node = self._node(project, "글", body=source)

        published = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        chapter = (
            self.db.query(Chapter).filter(Chapter.id == published["chapter_id"]).one()
        )

        self.assertIn("font-size: 11pt", chapter.body)
        self.assertIn("font-size: 10pt", chapter.body)
        self.assertNotIn("font-size: 14pt", chapter.body)
        self.assertEqual(node.body, source)
        self.assertEqual(
            crud.get_node(self.db, node.id, self.owner.id)["published_state"],
            "published",
        )

    def test_publish_normalizes_manuscript_images_for_public_layout(self) -> None:
        project = self._project()
        source = (
            '<p><img src="/uploads/sample.png" width="483" height="483"></p>'
        )
        node = self._node(project, "삽화", body=source)

        published = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        chapter = (
            self.db.query(Chapter).filter(Chapter.id == published["chapter_id"]).one()
        )

        self.assertIn('data-align="center"', chapter.body)
        self.assertIn('data-wrap="false"', chapter.body)
        self.assertIn('width="483"', chapter.body)
        self.assertIn('height="483"', chapter.body)

    def test_publish_to_another_book_stays_unlinked(self) -> None:
        project = self._project()
        other_book = Book(user_id=self.owner.id, title="다른 책", tags=[])
        self.db.add(other_book)
        self.db.flush()
        node = self._node(project, "1화", body="<p>본문</p>")

        result = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=other_book.id),
            self.owner.id,
        )

        self.assertFalse(result["linked"])
        self.db.refresh(node)
        self.assertIsNone(node.published_chapter_id)
        toc = crud.get_public_toc(
            self.db, other_book.id, author_id=self.owner.id
        )
        self.assertEqual(len(toc), 1)
        self.assertEqual(toc[0]["chapter"]["title"], "1화")

    def test_public_toc_hides_books_in_hidden_categories(self) -> None:
        category = BookCategory(
            user_id=self.owner.id, name="숨김 카테고리", visible=False
        )
        self.db.add(category)
        self.db.flush()
        self.book.category_id = category.id
        project = self._project()
        node = self._node(project, "1화", body="<p>본문</p>")
        crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )

        with self.assertRaises(HTTPException):
            crud.get_public_toc(
                self.db, self.book.id, author_id=self.owner.id
            )

    def test_public_toc_hides_future_chapters(self) -> None:
        project = self._project()
        node = self._node(project, "예약", body="<p>본문</p>")
        published = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        chapter = (
            self.db.query(Chapter).filter(Chapter.id == published["chapter_id"]).one()
        )
        chapter.published_at = datetime.now(timezone.utc).replace(
            tzinfo=None
        ) + timedelta(days=1)
        self.db.commit()

        toc = crud.get_public_toc(
            self.db, self.book.id, author_id=self.owner.id
        )
        self.assertEqual(toc, [])

    def test_public_toc_includes_hidden_chapters_for_author(self) -> None:
        project = self._project()
        node = self._node(project, "비공개", body="<p>본문</p>")
        published = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        chapter = (
            self.db.query(Chapter).filter(Chapter.id == published["chapter_id"]).one()
        )
        chapter.visible = False
        self.db.commit()

        self.assertEqual(
            crud.get_public_toc(self.db, self.book.id, author_id=self.owner.id),
            [],
        )

        for_author = crud.get_public_toc(
            self.db,
            self.book.id,
            author_id=self.owner.id,
            viewer_user_id=self.owner.id,
        )
        self.assertEqual(len(for_author), 1)
        self.assertEqual(for_author[0]["chapter"]["title"], "비공개")

        for_other = crud.get_public_toc(
            self.db,
            self.book.id,
            author_id=self.owner.id,
            viewer_user_id=self.other.id,
        )
        self.assertEqual(for_other, [])

    def test_public_toc_is_limited_to_default_author(self) -> None:
        other_book = Book(user_id=self.other.id, title="남의 책", tags=[])
        self.db.add(other_book)
        self.db.flush()
        chapter = Chapter(
            user_id=self.other.id,
            book_id=other_book.id,
            title="비밀",
            tags=[],
            visible=True,
        )
        self.db.add(chapter)
        self.db.flush()
        self.db.add(
            SerialNode(
                user_id=self.other.id,
                book_id=other_book.id,
                node_type="post",
                chapter_id=chapter.id,
                position=0,
            )
        )
        self.db.commit()

        with self.assertRaises(HTTPException):
            crud.get_public_toc(
                self.db, other_book.id, author_id=self.owner.id
            )

    def test_public_toc_locks_chapters_when_book_is_protected(self) -> None:
        project = self._project()
        node = self._node(project, "1화", body="<p>본문</p>")
        crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )

        toc = crud.get_public_toc(
            self.db, self.book.id, author_id=self.owner.id
        )
        self.assertFalse(toc[0]["chapter"]["locked"])

        self.book.protected = True
        self.db.commit()
        toc = crud.get_public_toc(
            self.db, self.book.id, author_id=self.owner.id
        )
        self.assertTrue(toc[0]["chapter"]["locked"])

    def test_deleted_chapter_falls_back_to_fresh_publish(self) -> None:
        project = self._project()
        node = self._node(project, "1화", body="<p>본문</p>")
        published = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        chapter_id = published["chapter_id"]
        chapter = self.db.query(Chapter).filter(Chapter.id == chapter_id).one()

        # A bookshelf-side deletion must not delete or clear the manuscript row.
        self.db.query(SerialNode).filter(SerialNode.chapter_id == chapter_id).delete(
            synchronize_session=False
        )
        self.db.delete(chapter)
        self.db.commit()
        self.db.refresh(node)
        self.assertEqual(node.published_chapter_id, chapter_id)
        state = crud.get_node(self.db, node.id, self.owner.id)
        self.assertFalse(state["published_chapter_exists"])
        self.assertEqual(state["published_state"], "published_missing")

        # Publishing again creates a fresh chapter instead of failing.
        self._clear_publish_cooldown(node)
        result = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        self.assertEqual(result["node"]["published_chapter_id"], result["chapter_id"])
        self.assertTrue(result["node"]["published_chapter_exists"])

    def test_one_chapter_can_only_appear_once_in_a_book_toc(self) -> None:
        project = self._project()
        node = self._node(project, "1화", body="<p>본문</p>")
        crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        self.assertEqual(
            self.db.query(SerialNode)
            .filter(SerialNode.book_id == self.book.id)
            .count(),
            1,
        )
        with self.assertRaises(Exception):
            duplicate = SerialNode(
                user_id=self.owner.id,
                book_id=self.book.id,
                node_type="post",
                chapter_id=node.published_chapter_id,
                label=None,
                position=2,
            )
            self.db.add(duplicate)
            self.db.commit()
        self.db.rollback()

    def test_import_scrivener_restores_tree_and_rtf_body(self) -> None:
        existing = self._project()
        old_node = self._node(existing, "이전 원고")
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <ProjectProperties><ProjectTitle>가져온 원고</ProjectTitle></ProjectProperties>
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="F1" Type="Folder">
          <Title>1부</Title>
          <MetaData><Synopsis>폴더 요약</Synopsis></MetaData>
          <Children>
            <BinderItem UUID="T1" Type="Text">
              <Title>1장</Title>
              <MetaData><Synopsis>첫 장 요약</Synopsis></MetaData>
            </BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg65001\\uc0"
            "{\\fonttbl\\f0\\fnil\\fcharset0 Arial;}"
            "\\pard\\f0\\fs20 Hello \\u44032\\\n"
            "\\ulnone \\\n"
            "second\\par}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("imported.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )

        self.assertEqual(result["project_title"], "가져온 원고")
        self.assertEqual(result["imported_count"], 2)
        self.assertNotEqual(result["project_id"], existing.id)
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        self.assertEqual([node["title"] for node in tree], ["1부", "1장"])
        self.assertEqual(tree[1]["parent_id"], tree[0]["id"])
        chapter = crud.get_node(self.db, tree[1]["id"], self.owner.id)
        self.assertEqual(
            chapter["body"],
            '<p><span style="font-size: 10pt">Hello 가</span></p>'
            '<p></p><p><span style="font-size: 10pt">second</span></p>',
        )
        self.assertEqual(chapter["synopsis"], "첫 장 요약")
        self.assertIsNone(
            self.db.query(ManuscriptNode)
            .filter(ManuscriptNode.id == old_node.id)
            .first()
            .deleted_at
        )

    def test_import_scrivener_converts_style_markers_to_html(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <ProjectProperties><ProjectTitle>스타일 원고</ProjectTitle></ProjectProperties>
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>1장</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc0"
            "<$ScrKeepWithNext><$Scr_H::1><$Scr_Ps::0>Heading\\par"
            "<!$Scr_H::1><!$Scr_Ps::0>- Body\\par"
            "<$Scr_Ps::1>Caption\\par<!$Scr_Ps::1>}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("styled.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        body = crud.get_node(self.db, tree[0]["id"], self.owner.id)["body"]
        self.assertEqual(
            body,
            "<h2>Heading</h2><p>- Body</p>"
            '<p style="text-align: center"><em>Caption</em></p>',
        )
        self.assertNotIn("$Scr", body)

    def test_import_scrivener_applies_character_background_color(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <ProjectProperties><ProjectTitle>배경색 원고</ProjectTitle></ProjectProperties>
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>1장</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc0"
            "{\\colortbl;\\red230\\green230\\blue230;"
            "\\red255\\green255\\blue255;}"
            "\\pard\\cb1 Highlighted\\cb2 Plain\\par}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("bg.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        body = crud.get_node(self.db, tree[0]["id"], self.owner.id)["body"]
        self.assertEqual(
            body,
            '<p><mark style="background-color: #e6e6e6; color: inherit">'
            "Highlighted</mark>Plain</p>",
        )

    def test_import_scrivener_uses_paragraph_background_for_full_line(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <ProjectProperties><ProjectTitle>줄 배경 원고</ProjectTitle></ProjectProperties>
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>1장</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc0"
            "{\\colortbl;\\red230\\green230\\blue230;}"
            "\\pard\\cb1 Full line\\par}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("line-bg.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        body = crud.get_node(self.db, tree[0]["id"], self.owner.id)["body"]
        self.assertEqual(
            body, '<p style="background-color: #e6e6e6">Full line</p>'
        )

    def test_import_scrivener_keeps_children_under_documents(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="T1" Type="Text">
          <Title>본문이 있는 문서</Title>
          <Children>
            <BinderItem UUID="T2" Type="Text">
              <Title>하위 문서</Title>
            </BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("nested.scrivx", manifest)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )

        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        self.assertEqual(
            [node["title"] for node in tree],
            ["본문이 있는 문서", "하위 문서"],
        )
        self.assertEqual(tree[1]["parent_id"], tree[0]["id"])

    def test_import_scrivener_default_13pt_renders_as_editor_default(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc1"
            "{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}"
            "\\pard\\f0\\fs26 default\\par}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("default-size.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(self.db, self.owner.id, buffer.getvalue())
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        body = crud.get_node(self.db, tree[0]["id"], self.owner.id)["body"]
        self.assertEqual(body, "<p>default</p>")

    def test_import_scrivener_detects_cp949_despite_ansi_codepage(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc1"
            "{\\fonttbl\\f0\\fnil\\fcharset129 AppleSDGothicNeo-Regular;}"
            "\\pard\\f0\\fs26 "
            "\\'be\\'c6\\'bd\\'ba\\'c6\\'ae\\'b6\\'f3\\par}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("korean.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(self.db, self.owner.id, buffer.getvalue())
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        body = crud.get_node(self.db, tree[0]["id"], self.owner.id)["body"]
        self.assertIn("아스트라", body)
        self.assertNotIn("¾Æ½ºÆ®¶ó", body)

    def test_reads_title_from_encoded_manifest_filename(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder><BinderItem UUID="D" Type="DraftFolder"><Title>Draft</Title></BinderItem></Binder>
</ScrivenerProject>"""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("∞╣┤δÑ┤δööδéÿ∞¥ÿ ∞êÿφÿ╕∞₧É.scrivx", manifest)

        title = read_scrivener_project_title(
            buffer.getvalue(), fallback="아카이브.zip"
        )
        self.assertEqual(title, "카르디나의 수호자")

    def test_background_import_exposes_project_before_parsing(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <ProjectProperties><ProjectTitle>백그라운드 원고</ProjectTitle></ProjectProperties>
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("background.scrivx", manifest)
            archive.writestr(
                "Files/Data/T1/content.rtf",
                "{\\rtf1\\ansi\\ansicpg1252\\uc1\\pard\\fs26 hello\\par}",
            )
        data = buffer.getvalue()

        shell = crud.create_import_project(
            self.db, self.owner.id, data, "아카이브.zip"
        )
        self.assertEqual(shell["import_status"], "importing")
        self.assertEqual(shell["project_title"], "백그라운드 원고")
        project = next(
            item
            for item in crud.get_projects(self.db, self.owner.id)
            if item["id"] == shell["project_id"]
        )
        self.assertEqual(project["import_status"], "importing")
        self.assertEqual(project["node_count"], 0)

        result = crud.finish_scrivener_import(
            self.db, shell["project_id"], self.owner.id, data
        )
        self.assertEqual(result, {"status": "ready", "imported_count": 1})
        project = next(
            item
            for item in crud.get_projects(self.db, self.owner.id)
            if item["id"] == shell["project_id"]
        )
        self.assertEqual(project["import_status"], "ready")
        self.assertEqual(project["node_count"], 1)

    def test_background_import_records_failure_on_project(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <ProjectProperties><ProjectTitle>실패 원고</ProjectTitle></ProjectProperties>
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("failed.scrivx", manifest)
        data = buffer.getvalue()

        shell = crud.create_import_project(
            self.db, self.owner.id, data, "failed.zip"
        )
        with patch.object(
            crud, "parse_scrivener_zip", side_effect=RuntimeError("가져오기 실패")
        ):
            result = crud.finish_scrivener_import(
                self.db, shell["project_id"], self.owner.id, data
            )

        self.assertEqual(result["status"], "failed")
        project = next(
            item
            for item in crud.get_projects(self.db, self.owner.id)
            if item["id"] == shell["project_id"]
        )
        self.assertEqual(project["import_status"], "failed")
        self.assertEqual(project["import_error"], "가져오기 실패")

    def test_import_scrivener_preserves_alignment_and_inline_style(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc1"
            "{\\colortbl;\\red255\\green0\\blue0;}"
            "\\pard\\qc\\b\\cf1 Center\\cf0\\b0\\par"
            "\\pard\\ql\\li360\\ri180\\fi-180 before \\i italic\\i0 "
            "\\ul underline\\ulnone \\strike strike\\strike0\\par}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("formatted.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        body = crud.get_node(self.db, tree[0]["id"], self.owner.id)["body"]
        self.assertEqual(
            body,
            '<p style="text-align: center"><strong>'
            '<span style="color: #ff0000">Center</span></strong></p>'
            '<p style="padding-left: 24px; padding-right: 12px; '
            'text-indent: -12px">before <em>italic</em><u>underline</u>'
            "<s>strike</s></p>",
        )

    def test_import_scrivener_keeps_blank_lines_and_spaces(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc1"
            "\\pard first\\tab second\tthird\\\n\\\n  fourth  \\\n}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("blank-lines.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        body = crud.get_node(self.db, tree[0]["id"], self.owner.id)["body"]
        self.assertEqual(
            body,
            '<p>first<span data-ms-tab="true"></span>second'
            '<span data-ms-tab="true"></span>third</p>'
            "<p></p><p>  fourth  </p>",
        )

    def test_import_scrivener_numbers_duplicate_project_titles(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <ProjectProperties><ProjectTitle>같은 원고</ProjectTitle></ProjectProperties>
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Title>Draft</Title>
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("duplicate.scrivx", manifest)

        first = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        second = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        third = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )

        self.assertEqual(first["project_title"], "같은 원고")
        self.assertEqual(second["project_title"], "같은 원고 2")
        self.assertEqual(third["project_title"], "같은 원고 3")

    def test_import_scrivener_numbers_duplicate_sibling_titles(self) -> None:
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>같은 문서</Title></BinderItem>
        <BinderItem UUID="T2" Type="Text"><Title>같은 문서</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("titles.scrivx", manifest)

        result = crud.import_scrivener(
            self.db, self.owner.id, buffer.getvalue()
        )
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        self.assertEqual(
            [node["title"] for node in tree],
            ["같은 문서", "같은 문서 2"],
        )

    def test_import_scrivener_extracts_inline_and_image_documents(self) -> None:
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
            "+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        manifest = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="D" Type="DraftFolder">
      <Children>
        <BinderItem UUID="T1" Type="Text"><Title>본문</Title></BinderItem>
        <BinderItem UUID="I1" Type="Image"><Title>첨부 이미지</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>"""
        rtf = (
            "{\\rtf1\\ansi\\ansicpg1252\\uc1"
            "{\\pict {\\*\\nisusfilename unnamed}"
            "\\pngblip\\picw1\\pich1\\picwgoal7240\\pichgoal7240 "
            + png.hex()
            + "}"
            "text\\par}"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("images.scrivx", manifest)
            archive.writestr("Files/Data/T1/content.rtf", rtf)
            archive.writestr("Files/Data/I1/content.png", png)

        _, parsed = parse_scrivener_zip(buffer.getvalue())
        self.assertEqual(parsed[0].images, [png])
        self.assertEqual(parsed[1].images, [png])
        self.assertEqual(parsed[0].image_sizes, [(483, 483)])
        self.assertEqual(
            parsed[0].body,
            '<p>@@SCRIVENER_IMAGE_0@@text</p>',
        )

        with (
            patch(
                "crud.manuscript.save_image_bytes",
                return_value="images/attached.png",
            ),
            patch(
                "crud.manuscript.public_url",
                side_effect=lambda key: f"/uploads/{key}",
            ),
        ):
            result = crud.import_scrivener(
                self.db, self.owner.id, buffer.getvalue()
            )
        tree = crud.get_tree(self.db, result["project_id"], self.owner.id)
        first = crud.get_node(self.db, tree[0]["id"], self.owner.id)
        second = crud.get_node(self.db, tree[1]["id"], self.owner.id)
        self.assertIn('<img src="/uploads/images/attached.png"', first["body"])
        self.assertIn('<img src="/uploads/images/attached.png"', second["body"])
        self.assertIn('width="483" height="483"', first["body"])
        self.assertLess(
            first["body"].index("<img"),
            first["body"].index("text"),
        )

    def test_tree_omits_body_and_publication_state(self) -> None:
        project = self._project()
        node = self._node(project, "1화", body="<p>본문</p>")
        crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )

        tree = crud.get_tree(self.db, project.id, self.owner.id)
        item = next(entry for entry in tree if entry["id"] == node.id)
        self.assertNotIn("body", item)
        self.assertNotIn("published_state", item)
        self.assertNotIn("published_chapter_exists", item)
        self.assertEqual(
            crud.get_node(self.db, node.id, self.owner.id)["published_state"],
            "published",
        )

    def test_export_scrivener_round_trips_body_and_tree(self) -> None:
        project = self._project()
        folder = self._node(project, "1권", node_type="folder")
        body = "<p>가 &amp; 나</p><p>&lt;태그&gt; 포함</p>"
        self._node(project, "1장", parent_id=folder.id, body=body)
        self.db.commit()

        data, filename = crud.export_scrivener(
            self.db, project.id, self.owner.id
        )

        self.assertTrue(filename.endswith(".scriv.zip"))
        with ZipFile(BytesIO(data)) as archive:
            names = archive.namelist()
        self.assertIn(f"{project.title}.scrivx", names)
        self.assertIn("Files/version.txt", names)
        self.assertIn("Settings/compile.xml", names)
        self.assertTrue(
            any(
                name.startswith("Files/Data/")
                and name.endswith("/content.rtf")
                and name[11:47].isupper()
                for name in names
            )
        )
        source_title, parsed = parse_scrivener_zip(data)
        self.assertEqual(source_title, project.title)
        self.assertEqual([node.title for node in parsed], ["1권", "1장"])
        self.assertEqual(parsed[1].parent_index, 0)
        self.assertEqual(parsed[1].body, body)

        imported = crud.import_scrivener(self.db, self.owner.id, data)
        target_tree = crud.get_tree(
            self.db, imported["project_id"], self.owner.id
        )
        self.assertEqual([node["title"] for node in target_tree], ["1권", "1장"])
        imported_body = crud.get_node(
            self.db, target_tree[1]["id"], self.owner.id
        )["body"]
        self.assertEqual(imported_body, parsed[1].body)

    def test_export_scrivener_keeps_blank_lines_and_spaces(self) -> None:
        project = self._project()
        body = (
            '<p>앞  공백</p><p></p><p>  뒤 '
            '<span data-ms-tab="true"></span> 끝  </p>'
        )
        self._node(project, "빈줄", body=body)
        self.db.commit()

        data, _ = crud.export_scrivener(self.db, project.id, self.owner.id)
        _, parsed = parse_scrivener_zip(data)
        self.assertEqual(parsed[0].body, body)

    def test_export_scrivener_preserves_styles(self) -> None:
        project = self._project()
        body = (
            '<p style="text-align: center; padding-left: 24px; '
            'text-indent: -12px"><strong><span style="color: #ff0000">'
            '<span style="font-size: 16pt">Center</span></span></strong></p>'
            "<p>plain</p>"
        )
        self._node(project, "서식", body=body)
        self.db.commit()

        data, _ = crud.export_scrivener(self.db, project.id, self.owner.id)
        _, parsed = parse_scrivener_zip(data)
        exported = parsed[0].body
        self.assertIn("text-align: center", exported)
        self.assertIn("padding-left: 24px", exported)
        self.assertIn("text-indent: -12px", exported)
        self.assertIn("<strong>", exported)
        self.assertIn("font-size: 16pt", exported)
        self.assertIn("color: #ff0000", exported)

    def test_export_scrivener_defaults_to_13pt(self) -> None:
        project = self._project()
        self._node(project, "기본", body="<p>plain</p>")
        self.db.commit()

        data, _ = crud.export_scrivener(self.db, project.id, self.owner.id)
        with ZipFile(BytesIO(data)) as archive:
            rtf = next(
                archive.read(name)
                for name in archive.namelist()
                if name.endswith("/content.rtf")
            )
        self.assertIn(b"\\fs26", rtf)
        self.assertNotIn(b"\\fs20", rtf)

    def test_export_scrivener_preserves_character_background(self) -> None:
        project = self._project()
        self._node(
            project,
            "강조",
            body=(
                '<p><mark style="background-color: #e6e6e6; color: inherit">'
                "강조 문장</mark></p>"
            ),
        )
        self.db.commit()

        data, _ = crud.export_scrivener(self.db, project.id, self.owner.id)
        with ZipFile(BytesIO(data)) as archive:
            rtf = next(
                archive.read(name)
                for name in archive.namelist()
                if name.endswith("/content.rtf")
            )
        self.assertIn(b"\\highlight", rtf)
        self.assertIn(b"\\red230\\green230\\blue230", rtf)

    def test_export_scrivener_preserves_paragraph_background(self) -> None:
        project = self._project()
        self._node(
            project,
            "줄 배경",
            body='<p style="background-color: #e6e6e6">전체 줄</p>',
        )
        self.db.commit()

        data, _ = crud.export_scrivener(self.db, project.id, self.owner.id)
        with ZipFile(BytesIO(data)) as archive:
            rtf = next(
                archive.read(name)
                for name in archive.namelist()
                if name.endswith("/content.rtf")
            )
        self.assertIn(b"\\cb", rtf)
        self.assertIn(b"\\red230\\green230\\blue230", rtf)

    def test_export_scrivener_embeds_body_images(self) -> None:
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
            "+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        project = self._project()
        self._node(
            project,
            "그림",
            body=(
                '<p>앞</p><p><img src="/uploads/images/a.png" '
                'width="120" height="80" alt="" /></p><p>뒤</p>'
            ),
        )
        self.db.commit()

        @contextmanager
        def fake_open(_src: str):
            yield BytesIO(png), "image/png", len(png)

        with patch("crud.manuscript.open_uploaded_file", side_effect=fake_open):
            data, _ = crud.export_scrivener(
                self.db, project.id, self.owner.id
            )

        with ZipFile(BytesIO(data)) as archive:
            rtf_name = next(
                name
                for name in archive.namelist()
                if name.endswith("/content.rtf")
            )
            rtf = archive.read(rtf_name).decode("utf-8")
        self.assertEqual(rtf.count("{"), rtf.count("}"))
        self.assertIn("\\pngblip", rtf)
        self.assertIn("\\picwgoal1800", rtf)

        _, parsed = parse_scrivener_zip(data)
        chapter = next(node for node in parsed if node.images)
        self.assertEqual(chapter.images, [png])
        self.assertEqual(chapter.image_sizes, [(120, 80)])

    def test_export_scrivener_selected_folder_includes_descendants(self) -> None:
        project = self._project()
        folder = self._node(project, "1권", node_type="folder")
        self._node(project, "1장", parent_id=folder.id, body="<p>본문</p>")
        sibling = self._node(project, "2권", node_type="folder")
        self._node(project, "2장", parent_id=sibling.id, body="<p>제외</p>")
        self.db.commit()

        data, filename = crud.export_scrivener(
            self.db, project.id, self.owner.id, [folder.id]
        )
        source_title, parsed = parse_scrivener_zip(data)
        self.assertEqual(source_title, f"{project.title}-부분내보내기")
        self.assertIn("부분내보내기", filename)
        self.assertEqual([node.title for node in parsed], ["1권", "1장"])
        self.assertEqual(parsed[1].parent_index, 0)
        self.assertEqual(parsed[1].body, "<p>본문</p>")

    def test_export_scrivener_selected_chapter_detaches_missing_parent(self) -> None:
        project = self._project()
        folder = self._node(project, "폴더", node_type="folder")
        chapter = self._node(
            project, "선택", parent_id=folder.id, body="<p>선택 본문</p>"
        )
        self._node(project, "제외", parent_id=folder.id, body="<p>제외 본문</p>")
        self.db.commit()

        data, _ = crud.export_scrivener(
            self.db, project.id, self.owner.id, [chapter.id]
        )
        _, parsed = parse_scrivener_zip(data)
        self.assertEqual([node.title for node in parsed], ["선택"])
        self.assertIsNone(parsed[0].parent_index)
        self.assertEqual(parsed[0].body, "<p>선택 본문</p>")

    def test_export_scrivener_rejects_empty_or_unknown_selection(self) -> None:
        project = self._project()
        self._node(project, "문서", body="<p>본문</p>")
        self.db.commit()

        with self.assertRaises(HTTPException) as empty:
            crud.export_scrivener(self.db, project.id, self.owner.id, [])
        self.assertEqual(empty.exception.status_code, 400)

        with self.assertRaises(HTTPException) as unknown:
            crud.export_scrivener(self.db, project.id, self.owner.id, [99999])
        self.assertEqual(unknown.exception.status_code, 400)

    def test_foreign_manuscripts_are_owner_only(self) -> None:
        project = self._project()
        node = self._node(project, "내 원고", body="<p>본문</p>")
        self.db.commit()

        self.assertEqual(crud.get_projects(self.db, self.other.id), [])

        calls = (
            lambda: crud.get_tree(self.db, project.id, self.other.id),
            lambda: crud.get_node(self.db, node.id, self.other.id),
            lambda: crud.update_node(
                self.db,
                node.id,
                schemas.NodeUpdate(title="남의 수정"),
                self.other.id,
            ),
            lambda: crud.delete_node(self.db, node.id, self.other.id),
            lambda: crud.export_scrivener(
                self.db,
                project.id,
                self.other.id,
            ),
            lambda: crud.delete_project(
                self.db,
                project.id,
                self.other.id,
            ),
        )
        for call in calls:
            with self.assertRaises(HTTPException) as raised:
                call()
            self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
