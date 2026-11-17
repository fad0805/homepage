import unittest
from datetime import date

from crud.bookmark.journal import get_journal_tree
from models.bookmark import BookmarkGoal, BookmarkRating, BookmarkReview
from models.users import User
from tests.bookmark_test_base import BookmarkDatabaseTestCase


class BookmarkJournalTreeTests(
    BookmarkDatabaseTestCase,
    unittest.TestCase,
):
    def setUp(self) -> None:
        super().setUp()
        user = User(
            username="journal-tree",
            hashed_password="x",
            role="user",
        )
        self.db.add(user)
        self.db.commit()
        self.user_id = user.id

    def add_record(
        self,
        period_type: str,
        period_start: date,
        *,
        goal: str | None = None,
        rating: int | None = None,
        review: str | None = None,
    ) -> None:
        if goal is not None:
            self.db.add(
                BookmarkGoal(
                    user_id=self.user_id,
                    period_type=period_type,
                    period_start=period_start,
                    content=goal,
                )
            )
        if rating is not None:
            self.db.add(
                BookmarkRating(
                    user_id=self.user_id,
                    period_type=period_type,
                    period_start=period_start,
                    rating=rating,
                )
            )
        if review is not None:
            self.db.add(
                BookmarkReview(
                    user_id=self.user_id,
                    period_type=period_type,
                    period_start=period_start,
                    content=review,
                )
            )
        self.db.commit()

    def test_tree_chains_day_to_week_to_month_to_quarter_to_year(self):
        self.add_record(
            "year",
            date(2026, 1, 1),
            goal="연간 목표",
            rating=4,
        )
        self.add_record("quarter", date(2026, 10, 1), goal="4분기 목표")
        self.add_record("month", date(2026, 11, 1), review="11월 후기")
        self.add_record(
            "week",
            date(2026, 11, 2),
            goal="첫째 주 목표",
            rating=3,
        )
        self.add_record(
            "day",
            date(2026, 11, 3),
            goal="3일 목표",
            rating=2,
            review="3일 후기",
        )
        self.add_record(
            "day",
            date(2026, 11, 10),
            goal="10일 목표",
            rating=5,
        )
        self.add_record("year", date(2030, 1, 1), goal="2030 목표")

        tree = get_journal_tree(
            self.db,
            self.user_id,
            decade_start=date(2026, 5, 1),
        )

        self.assertEqual(tree["label"], "2020년대")
        self.assertEqual(len(tree["years"]), 1)
        year = tree["years"][0]
        self.assertEqual(year["goal"].content, "연간 목표")
        self.assertEqual(year["goal_count"], 5)
        self.assertEqual(year["rating_count"], 4)
        self.assertEqual(year["average_rating"], 3.5)

        quarter = year["children"][0]
        self.assertEqual(quarter["label"], "2026년 4분기")
        self.assertEqual(quarter["goal"].content, "4분기 목표")

        month = quarter["children"][0]
        self.assertEqual(month["label"], "2026년 11월")
        self.assertEqual(month["review"].content, "11월 후기")
        self.assertEqual(len(month["children"]), 2)

        week = month["children"][0]
        self.assertEqual(week["level"], "week")
        self.assertEqual(week["goal"].content, "첫째 주 목표")

        day = week["children"][0]
        self.assertEqual(day["level"], "day")
        self.assertEqual(day["goal"].content, "3일 목표")
        self.assertEqual(day["rating"].rating, 2)

    def test_empty_records_are_pruned(self):
        self.add_record(
            "day",
            date(2026, 11, 3),
            goal="",
            review="",
        )
        tree = get_journal_tree(
            self.db,
            self.user_id,
            decade_start=date(2026, 1, 1),
        )
        self.assertEqual(tree["years"], [])
