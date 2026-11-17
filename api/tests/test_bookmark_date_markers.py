import unittest
from datetime import date

from fastapi import HTTPException

from crud.bookmark.date_markers import (
    create_date_marker,
    delete_date_marker,
    list_date_markers,
    update_date_marker,
)
from schemas.bookmark import (
    BookmarkDateMarkerCreate,
    BookmarkDateMarkerInterval,
    BookmarkDateMarkerUpdate,
)
from tests.bookmark_test_base import BookmarkDatabaseTestCase


class BookmarkDateMarkerTests(BookmarkDatabaseTestCase, unittest.TestCase):
    def test_create_and_list_simple_marker(self) -> None:
        created = create_date_marker(
            self.db,
            BookmarkDateMarkerCreate(
                title="생리",
                memo="첫날",
                marker_date=date(2026, 11, 17),
            ),
            1,
        )

        self.assertEqual(created["marker"], "생")
        self.assertFalse(created["is_dday"])
        self.assertFalse(created["pinned"])
        self.assertEqual(created["intervals"], [])
        self.assertEqual(created["memo"], "첫날")

        listed = list_date_markers(self.db, 1)
        self.assertEqual(len(listed["markers"]), 1)
        self.assertEqual(listed["markers"][0]["title"], "생리")

    def test_dday_marker_keeps_intervals_and_pin(self) -> None:
        created = create_date_marker(
            self.db,
            BookmarkDateMarkerCreate(
                title="성생활",
                marker_date=date(2026, 11, 1),
                is_dday=True,
                pinned=True,
                intervals=[
                    BookmarkDateMarkerInterval(unit="day", value=100),
                    BookmarkDateMarkerInterval(unit="year", value=1),
                ],
            ),
            1,
        )

        self.assertEqual(created["marker"], "성")
        self.assertTrue(created["is_dday"])
        self.assertTrue(created["pinned"])
        self.assertEqual(
            created["intervals"],
            [
                {"unit": "day", "value": 100},
                {"unit": "year", "value": 1},
            ],
        )

    def test_update_replaces_intervals(self) -> None:
        created = create_date_marker(
            self.db,
            BookmarkDateMarkerCreate(
                title="디데이",
                marker_date=date(2026, 11, 1),
                is_dday=True,
                intervals=[
                    BookmarkDateMarkerInterval(unit="day", value=100)
                ],
            ),
            1,
        )

        updated = update_date_marker(
            self.db,
            created["id"],
            BookmarkDateMarkerUpdate(
                intervals=[
                    BookmarkDateMarkerInterval(unit="year", value=1)
                ]
            ),
            1,
        )

        self.assertEqual(
            updated["intervals"],
            [{"unit": "year", "value": 1}],
        )

    def test_update_clears_dday_only_fields_when_disabled(self) -> None:
        created = create_date_marker(
            self.db,
            BookmarkDateMarkerCreate(
                title="디데이",
                marker_date=date(2026, 11, 1),
                is_dday=True,
                pinned=True,
                intervals=[
                    BookmarkDateMarkerInterval(unit="day", value=7)
                ],
            ),
            1,
        )

        updated = update_date_marker(
            self.db,
            created["id"],
            BookmarkDateMarkerUpdate(is_dday=False),
            1,
        )

        self.assertFalse(updated["is_dday"])
        self.assertFalse(updated["pinned"])
        self.assertEqual(updated["intervals"], [])

    def test_update_memo_and_delete(self) -> None:
        created = create_date_marker(
            self.db,
            BookmarkDateMarkerCreate(
                title="메모",
                marker_date=date(2026, 11, 2),
            ),
            1,
        )

        updated = update_date_marker(
            self.db,
            created["id"],
            BookmarkDateMarkerUpdate(memo="수정된 메모"),
            1,
        )
        self.assertEqual(updated["memo"], "수정된 메모")

        deleted = delete_date_marker(self.db, created["id"], 1)
        self.assertTrue(deleted["success"])
        self.assertEqual(list_date_markers(self.db, 1)["markers"], [])

    def test_marker_is_scoped_to_user(self) -> None:
        created = create_date_marker(
            self.db,
            BookmarkDateMarkerCreate(
                title="다른 사용자",
                marker_date=date(2026, 11, 3),
            ),
            1,
        )

        with self.assertRaises(HTTPException) as context:
            update_date_marker(
                self.db,
                created["id"],
                BookmarkDateMarkerUpdate(title="변경"),
                2,
            )
        self.assertEqual(context.exception.status_code, 404)

        with self.assertRaises(HTTPException) as context:
            delete_date_marker(self.db, created["id"], 2)
        self.assertEqual(context.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
