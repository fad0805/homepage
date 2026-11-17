import unittest
from datetime import date, timedelta
from unittest.mock import patch

from crud.bookmark.schedule import _routine_monthly_due_date
from crud.bookmark.statistics import (
    _routine_month_values,
    get_statistics,
)
from tests.bookmark_test_base import BookmarkDatabaseTestCase


class BookmarkStatisticsTests(
    BookmarkDatabaseTestCase,
    unittest.TestCase,
):
    def test_monthly_date_due_before_start_is_not_counted(self) -> None:
        routine = self.make_routine(
            frequency="monthly",
            tracking_mode="date",
            day_of_month=10,
            start_date=date(2026, 3, 15),
        )
        self.assertIsNone(
            _routine_month_values(self.db, routine, date(2026, 3, 1))
        )

    def test_monthly_date_due_after_end_is_not_counted(self) -> None:
        routine = self.make_routine(
            frequency="monthly",
            tracking_mode="date",
            day_of_month=10,
            end_date=date(2026, 3, 5),
        )
        self.assertIsNone(
            _routine_month_values(self.db, routine, date(2026, 3, 1))
        )

    def test_monthly_date_due_inside_active_range_is_counted(self) -> None:
        routine = self.make_routine(
            frequency="monthly",
            tracking_mode="date",
            day_of_month=10,
            start_date=date(2026, 3, 1),
        )
        self.assertEqual(
            _routine_month_values(self.db, routine, date(2026, 3, 1)),
            (0, 1),
        )
        self.add_check(routine, "month", date(2026, 3, 1))
        self.assertEqual(
            _routine_month_values(self.db, routine, date(2026, 3, 1)),
            (1, 1),
        )

    def test_monthly_nth_weekday_due_before_start_is_not_counted(self) -> None:
        routine = self.make_routine(
            frequency="monthly",
            tracking_mode="date",
            day_of_month=None,
            nth_week=2,
            weekday=2,
            start_date=date(2026, 3, 1),
        )
        due_date = _routine_monthly_due_date(routine, date(2026, 3, 1))
        assert due_date is not None
        routine.start_date = due_date + timedelta(days=1)
        self.db.commit()
        self.assertIsNone(
            _routine_month_values(self.db, routine, date(2026, 3, 1))
        )

    def test_weekly_multiple_weekdays_expected_count(self) -> None:
        weekdays = [0, 2]
        routine = self.make_routine(
            frequency="weekly",
            tracking_mode="date",
            weekdays=weekdays,
            target_count=2,
            start_date=date(2026, 3, 1),
        )
        expected = sum(
            1
            for day in range(1, 32)
            if date(2026, 3, day).weekday() in weekdays
        )
        self.assertEqual(
            _routine_month_values(self.db, routine, date(2026, 3, 1)),
            (0, expected),
        )

    def test_quarterly_specific_quarter_only_counts_that_quarter(self) -> None:
        routine = self.make_routine(
            frequency="quarterly",
            tracking_mode="date",
            month=4,
            start_date=date(2025, 1, 1),
        )
        self.assertIsNone(
            _routine_month_values(self.db, routine, date(2026, 1, 1))
        )
        self.assertEqual(
            _routine_month_values(self.db, routine, date(2026, 4, 1)),
            (0, 1),
        )

    def test_statistics_monthly_bucket_uses_expected_count(self) -> None:
        routine = self.make_routine(
            frequency="monthly",
            tracking_mode="date",
            day_of_month=10,
            start_date=date(2025, 1, 1),
            position=0,
        )
        self.add_check(routine, "month", date(2025, 1, 1))
        with patch(
            "crud.bookmark.statistics._kst_today",
            return_value=date(2026, 11, 17),
        ):
            data = get_statistics(self.db, routine.user_id)
        entry = next(
            item for item in data["routines"] if item["id"] == routine.id
        )
        bucket = next(
            item
            for item in entry["buckets"]
            if item["period_start"] == date(2025, 1, 1)
        )
        self.assertEqual(bucket["completed_count"], 1)
        self.assertEqual(bucket["expected_count"], 1)


if __name__ == "__main__":
    unittest.main()
