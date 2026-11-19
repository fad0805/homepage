import os
import unittest
from datetime import date
from unittest.mock import patch

os.environ.setdefault("ENVIRONMENT", "development")

from fastapi import HTTPException

from crud.bookmark.periods import _load_checks, get_period, get_today
from crud.bookmark.routines import (
    create_routine,
    reorder_routines,
    update_routine,
)
from models.bookmark import BookmarkRoutine
from schemas.bookmark import (
    BookmarkRoutineCreate,
    BookmarkRoutineReorder,
    BookmarkRoutineUpdate,
)
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

    def test_count_windows_control_today_visibility(self) -> None:
        monthly = self.make_routine(
            frequency="monthly",
            tracking_mode="count",
            target_count=2,
            window_start=15,
            window_end=20,
            start_date=date(2025, 1, 1),
        )
        weekly = self.make_routine(
            frequency="weekly",
            tracking_mode="count",
            target_count=3,
            window_start=2,
            window_end=5,
            start_date=date(2025, 1, 1),
        )
        yearly = self.make_routine(
            frequency="yearly",
            tracking_mode="count",
            target_count=1,
            window_start=4,
            window_end=11,
            start_date=date(2025, 1, 1),
        )

        hidden = get_today(self.db, 1, day=date(2026, 3, 14))
        hidden_ids = [item["id"] for item in hidden["routines"]]
        self.assertNotIn(monthly.id, hidden_ids)
        self.assertNotIn(yearly.id, hidden_ids)

        monthly_day = get_today(self.db, 1, day=date(2026, 3, 15))
        monthly_ids = [item["id"] for item in monthly_day["routines"]]
        self.assertIn(monthly.id, monthly_ids)
        after_monthly = get_today(self.db, 1, day=date(2026, 3, 21))
        self.assertNotIn(
            monthly.id,
            [item["id"] for item in after_monthly["routines"]],
        )

        weekly_day = get_today(self.db, 1, day=date(2026, 3, 3))
        self.assertNotIn(
            weekly.id,
            [item["id"] for item in weekly_day["routines"]],
        )
        weekly_window = get_today(self.db, 1, day=date(2026, 3, 4))
        self.assertIn(
            weekly.id,
            [item["id"] for item in weekly_window["routines"]],
        )
        after_weekly = get_today(self.db, 1, day=date(2026, 3, 8))
        self.assertNotIn(
            weekly.id,
            [item["id"] for item in after_weekly["routines"]],
        )

        yearly_day = get_today(self.db, 1, day=date(2026, 4, 1))
        self.assertIn(yearly.id, [item["id"] for item in yearly_day["routines"]])
        after_yearly = get_today(self.db, 1, day=date(2026, 12, 1))
        self.assertNotIn(
            yearly.id,
            [item["id"] for item in after_yearly["routines"]],
        )

        entry = next(
            item for item in monthly_day["routines"] if item["id"] == monthly.id
        )
        self.assertEqual(entry["window_start"], 15)
        self.assertEqual(entry["window_end"], 20)
        self.assertEqual(entry["active_from"], date(2026, 3, 15))
        self.assertEqual(entry["active_until"], date(2026, 3, 20))
        self.assertEqual(entry["deadline"], date(2026, 3, 20))

    def test_period_can_skip_routine_loading(self) -> None:
        routine = self.make_routine(
            frequency="daily",
            tracking_mode="count",
            start_date=date(2026, 1, 1),
        )
        full = get_period(
            self.db,
            1,
            period_type="day",
            period_start=date(2026, 3, 15),
        )
        self.assertIn(
            routine.id,
            [item["id"] for item in full["routines"]],
        )
        light = get_period(
            self.db,
            1,
            period_type="day",
            period_start=date(2026, 3, 15),
            include_routines=False,
        )
        self.assertEqual(light["routines"], [])

    def test_create_count_routine_records_first_window_start(self) -> None:
        with patch(
            "crud.bookmark.routines._kst_today",
            return_value=date(2026, 3, 3),
        ):
            routine = create_routine(
                self.db,
                BookmarkRoutineCreate(
                    frequency="monthly",
                    title="월간 루틴",
                    tracking_mode="count",
                    target_count=2,
                    window_start=15,
                    window_end=20,
                ),
                1,
            )
        self.assertEqual(routine.start_date, date(2026, 3, 15))

        with patch(
            "crud.bookmark.routines._kst_today",
            return_value=date(2026, 3, 18),
        ):
            active = create_routine(
                self.db,
                BookmarkRoutineCreate(
                    frequency="monthly",
                    title="진행 중 루틴",
                    tracking_mode="count",
                    target_count=2,
                    window_start=15,
                    window_end=20,
                ),
                1,
            )
        self.assertEqual(active.start_date, date(2026, 3, 18))

        with patch(
            "crud.bookmark.routines._kst_today",
            return_value=date(2026, 3, 25),
        ):
            next_window = create_routine(
                self.db,
                BookmarkRoutineCreate(
                    frequency="monthly",
                    title="다음 창 루틴",
                    tracking_mode="count",
                    target_count=2,
                    window_start=15,
                    window_end=20,
                ),
                1,
            )
        self.assertEqual(next_window.start_date, date(2026, 4, 15))


