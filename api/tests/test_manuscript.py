import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.text_stats import count_characters
from crud import manuscript as crud
from db.base import Base
from models.books import Book, Chapter
from models.illustrations import Illustration, IllustrationImage  # noqa: F401
from models.manuscript import ManuscriptNode, ManuscriptProject, SerialNode
from models.users import User
from schemas import manuscript as schemas


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

    def test_delete_project_removes_its_nodes(self) -> None:
        project = self._project()
        self._node(project, "챕터")
        crud.delete_project(self.db, project.id, self.owner.id)
        self.assertIsNone(
            self.db.query(ManuscriptNode)
            .filter(ManuscriptNode.project_id == project.id)
            .first()
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
        self.assertEqual(chapter.body, "<p>첫 문장</p>")
        self.assertEqual(chapter.tags, [])
        self.assertIsNone(chapter.published_at)

        toc = crud.get_public_toc(self.db, self.book.id)
        self.assertEqual(len(toc), 1)
        self.assertEqual(toc[0]["label"], "1권")
        self.assertEqual(toc[0]["children"][0]["chapter"]["title"], "도입")

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
        toc = crud.get_public_toc(self.db, other_book.id)
        self.assertEqual(len(toc), 1)
        self.assertEqual(toc[0]["chapter"]["title"], "1화")

    def test_unlink_keeps_book_by_default_and_can_delete_it(self) -> None:
        project = self._project()
        node = self._node(project, "1화", body="<p>본문</p>")
        published = crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        chapter_id = published["chapter_id"]

        crud.unlink_node(
            self.db,
            node.id,
            schemas.UnlinkRequest(delete_book=False),
            self.owner.id,
        )
        self.assertIsNotNone(
            self.db.query(Chapter).filter(Chapter.id == chapter_id).first()
        )
        self.assertEqual(len(crud.get_public_toc(self.db, self.book.id)), 1)

        node = self._node(project, "2화", body="<p>본문</p>")
        crud.publish_node(
            self.db,
            node.id,
            schemas.PublishRequest(target_book_id=self.book.id),
            self.owner.id,
        )
        result = crud.unlink_node(
            self.db,
            node.id,
            schemas.UnlinkRequest(delete_book=True),
            self.owner.id,
        )
        self.assertTrue(result["book_deleted"])
        self.assertIsNone(
            self.db.query(Book).filter(Book.id == self.book.id).first()
        )
        self.assertEqual(
            self.db.query(SerialNode).filter(SerialNode.book_id == self.book.id).count(),
            0,
        )

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


if __name__ == "__main__":
    unittest.main()
