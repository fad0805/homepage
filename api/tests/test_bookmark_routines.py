import os
import unittest
from datetime import date

os.environ.setdefault("ENVIRONMENT", "development")

from fastapi import HTTPException

from crud.bookmark.routines import update_routine
from schemas.bookmark import BookmarkRoutineUpdate
from tests.bookmark_test_base import BookmarkDatabaseTestCase


class BookmarkRoutineTests(
    BookmarkDatabaseTestCase,
    unittest.TestCase,
):
    def test_update_ended_routine_is_rejected(self) -> None:
        routine = self.make_routine(
            frequency="daily",
            tracking_mode="date",
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 15),
        )

        with self.assertRaises(HTTPException) as raised:
            update_routine(
                self.db,
                routine.id,
                BookmarkRoutineUpdate(title="수정된 루틴"),
                routine.user_id,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.db.refresh(routine)
        self.assertEqual(routine.title, "테스트 루틴")

    def test_update_active_routine_is_allowed(self) -> None:
        routine = self.make_routine(
            frequency="daily",
            tracking_mode="date",
            start_date=date(2026, 3, 1),
            end_date=None,
        )

        updated = update_routine(
            self.db,
            routine.id,
            BookmarkRoutineUpdate(title="수정된 루틴"),
            routine.user_id,
        )

        self.assertEqual(updated.title, "수정된 루틴")


if __name__ == "__main__":
    unittest.main()
