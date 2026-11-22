import os

os.environ.setdefault("ENVIRONMENT", "development")

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.index_page import (
    DEFAULT_COPYRIGHT_NAME,
    DEFAULT_INDEX_BODY_HTML,
    DEFAULT_INDEX_SUBTITLE,
    DEFAULT_INDEX_TITLE,
    clean_index_text,
)
from crud.index_page import get_index_page_read, update_index_page
from db.base import Base
from models.users import User


class IndexPageTests(unittest.TestCase):
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
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_defaults_when_no_page_exists(self) -> None:
        page = get_index_page_read(self.db, scope="integrated")

        self.assertEqual(page["title"], DEFAULT_INDEX_TITLE)
        self.assertEqual(page["subtitle"], DEFAULT_INDEX_SUBTITLE)
        self.assertEqual(page["copyright_name"], DEFAULT_COPYRIGHT_NAME)
        self.assertEqual(page["content_html"], DEFAULT_INDEX_BODY_HTML)
        self.assertIn("Missing Island · Story Archive", page["content_html"])

    def test_update_stores_plain_heading_and_sanitized_body(self) -> None:
        page = update_index_page(
            self.db,
            scope="integrated",
            user_id=None,
            title="<b>새 <br> 제목</b>",
            subtitle="<em>새 부제</em>",
            copyright_name="<strong>새 <br> 이름</strong>",
            content_html="<p>본문<script>alert(1)</script></p>",
        )

        self.assertEqual(page["title"], "새 제목")
        self.assertEqual(page["subtitle"], "새 부제")
        self.assertEqual(page["copyright_name"], "새 이름")
        self.assertIn("본문", page["content_html"])
        self.assertNotIn("<script", page["content_html"])

        stored = self.db.execute(
            __import__("sqlalchemy").text(
                "SELECT title, subtitle, copyright_name FROM index_pages "
                "WHERE scope = 'integrated'"
            )
        ).one()
        self.assertEqual(tuple(stored), ("새 제목", "새 부제", "새 이름"))

    def test_omitted_heading_fields_are_kept(self) -> None:
        update_index_page(
            self.db,
            scope="integrated",
            user_id=None,
            title="유지할 제목",
            subtitle="유지할 부제",
            copyright_name="유지할 이름",
            content_html="<p>첫 본문</p>",
        )
        page = update_index_page(
            self.db,
            scope="integrated",
            user_id=None,
            content_html="<p>둘째 본문</p>",
        )

        self.assertEqual(page["title"], "유지할 제목")
        self.assertEqual(page["subtitle"], "유지할 부제")
        self.assertEqual(page["copyright_name"], "유지할 이름")
        self.assertIn("둘째 본문", page["content_html"])

    def test_empty_heading_is_an_intentional_clear(self) -> None:
        page = update_index_page(
            self.db,
            scope="integrated",
            user_id=None,
            title="",
            subtitle="",
            copyright_name="",
            content_html="<p>본문만</p>",
        )

        self.assertEqual(page["title"], "")
        self.assertEqual(page["subtitle"], "")
        self.assertEqual(page["copyright_name"], "")

    def test_author_page_inherits_integrated_heading(self) -> None:
        update_index_page(
            self.db,
            scope="integrated",
            user_id=None,
            title="통합 제목",
            subtitle="통합 부제",
            copyright_name="통합 이름",
            content_html="<p>통합 본문</p>",
        )
        author_page = get_index_page_read(
            self.db,
            scope="author",
            user_id=self.author.id,
        )

        self.assertEqual(author_page["title"], "통합 제목")
        self.assertEqual(author_page["subtitle"], "통합 부제")
        self.assertEqual(author_page["copyright_name"], "통합 이름")
        self.assertIn("통합 본문", author_page["content_html"])

    def test_clean_index_text_collapses_markup(self) -> None:
        value = "<p>첫<br><em>둘</em> &amp; 셋</p>"
        self.assertEqual(clean_index_text(value, 120), "첫 둘 & 셋")


if __name__ == "__main__":
    unittest.main()
