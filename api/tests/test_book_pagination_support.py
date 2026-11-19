import unittest
from datetime import datetime, timedelta, timezone

from fastapi import Response
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from crud.books import get_all_books, get_chapters_page
from db.base import Base
from models.books import Book, Chapter
from models.users import User
from routers.books import get_books


class BookChapterPaginationSupportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.author = User(username="author", hashed_password="x")
        self.db.add(self.author)
        self.db.flush()

        self.first = Book(
            user_id=self.author.id,
            title="첫 번째 책",
            tags=[],
            order=0,
        )
        self.second = Book(
            user_id=self.author.id,
            title="두 번째 책",
            tags=[],
            order=1,
        )
        self.db.add_all([self.first, self.second])
        self.db.flush()

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.add_all(
            [
                Chapter(
                    user_id=self.author.id,
                    book_id=self.first.id,
                    title="첫 번째 글",
                    tags=[],
                    body="일반 본문",
                    created_at=now - timedelta(days=3),
                ),
                Chapter(
                    user_id=self.author.id,
                    book_id=self.first.id,
                    title="고정 글",
                    tags=[],
                    body="고정 본문",
                    pinned=True,
                    created_at=now - timedelta(days=2),
                ),
                Chapter(
                    user_id=self.author.id,
                    book_id=self.first.id,
                    title="세 번째 글",
                    tags=[],
                    body="숨겨진 보물",
                    created_at=now - timedelta(days=1),
                ),
                Chapter(
                    user_id=self.author.id,
                    book_id=self.second.id,
                    title="다른 책 글",
                    tags=[],
                    body="다른 본문",
                    created_at=now,
                ),
            ]
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_book_list_includes_visible_chapter_counts(self) -> None:
        books = {book["title"]: book for book in get_all_books(self.db)}

        self.assertEqual(books["첫 번째 책"]["chapter_count"], 3)
        self.assertEqual(books["두 번째 책"]["chapter_count"], 1)

    def test_book_search_matches_chapter_title_and_body(self) -> None:
        title_matches = get_all_books(self.db, query="고정")
        body_matches = get_all_books(self.db, query="보물")

        self.assertEqual([book["title"] for book in title_matches], ["첫 번째 책"])
        self.assertEqual([book["title"] for book in body_matches], ["첫 번째 책"])

    def test_chapter_page_can_be_scoped_to_one_book(self) -> None:
        chapters, total = get_chapters_page(
            self.db,
            book_id=self.first.id,
            page=1,
            page_size=2,
            include_body=False,
        )

        self.assertEqual(total, 3)
        self.assertEqual(len(chapters), 2)
        self.assertTrue(
            all(chapter["book_id"] == self.first.id for chapter in chapters)
        )

    def test_chapter_page_can_select_pinned_chapters(self) -> None:
        chapters, total = get_chapters_page(
            self.db,
            book_id=self.first.id,
            pinned=True,
            include_body=False,
        )

        self.assertEqual(total, 1)
        self.assertEqual([chapter["title"] for chapter in chapters], ["고정 글"])

    def test_book_route_paginates_search_results(self) -> None:
        request = Request(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": "/books",
                "raw_path": b"/books",
                "query_string": b"",
                "headers": [],
                "client": ("test", 123),
                "server": ("test", 80),
            }
        )
        response = Response()

        first_page = get_books(
            request,
            response,
            q="책",
            page=1,
            page_size=1,
            db=self.db,
            current_user=None,
        )

        self.assertEqual(
            [book["id"] for book in first_page], [self.first.id]
        )
        self.assertEqual(response.headers["x-total-count"], "2")

    def test_book_route_uses_sql_limit_offset_for_pages(self) -> None:
        from starlette.requests import Request as StarletteRequest

        request = StarletteRequest(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": "/books",
                "raw_path": b"/books",
                "query_string": b"",
                "headers": [],
                "client": ("test", 123),
                "server": ("test", 80),
            }
        )
        response = Response()
        statements: list[str] = []

        @event.listens_for(self.engine, "before_cursor_execute")
        def record_statement(
            conn, cursor, statement, parameters, context, executemany
        ):
            statements.append(statement)

        try:
            books = get_books(
                request,
                response,
                page=2,
                page_size=1,
                db=self.db,
                current_user=None,
            )
        finally:
            event.remove(self.engine, "before_cursor_execute", record_statement)

        self.assertEqual([book["id"] for book in books], [self.second.id])
        self.assertEqual(response.headers["x-total-count"], "2")
        self.assertTrue(
            any("LIMIT" in statement and "OFFSET" in statement for statement in statements)
        )

    def test_book_search_matches_tags_in_database(self) -> None:
        self.first.tags = ["판타지"]
        self.db.commit()

        matches = get_all_books(self.db, query="판타지")

        self.assertEqual([book["id"] for book in matches], [self.first.id])


if __name__ == "__main__":
    unittest.main()
