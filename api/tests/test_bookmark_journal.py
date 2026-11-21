import unittest
from datetime import date, time

from fastapi import HTTPException

from crud.bookmark.journal import get_journal_tree, save_rating
from models.bookmark import (
    BookmarkGoal,
    BookmarkMoodTag,
    BookmarkRating,
    BookmarkReview,
)
from models.users import User
from schemas.bookmark import BookmarkRatingUpdate
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
        # Direct week/year ratings are no longer accepted; only daily ratings
        # feed the hierarchy (2 and 5 -> 3.5 for every larger period).
        self.assertEqual(year["rating_count"], 1)
        self.assertEqual(year["average_rating"], 3.5)
        self.assertEqual(year["rating"]["rating"], 4)

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

    def test_week_is_grouped_by_its_thursday(self):
        self.add_record(
            "week",
            date(2026, 11, 23),
            goal="11월 넷째주 목표",
        )
        self.add_record(
            "week",
            date(2026, 11, 30),
            goal="12월 첫째주 목표",
        )
        self.add_record(
            "day",
            date(2026, 12, 1),
            goal="12월 1일 목표",
        )

        tree = get_journal_tree(
            self.db,
            self.user_id,
            decade_start=date(2026, 1, 1),
        )

        year = tree["years"][0]
        quarter = year["children"][0]
        months = {
            month["label"]: month for month in quarter["children"]
        }
        self.assertEqual(len(months["2026년 11월"]["children"]), 1)
        self.assertEqual(len(months["2026년 12월"]["children"]), 1)

        week = months["2026년 12월"]["children"][0]
        self.assertEqual(week["period_start"], date(2026, 11, 30))
        self.assertEqual(week["label"], "2026년 12월 첫째주")
        self.assertEqual(week["goal"].content, "12월 첫째주 목표")
        self.assertEqual(
            week["children"][0]["period_start"],
            date(2026, 12, 1),
        )

    def test_week_grouping_respects_decade_boundary(self):
        self.add_record(
            "week",
            date(2019, 12, 30),
            goal="2020년 1월 첫째주 목표",
        )
        self.add_record(
            "week",
            date(2029, 12, 31),
            goal="2030년 1월 첫째주 목표",
        )

        tree = get_journal_tree(
            self.db,
            self.user_id,
            decade_start=date(2020, 1, 1),
        )

        self.assertEqual(tree["label"], "2020년대")
        self.assertEqual(len(tree["years"]), 1)
        year = tree["years"][0]
        self.assertEqual(year["label"], "2020년")
        quarter = year["children"][0]
        month = quarter["children"][0]
        self.assertEqual(month["label"], "2020년 1월")
        week = month["children"][0]
        self.assertEqual(week["period_start"], date(2019, 12, 30))
        self.assertEqual(
            week["goal"].content,
            "2020년 1월 첫째주 목표",
        )

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

    def test_day_meta_only_record_is_kept(self):
        tag = BookmarkMoodTag(
            user_id=self.user_id,
            name="상쾌",
        )
        self.db.add(tag)
        self.db.commit()
        self.db.add(
            BookmarkGoal(
                user_id=self.user_id,
                period_type="day",
                period_start=date(2026, 11, 4),
                content="",
                wake_time=time(7, 5),
                mood_tag_id=tag.id,
            )
        )
        self.db.commit()

        tree = get_journal_tree(
            self.db,
            self.user_id,
            decade_start=date(2026, 1, 1),
        )

        self.assertEqual(len(tree["years"]), 1)
        quarter = tree["years"][0]["children"][0]
        month = quarter["children"][0]
        week = month["children"][0]
        day = week["children"][0]
        self.assertEqual(day["level"], "day")
        self.assertEqual(day["goal"].wake_time, time(7, 5))
        self.assertEqual(day["goal"].mood_tag_id, tag.id)

    def test_larger_ratings_average_one_level_below(self):
        self.add_record("day", date(2026, 1, 5), rating=1)
        self.add_record("day", date(2026, 1, 6), rating=3)
        self.add_record("day", date(2026, 2, 2), rating=5)

        tree = get_journal_tree(
            self.db,
            self.user_id,
            decade_start=date(2026, 1, 1),
        )

        year = tree["years"][0]
        self.assertEqual(year["average_rating"], 3.5)
        self.assertEqual(year["rating_count"], 1)
        quarter = year["children"][0]
        self.assertEqual(quarter["average_rating"], 3.5)
        months = {
            month["label"]: month for month in quarter["children"]
        }
        self.assertEqual(months["2026년 1월"]["average_rating"], 2)
        self.assertEqual(months["2026년 2월"]["average_rating"], 5)
        january_week = months["2026년 1월"]["children"][0]
        self.assertEqual(january_week["average_rating"], 2)
        self.assertEqual(january_week["rating_count"], 2)
        self.assertEqual(january_week["rating"]["rating"], 2)
        self.assertEqual(
            [day["rating"].rating for day in january_week["children"]],
            [1, 3],
        )

    def test_direct_non_day_rating_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            save_rating(
                self.db,
                BookmarkRatingUpdate(
                    period_type="week",
                    period_start=date(2026, 1, 5),
                    rating=5,
                ),
                self.user_id,
            )
        self.assertEqual(raised.exception.status_code, 400)
