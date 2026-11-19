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

from core.scrivener import parse_scrivener_zip
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


if __name__ == "__main__":
    unittest.main()
