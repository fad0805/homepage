import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.books import (
    _body_snippet,
    _serialize_chapter,
    get_all_chapters,
    search_chapters_for_owner,
)
from db.base import Base
from models.books import Book, Chapter
from models.users import User


class ChapterSearchTests(unittest.TestCase):
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
        self.book = Book(user_id=self.owner.id, title="소설", tags=[])
        self.db.add(self.book)
        self.db.flush()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _chapter(self, title, body, *, owner_id, created_at):
        chapter = Chapter(
            user_id=owner_id,
            book_id=self.book.id,
            title=title,
            body=body,
            tags=[],
            created_at=created_at,
        )
        self.db.add(chapter)
        return chapter

    def test_search_matches_body_and_returns_snippet_only(self) -> None:
        self._chapter(
            "1화",
            "<p>아주 긴 본문 앞부분 그리고 <b>찾을말</b> 뒤의 이야기.</p>",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self._chapter(
            "다른 화",
            "관련 없는 내용",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        self._chapter(
            "남의 글",
            "찾을말이 여기에도 있음",
            owner_id=self.other.id,
            created_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
        )
        self.db.commit()

        results = search_chapters_for_owner(
            self.db,
            owner_user_id=self.owner.id,
            query="찾을말",
        )

        self.assertEqual([item["title"] for item in results], ["1화"])
        self.assertNotIn("body", results[0])
        self.assertIn("찾을말", results[0]["snippet"])
        self.assertNotIn("<b>", results[0]["snippet"])

    def test_search_orders_by_created_at_desc_and_respects_limit(self) -> None:
        for day in range(1, 4):
            self._chapter(
                f"{day}화",
                "공통 단어",
                owner_id=self.owner.id,
                created_at=datetime(2026, 1, day, tzinfo=timezone.utc),
            )
        self.db.commit()

        results = search_chapters_for_owner(
            self.db,
            owner_user_id=self.owner.id,
            query="공통",
            limit=2,
        )

        self.assertEqual([item["title"] for item in results], ["3화", "2화"])

    def test_search_requires_all_tokens(self) -> None:
        self._chapter(
            "1화",
            "첫째와 둘째가 모두 있는 글",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self._chapter(
            "2화",
            "첫째만 있는 글",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        self.db.commit()

        results = search_chapters_for_owner(
            self.db,
            owner_user_id=self.owner.id,
            query="첫째 둘째",
        )

        self.assertEqual([item["title"] for item in results], ["1화"])

    def test_public_list_search_matches_unlocked_body(self) -> None:
        self._chapter(
            "1화",
            "<p>본문에만 있는 <b>검색어</b></p>",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self.db.commit()

        results = get_all_chapters(
            self.db,
            query="검색어",
            include_body=False,
        )

        self.assertEqual([item["title"] for item in results], ["1화"])
        self.assertIsNone(results[0]["body"])

    def test_public_list_search_can_return_ids_only(self) -> None:
        matched = self._chapter(
            "1화",
            "본문 검색어",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self._chapter(
            "2화",
            "관련 없는 본문",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        self.db.commit()

        results = get_all_chapters(
            self.db,
            query="검색어",
            include_body=False,
            ids_only=True,
        )

        self.assertEqual(results, [matched.id])

    def test_author_filter_is_applied_with_search(self) -> None:
        own = self._chapter(
            "내 글",
            "공통 검색어",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        other_book = Book(user_id=self.other.id, title="남의 책", tags=[])
        self.db.add(other_book)
        self.db.flush()
        self.db.add(
            Chapter(
                user_id=self.other.id,
                book_id=other_book.id,
                title="남의 글",
                body="공통 검색어",
                tags=[],
                created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            )
        )
        self.db.commit()

        results = get_all_chapters(
            self.db,
            query="검색어",
            author_user_id=self.owner.id,
            ids_only=True,
        )

        self.assertEqual(results, [own.id])

    def test_public_list_search_ignores_protected_body(self) -> None:
        protected = self._chapter(
            "보호 글",
            "비밀 본문 검색어",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        protected.protected = True
        self._chapter(
            "공개 글",
            "평범한 본문",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        self.db.commit()

        self.assertEqual(
            get_all_chapters(self.db, query="검색어"),
            [],
        )

        granted = get_all_chapters(
            self.db,
            query="검색어",
            granted_chapters=frozenset({protected.id}),
        )
        self.assertEqual([item["title"] for item in granted], ["보호 글"])
        self.assertEqual(granted[0]["body"], "비밀 본문 검색어")

    def test_public_list_search_ignores_body_of_protected_book(self) -> None:
        self.book.protected = True
        chapter = self._chapter(
            "1화",
            "책 보호 본문 검색어",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self.db.commit()

        self.assertEqual(
            get_all_chapters(self.db, query="검색어"),
            [],
        )

        granted = get_all_chapters(
            self.db,
            query="검색어",
            granted_books=frozenset({self.book.id}),
        )
        self.assertEqual([item["title"] for item in granted], ["1화"])
        self.assertEqual(granted[0]["id"], chapter.id)

    def test_owner_search_can_match_protected_body(self) -> None:
        chapter = self._chapter(
            "1화",
            "비밀 본문 검색어",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        chapter.protected = True
        self.db.commit()

        results = get_all_chapters(
            self.db,
            owner_user_id=self.owner.id,
            query="검색어",
            include_body=False,
        )

        self.assertEqual([item["id"] for item in results], [chapter.id])
        self.assertIsNone(results[0]["body"])

    def test_body_snippet_unescapes_entities(self) -> None:
        snippet = _body_snippet("<p>a &amp; b</p>", ["b"])
        self.assertEqual(snippet, "a & b")

    def test_serializer_can_omit_body(self) -> None:
        chapter = self._chapter(
            "1화",
            "비밀 본문",
            owner_id=self.owner.id,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        self.db.commit()

        self.assertIsNone(
            _serialize_chapter(chapter, include_body=False)["body"]
        )
        self.assertEqual(
            _serialize_chapter(chapter, include_body=True)["body"],
            "비밀 본문",
        )

    def test_list_metadata_query_does_not_select_body(self) -> None:
        self._chapter(
            "큰 본문",
            "<p>" + "가" * 5000 + "</p>",
            owner_id=self.owner.id,
            created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        self.db.commit()

        statements: list[str] = []

        def record(conn, cursor, statement, parameters, context, many):
            statements.append(statement)

        event.listen(self.engine, "before_cursor_execute", record)
        try:
            results = get_all_chapters(
                self.db,
                include_hidden=True,
                owner_user_id=self.owner.id,
                include_body=False,
            )
        finally:
            event.remove(self.engine, "before_cursor_execute", record)

        self.assertEqual(results[0]["body"], None)
        chapter_selects = [
            statement
            for statement in statements
            if "chapters" in statement.lower() and "select" in statement.lower()
        ]
        self.assertTrue(chapter_selects)
        self.assertTrue(
            all("body" not in statement.lower() for statement in chapter_selects)
        )