class BookmarkRoutineOrderTests(
    BookmarkDatabaseTestCase,
    unittest.TestCase,
):
    def make_daily_routines(self, count: int):
        return [
            self.make_routine(
                title=f"루틴 {index + 1}",
                frequency="daily",
                tracking_mode="count",
                position=0,
                start_date=date(2025, 1, 1),
            )
            for index in range(count)
        ]

    def ordered_titles(self) -> list[str]:
        data = get_period(
            self.db,
            1,
            period_type="day",
            period_start=date(2026, 11, 17),
        )
        return [routine["title"] for routine in data["routines"]]

    def test_reorder_repairs_duplicate_positions(self) -> None:
        routines = self.make_daily_routines(4)
        self.assertEqual(
            self.ordered_titles(),
            ["루틴 1", "루틴 2", "루틴 3", "루틴 4"],
        )

        reorder_routines(
            self.db,
            BookmarkRoutineReorder(
                ids=[
                    routines[2].id,
                    routines[0].id,
                    routines[3].id,
                    routines[1].id,
                ]
            ),
            1,
        )

        self.assertEqual(
            self.ordered_titles(),
            ["루틴 3", "루틴 1", "루틴 4", "루틴 2"],
        )
        positions = [
            routine.position
            for routine in self.db.query(BookmarkRoutine)
            .order_by(BookmarkRoutine.position)
            .all()
        ]
        self.assertEqual(positions, [0, 1, 2, 3])

    def test_reorder_subset_preserves_unlisted_order(self) -> None:
        routines = self.make_daily_routines(4)

        # Today's view may only show a subset. Move 루틴 4 above 루틴 2 while
        # keeping 루틴 1 and 루틴 3 in their existing relative order.
        reorder_routines(
            self.db,
            BookmarkRoutineReorder(
                ids=[routines[3].id, routines[1].id]
            ),
            1,
        )

        self.assertEqual(
            self.ordered_titles(),
            ["루틴 1", "루틴 4", "루틴 3", "루틴 2"],
        )

    def test_reorder_rejects_unknown_or_calendar_only_routine(self) -> None:
        routines = self.make_daily_routines(2)
        calendar_only = self.make_routine(
            title="기념일",
            frequency="yearly",
            tracking_mode="date",
            position=0,
            calendar_only=True,
        )

        for ids in ([routines[0].id, 999999], [calendar_only.id]):
            with self.assertRaises(HTTPException) as context:
                reorder_routines(
                    self.db,
                    BookmarkRoutineReorder(ids=ids),
                    1,
                )
            self.assertEqual(context.exception.status_code, 404)

    def test_load_checks_is_bounded_on_both_ends(self) -> None:
        routine = self.make_routine(frequency="monthly", tracking_mode="date")
        self.add_check(routine, "month", date(2026, 2, 1))
        self.add_check(routine, "month", date(2026, 3, 1))
        self.add_check(routine, "month", date(2026, 4, 1))

        checks = _load_checks(
            self.db,
            routine.user_id,
            date(2026, 3, 1),
            end=date(2026, 3, 31),
        )

        self.assertIsNotNone(checks.row(routine, "month", date(2026, 3, 1)))
        self.assertIsNone(checks.row(routine, "month", date(2026, 2, 1)))
        self.assertIsNone(checks.row(routine, "month", date(2026, 4, 1)))

    def test_get_period_passes_period_bounds_to_check_loader(self) -> None:
        with patch("crud.bookmark.periods._load_checks") as loader:
            get_period(
                self.db,
                1,
                period_type="month",
                period_start=date(2026, 3, 1),
            )

        loader.assert_called_once_with(
            self.db,
            1,
            date(2026, 3, 1),
            end=date(2026, 3, 31),
        )

    def test_get_today_passes_today_as_check_end(self) -> None:
        with patch("crud.bookmark.periods._load_checks") as loader:
            get_today(self.db, 1, day=date(2026, 3, 15))

        loader.assert_called_once_with(
            self.db,
            1,
            date(2026, 1, 1),
            end=date(2026, 3, 15),
        )

    def test_get_period_batches_check_queries(self) -> None:
        from sqlalchemy import event

        statements: list[str] = []

        @event.listens_for(self.engine, "before_cursor_execute")
        def record_statement(
            conn, cursor, statement, parameters, context, executemany
        ):
            statements.append(statement)

        routines = [
            self.make_routine(
                frequency="monthly",
                tracking_mode="date",
                day_of_month=10,
                title=f"루틴 {index}",
                position=index,
            )
            for index in range(5)
        ]
        for routine in routines:
            self.add_check(routine, "month", date(2026, 11, 1), count=1)
        statements.clear()

        with patch(
            "crud.bookmark.periods._kst_today",
            return_value=date(2026, 11, 18),
        ):
            data = get_period(
                self.db,
                routines[0].user_id,
                period_type="month",
                period_start=date(2026, 11, 1),
            )

        self.assertEqual(len(data["routines"]), 5)
        self.assertLess(len(statements), 10)
        self.assertTrue(
            all(
                entry["completed_count"] == 1
                for entry in data["routines"]
            )
        )

    def test_get_today_batches_check_queries(self) -> None:
        from sqlalchemy import event

        statements: list[str] = []

        @event.listens_for(self.engine, "before_cursor_execute")
        def record_statement(
            conn, cursor, statement, parameters, context, executemany
        ):
            statements.append(statement)

        routines = self.make_daily_routines(5)
        for routine in routines:
            self.add_check(routine, "day", date(2026, 11, 18), count=1)
        statements.clear()

        data = get_today(
            self.db,
            routines[0].user_id,
            day=date(2026, 11, 18),
        )

        self.assertEqual(len(data["routines"]), 5)
        self.assertLess(len(statements), 10)
        self.assertTrue(
            all(
                entry["completed_count"] == 1
                for entry in data["routines"]
            )
        )


if __name__ == "__main__":
    unittest.main()
