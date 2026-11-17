import unittest
from datetime import date

from fastapi import HTTPException

from crud.bookmark.common import (
    _month_end,
    _month_has_day,
    _nth_weekday_day,
    _period_end,
    _shift_months,
)
from crud.bookmark.schedule import (
    _quarter_matches,
    _routine_monthly_due_date,
    _validate_schedule,
)


class BookmarkScheduleTests(unittest.TestCase):
    def test_shift_months_clamps_to_month_end(self) -> None:
        self.assertEqual(
            _shift_months(date(2024, 1, 31), 1),
            date(2024, 2, 29),
        )
        self.assertEqual(
            _shift_months(date(2025, 1, 31), 1),
            date(2025, 2, 28),
        )
        self.assertEqual(
            _shift_months(date(2024, 3, 31), -1),
            date(2024, 2, 29),
        )

    def test_month_and_period_boundaries(self) -> None:
        self.assertEqual(_month_end(date(2024, 2, 10)), date(2024, 2, 29))
        self.assertEqual(_period_end("day", date(2026, 11, 17)), date(2026, 11, 17))
        self.assertEqual(
            _period_end("week", date(2026, 11, 17)),
            date(2026, 11, 23),
        )
        self.assertEqual(
            _period_end("month", date(2024, 2, 10)),
            date(2024, 2, 29),
        )
        self.assertEqual(
            _period_end("quarter", date(2026, 1, 1)),
            date(2026, 3, 31),
        )
        self.assertEqual(
            _period_end("year", date(2026, 2, 10)),
            date(2026, 12, 31),
        )

    def test_month_has_day_and_nth_weekday(self) -> None:
        self.assertTrue(_month_has_day(2024, 2, 29))
        self.assertFalse(_month_has_day(2025, 2, 29))
        self.assertFalse(_month_has_day(2026, 4, 31))
        self.assertEqual(_nth_weekday_day(2026, 3, 2, 2), 11)
        self.assertIsNone(_nth_weekday_day(2026, 3, 5, 2))

    def test_monthly_due_date_handles_missing_days(self) -> None:
        routine = type("Routine", (), {})()
        routine.day_of_month = 31
        routine.nth_week = None
        routine.weekday = None
        self.assertIsNone(
            _routine_monthly_due_date(routine, date(2026, 2, 1))
        )
        routine.day_of_month = 10
        self.assertEqual(
            _routine_monthly_due_date(routine, date(2026, 2, 1)),
            date(2026, 2, 10),
        )

    def test_validate_schedule_weekly_multiple_days(self) -> None:
        mode, target, schedule = _validate_schedule(
            frequency="weekly",
            tracking_mode="date",
            target_count=1,
            weekday=None,
            weekdays=[4, 0, 4],
            day_of_month=None,
            nth_week=None,
            month=None,
        )
        self.assertEqual(mode, "date")
        self.assertEqual(target, 2)
        self.assertEqual(schedule["weekdays"], [0, 4])

    def test_validate_schedule_monthly_day_or_nth_week(self) -> None:
        mode, target, schedule = _validate_schedule(
            frequency="monthly",
            tracking_mode="date",
            target_count=1,
            weekday=None,
            weekdays=None,
            day_of_month=31,
            nth_week=None,
            month=None,
        )
        self.assertEqual((mode, target), ("date", 1))
        self.assertEqual(schedule["day_of_month"], 31)

        mode, target, schedule = _validate_schedule(
            frequency="monthly",
            tracking_mode="date",
            target_count=1,
            weekday=2,
            weekdays=None,
            day_of_month=None,
            nth_week=2,
            month=None,
        )
        self.assertEqual((mode, target), ("date", 1))
        self.assertEqual(schedule["nth_week"], 2)
        self.assertEqual(schedule["weekday"], 2)

    def test_validate_schedule_quarter_selection(self) -> None:
        mode, target, schedule = _validate_schedule(
            frequency="quarterly",
            tracking_mode="date",
            target_count=1,
            weekday=None,
            weekdays=None,
            day_of_month=None,
            nth_week=None,
            month=7,
        )
        self.assertEqual((mode, target), ("date", 1))
        self.assertEqual(schedule["month"], 7)

        with self.assertRaises(HTTPException):
            _validate_schedule(
                frequency="quarterly",
                tracking_mode="date",
                target_count=1,
                weekday=None,
                weekdays=None,
                day_of_month=None,
                nth_week=None,
                month=2,
            )

    def test_validate_schedule_yearly_leap_day(self) -> None:
        mode, target, schedule = _validate_schedule(
            frequency="yearly",
            tracking_mode="date",
            target_count=1,
            weekday=None,
            weekdays=None,
            day_of_month=29,
            nth_week=None,
            month=2,
        )
        self.assertEqual((mode, target), ("date", 1))
        self.assertEqual(schedule["day_of_month"], 29)

        with self.assertRaises(HTTPException):
            _validate_schedule(
                frequency="yearly",
                tracking_mode="date",
                target_count=1,
                weekday=None,
                weekdays=None,
                day_of_month=30,
                nth_week=None,
                month=2,
            )

    def test_quarter_matches_only_selected_quarter(self) -> None:
        routine = type("Routine", (), {})()
        routine.frequency = "quarterly"
        routine.month = 4
        self.assertTrue(_quarter_matches(routine, date(2026, 4, 1)))
        self.assertTrue(_quarter_matches(routine, date(2026, 6, 30)))
        self.assertFalse(_quarter_matches(routine, date(2026, 7, 1)))


if __name__ == "__main__":
    unittest.main()
