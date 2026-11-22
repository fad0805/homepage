# ruff: noqa: DTZ001
import unittest
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from crud.illustrations import (
    _utc_boundary,
    bulk_delete_illustrations,
    create_illustration_group,
    create_pending_illustration_group,
    delete_illustration,
    finish_illustration_upload,
    get_all_illustrations,
    get_visible_illustrations,
    update_illustration,
)
from crud.tags import sync_illustration_tags
from db.base import Base
from models.illustrations import Illustration, IllustrationImage
from models.tags import IllustrationTag, Tag
from models.users import User
from schemas.illustrations import IllustrationUpdate


class IllustrationListTests(unittest.TestCase):
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
        self.db.add(self.owner)
        self.db.flush()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _illustration(self, title, taken_at=None, created_at=None, **kwargs):
        item = Illustration(
            user_id=self.owner.id,
            title=title,
            tags=[],
            taken_at=taken_at,
            created_at=created_at or datetime(2026, 1, 1),
            order=kwargs.pop("order", 0),
            **kwargs,
        )
        self.db.add(item)
        self.db.flush()
        return item

    def _image(self, illustration, url, order=0):
        image = IllustrationImage(
            illustration_id=illustration.id,
            url=url,
            order=order,
        )
        self.db.add(image)
        return image

    def test_create_group_accepts_initial_visibility(self) -> None:
        protected = create_illustration_group(
            self.db,
            user_id=self.owner.id,
            title="보호 삽화",
            uploads=["/uploads/illustrations/protected.png"],
            visible=True,
            protected=True,
        )
        private = create_illustration_group(
            self.db,
            user_id=self.owner.id,
            title="비공개 삽화",
            uploads=["/uploads/illustrations/private.png"],
            visible=False,
            protected=True,
        )

        self.assertTrue(protected["visible"])
        self.assertTrue(protected["protected"])
        self.assertFalse(private["visible"])
        self.assertFalse(private["protected"])

    def test_pending_upload_is_admin_only_until_finished(self) -> None:
        pending = create_pending_illustration_group(
            self.db,
            user_id=self.owner.id,
            title="업로드 중인 삽화",
        )
        self.assertEqual(pending["upload_status"], "processing")

        admin_rows, _ = get_all_illustrations(
            self.db, owner_user_id=self.owner.id
        )
        self.assertEqual(
            [row["upload_status"] for row in admin_rows], ["processing"]
        )
        public_rows, public_total = get_visible_illustrations(
            self.db, author_user_id=self.owner.id
        )
        self.assertEqual(public_rows, [])
        self.assertEqual(public_total, 0)

        finish_illustration_upload(
            self.db,
            pending["id"],
            ["/uploads/illustrations/done.png"],
        )
        public_rows, public_total = get_visible_illustrations(
            self.db, author_user_id=self.owner.id
        )
        self.assertEqual([row["title"] for row in public_rows], ["업로드 중인 삽화"])
        self.assertEqual(public_total, 1)

    def test_processing_row_rejects_mutations(self) -> None:
        pending = create_pending_illustration_group(
            self.db,
            user_id=self.owner.id,
            title="업로드 중인 삽화",
        )

        with self.assertRaises(HTTPException):
            delete_illustration(self.db, pending["id"])
        with self.assertRaises(HTTPException):
            bulk_delete_illustrations(
                self.db, [pending["id"]], self.owner.id
            )
        with self.assertRaises(HTTPException):
            update_illustration(
                self.db,
                pending["id"],
                IllustrationUpdate(title="수정 시도"),
            )

        admin_rows, _ = get_all_illustrations(
            self.db, owner_user_id=self.owner.id
        )
        self.assertEqual(
            [row["upload_status"] for row in admin_rows], ["processing"]
        )

    def test_ready_row_without_image_is_admin_only(self) -> None:
        empty = create_illustration_group(
            self.db,
            user_id=self.owner.id,
            title="이미지 없는 삽화",
            uploads=[],
        )
        self.assertEqual(empty["upload_status"], "ready")

        admin_rows, _ = get_all_illustrations(
            self.db, owner_user_id=self.owner.id
        )
        self.assertIn(empty["id"], [row["id"] for row in admin_rows])

        public_rows, _ = get_visible_illustrations(
            self.db, author_user_id=self.owner.id
        )
        self.assertNotIn(empty["id"], [row["id"] for row in public_rows])

    def test_tag_filter_matches_exact_tag(self) -> None:
        first = self._illustration("첫 번째")
        second = self._illustration("두 번째")
        self._image(first, "/images/first.jpg")
        self._image(second, "/images/second.jpg")
        first.tags = ["판타지"]
        second.tags = ["판타지 소설"]
        self.db.commit()
        sync_illustration_tags(self.db, first)
        sync_illustration_tags(self.db, second)
        self.db.commit()

        items, total = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            tag="판타지",
        )
        partial, partial_total = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            tag="판타",
        )

        self.assertEqual([item["title"] for item in items], ["첫 번째"])
        self.assertEqual(total, 1)
        self.assertEqual(partial, [])
        self.assertEqual(partial_total, 0)

    def test_list_is_paginated_and_only_loads_page_images(self) -> None:
        for index in range(25):
            illustration = self._illustration(
                f"삽화 {index}",
                taken_at=date(2026, 1, 1),
                created_at=datetime(2026, 1, 1, 0, 0, index),
            )
            self._image(illustration, f"/images/{index}-1.jpg", 0)
            self._image(illustration, f"/images/{index}-2.jpg", 1)
        self.db.commit()

        items, total = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            page=2,
            page_size=10,
        )

        self.assertEqual(total, 25)
        self.assertEqual(len(items), 10)
        self.assertTrue(all(item["image_count"] == 2 for item in items))
        self.assertEqual(items[0]["representative_url"], "/images/14-1.jpg")

    def test_sort_and_taken_date_filter(self) -> None:
        old = self._illustration(
            "오래된 것",
            taken_at=date(2026, 1, 1),
            created_at=datetime(2026, 1, 3),
        )
        self._image(old, "/images/old.jpg")
        newest = self._illustration(
            "최신 것",
            taken_at=date(2026, 1, 3),
            created_at=datetime(2026, 1, 1),
        )
        self._image(newest, "/images/newest.jpg")
        undated = self._illustration(
            "날짜 없음", created_at=datetime(2026, 1, 2)
        )
        self._image(undated, "/images/undated.jpg")
        self.db.commit()

        items, total = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            sort="taken",
        )
        self.assertEqual(total, 3)
        self.assertEqual(items[0]["title"], "최신 것")
        self.assertEqual(items[2]["title"], "날짜 없음")

        items, total = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            filter_basis="taken",
            date_from=date(2026, 1, 2),
            date_to=date(2026, 1, 3),
        )
        self.assertEqual(total, 1)
        self.assertEqual(items[0]["title"], "최신 것")

        items, total = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            sort="created",
        )
        self.assertEqual([item["title"] for item in items], [
            "오래된 것",
            "날짜 없음",
            "최신 것",
        ])

    def test_created_date_filter_uses_kst_calendar_days(self) -> None:
        # 2026-01-02 00:00 KST is 2026-01-01 15:00 UTC.
        next_day = self._illustration(
            "KST 다음날",
            created_at=datetime(2026, 1, 1, 15),
        )
        previous_day = self._illustration(
            "KST 전날",
            created_at=datetime(2026, 1, 1, 14, 59),
        )
        self._image(next_day, "/images/next-day.jpg")
        self._image(previous_day, "/images/previous-day.jpg")
        self.db.commit()

        items, total = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            filter_basis="created",
            date_from=date(2026, 1, 2),
            date_to=date(2026, 1, 2),
        )
        self.assertEqual(total, 1)
        self.assertEqual(items[0]["title"], "KST 다음날")
        self.assertEqual(
            _utc_boundary(date(2026, 1, 2), end=True),
            datetime(2026, 1, 2, 15),
        )

    def test_locked_flag_depends_on_viewer_and_grants(self) -> None:
        protected = self._illustration("보호", protected=True)
        self._image(protected, "/images/protected.jpg")
        self.db.commit()

        items, _ = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
        )
        self.assertTrue(items[0]["locked"])

        items, _ = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            granted_illustrations=frozenset({protected.id}),
        )
        self.assertFalse(items[0]["locked"])

        items, _ = get_visible_illustrations(
            self.db,
            author_user_id=self.owner.id,
            viewer_user_id=self.owner.id,
        )
        self.assertFalse(items[0]["locked"])

    def test_admin_list_pagination_and_tag_search(self) -> None:
        for index in range(3):
            self._illustration(
                f"바다 {index}" if index == 0 else f"하늘 {index}",
                created_at=datetime(2026, 1, 1, 0, 0, index),
            )
        tag = Tag(
            user_id=self.owner.id,
            name="여행",
            normalized_name="여행",
        )
        self.db.add(tag)
        self.db.flush()
        first = (
            self.db.query(Illustration)
            .filter(Illustration.title == "바다 0")
            .first()
        )
        self.db.add(
            IllustrationTag(illustration_id=first.id, tag_id=tag.id)
        )
        self.db.commit()

        items, total = get_all_illustrations(
            self.db,
            self.owner.id,
            query="여행",
            page=1,
            page_size=5,
        )
        self.assertEqual(total, 1)
        self.assertEqual(items[0]["title"], "바다 0")
        self.assertEqual(items[0]["image_count"], 0)

        items, total = get_all_illustrations(
            self.db,
            self.owner.id,
            page=2,
            page_size=2,
        )
        self.assertEqual(total, 3)
        self.assertEqual(len(items), 1)
