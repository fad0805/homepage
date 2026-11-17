import unittest
from datetime import date

from crud.bookmark.history import prune_old_routine_checks
from models.bookmark import BookmarkRoutineCheck, BookmarkRoutineMonthlyStat
from tests.bookmark_test_base import BookmarkDatabaseTestCase


class BookmarkRetentionTests(
    BookmarkDatabaseTestCase,
    unittest.TestCase,
):
    def test_prune_keeps_recent_checks_and_preserves_monthly_stats(self) -> None:
        routine = self.make_routine(
            frequency="daily",
            tracking_mode="date",
            start_date=date(2024, 1, 1),
        )
        old_day = self.add_check(routine, "day", date(2026, 8, 1))
        recent_day = self.add_check(routine, "day", date(2026, 9, 1))
        old_month = self.add_check(routine, "month", date(2023, 10, 1))
        recent_month = self.add_check(routine, "month", date(2024, 1, 1))
        old_day_id = old_day.id
        recent_day_id = recent_day.id
        old_month_id = old_month.id
        recent_month_id = recent_month.id

        deleted = prune_old_routine_checks(
            self.db,
            today=date(2026, 11, 17),
        )

        self.assertEqual(deleted, 2)
        remaining_checks = self.db.query(BookmarkRoutineCheck).all()
        remaining_dates = {
            check.period_start for check in remaining_checks
        }
        remaining_ids = {check.id for check in remaining_checks}
        self.assertEqual(
            remaining_dates,
            {date(2026, 9, 1), date(2024, 1, 1)},
        )
        self.assertNotIn(old_day_id, remaining_ids)
        self.assertIn(recent_day_id, remaining_ids)
        self.assertNotIn(old_month_id, remaining_ids)
        self.assertIn(recent_month_id, remaining_ids)

        stat_months = {
            stat.month_start
            for stat in self.db.query(BookmarkRoutineMonthlyStat).all()
        }
        self.assertIn(date(2026, 8, 1), stat_months)
        self.assertIn(date(2026, 9, 1), stat_months)
        self.assertIn(date(2024, 1, 1), stat_months)

    def test_prune_boundary_preserves_cutoff_checks_and_monthly_stats(
        self,
    ) -> None:
        daily = self.make_routine(
            frequency="daily",
            tracking_mode="date",
            start_date=date(2023, 1, 1),
            position=0,
        )
        short_kept = self.add_check(
            daily,
            "day",
            date(2026, 8, 17),
        )
        short_dropped = self.add_check(
            daily,
            "day",
            date(2026, 8, 16),
        )
        monthly = self.make_routine(
            frequency="monthly",
            tracking_mode="date",
            day_of_month=1,
            start_date=date(2023, 1, 1),
            position=1,
        )
        long_dropped = self.add_check(
            monthly,
            "month",
            date(2023, 11, 1),
        )
        short_kept_id = short_kept.id
        short_dropped_id = short_dropped.id
        long_dropped_id = long_dropped.id

        deleted = prune_old_routine_checks(
            self.db,
            today=date(2026, 11, 17),
        )

        self.assertEqual(deleted, 2)
        remaining_ids = {
            check.id for check in self.db.query(BookmarkRoutineCheck).all()
        }
        self.assertIn(short_kept_id, remaining_ids)
        self.assertNotIn(short_dropped_id, remaining_ids)
        self.assertNotIn(long_dropped_id, remaining_ids)

        stats = {
            (stat.routine_id, stat.month_start): stat
            for stat in self.db.query(BookmarkRoutineMonthlyStat).all()
        }
        august = stats[(daily.id, date(2026, 8, 1))]
        self.assertEqual(august.completed_count, 2)
        november = stats[(monthly.id, date(2023, 11, 1))]
        self.assertEqual(november.completed_count, 1)
        self.assertEqual(november.expected_count, 1)

        self.assertEqual(
            prune_old_routine_checks(
                self.db,
                today=date(2026, 11, 17),
            ),
            0,
        )
        stats_after_second_prune = {
            (stat.routine_id, stat.month_start): stat
            for stat in self.db.query(BookmarkRoutineMonthlyStat).all()
        }
        self.assertEqual(stats, stats_after_second_prune)


if __name__ == "__main__":
    unittest.main()
