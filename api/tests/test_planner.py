import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException

from schemas.planner import (
    PlannerColorReorder,
    PlannerColorUpdate,
    PlannerCompletedCreate,
    PlannerTaskCreate,
    PlannerTaskUpdate,
)
from tests.planner_test_base import PlannerDatabaseTestCase

from crud.planner.common import (  # noqa: E402 - env is prepared above
    KST,
    _clean_color,
    _range_dates,
    _single_dates,
    _validate_deadline_days,
)
from crud.planner import (  # noqa: E402
    complete_task,
    create_completed_record,
    create_task,
    delete_color,
    delete_task_permanently,
    get_colors,
    get_events,
    get_tasks,
    maintain_tasks,
    reorder_colors,
    restore_task,
    save_color,
    search_planner,
    trash_task,
    update_color,
    update_task,
)


class PlannerDateTests(unittest.TestCase):
    def test_single_dates_uses_noon_cutoff(self) -> None:
        start, base, end = _single_dates(
            date(2026, 11, 17),
            7,
            now=datetime(2026, 11, 17, 9, tzinfo=KST),
        )
        self.assertEqual((start, base, end), (
            date(2026, 11, 17),
            date(2026, 11, 17),
            date(2026, 11, 23),
        ))

        start, base, end = _single_dates(
            date(2026, 11, 17),
            7,
            now=datetime(2026, 11, 17, 12, tzinfo=KST),
        )
        self.assertEqual((start, base, end), (
            date(2026, 11, 17),
            date(2026, 11, 18),
            date(2026, 11, 24),
        ))

    def test_single_dates_future_and_past_start(self) -> None:
        now = datetime(2026, 11, 17, 9, tzinfo=KST)
        start, base, end = _single_dates(
            date(2026, 11, 20),
            3,
            now=now,
        )
        self.assertEqual((start, base, end), (
            date(2026, 11, 20),
            date(2026, 11, 20),
            date(2026, 11, 22),
        ))
        start, base, end = _single_dates(
            date(2026, 11, 10),
            3,
            now=now,
        )
        self.assertEqual((start, base, end), (
            date(2026, 11, 10),
            date(2026, 11, 17),
            date(2026, 11, 19),
        ))

    def test_range_and_deadline_validation(self) -> None:
        with patch(
            "crud.planner.common.kst_today",
            return_value=date(2026, 11, 17),
        ):
            self.assertEqual(
                _range_dates(
                    date(2026, 11, 17),
                    date(2026, 11, 19),
                ),
                (date(2026, 11, 17), date(2026, 11, 19)),
            )
            with self.assertRaises(HTTPException):
                _range_dates(
                    date(2026, 11, 17),
                    date(2026, 11, 16),
                )
            with self.assertRaises(HTTPException):
                _range_dates(
                    date(2026, 11, 16),
                    date(2026, 11, 18),
                )

        self.assertEqual(_validate_deadline_days(None), 7)
        self.assertEqual(_validate_deadline_days(30), 30)
        for value in (0, 366):
            with self.assertRaises(HTTPException):
                _validate_deadline_days(value)

    def test_color_normalization(self) -> None:
        self.assertEqual(_clean_color("#AABBCC"), "#aabbcc")
        self.assertIsNone(_clean_color("  "))
        with self.assertRaises(HTTPException):
            _clean_color("red")


class PlannerCrudTests(
    PlannerDatabaseTestCase,
    unittest.TestCase,
):
    def test_color_crud_and_reorder(self) -> None:
        first = save_color(self.db, "#123456", 1, "첫 색")
        second = save_color(self.db, "#654321", 1, "둘째 색")
        self.assertEqual(get_colors(self.db, 1)["colors"][0]["id"], first["id"])

        ordered = reorder_colors(
            self.db,
            PlannerColorReorder(ids=[second["id"], first["id"]]),
            1,
        )
        self.assertEqual(
            [item["id"] for item in ordered["colors"]],
            [second["id"], first["id"]],
        )
        updated = update_color(
            self.db,
            first["id"],
            PlannerColorUpdate(name="수정 색"),
            1,
        )
        self.assertEqual(updated["name"], "수정 색")

        self.assertTrue(delete_color(self.db, second["id"], 1)["success"])
        self.assertEqual(len(get_colors(self.db, 1)["colors"]), 1)

    def test_create_single_range_and_undated_tasks(self) -> None:
        now = datetime(2026, 11, 17, 9, tzinfo=KST)
        with patch(
            "crud.planner.common.kst_today",
            return_value=now.date(),
        ), patch(
            "crud.planner.common.kst_now",
            return_value=now,
        ), patch(
            "crud.planner.tasks.kst_today",
            return_value=now.date(),
        ), patch(
            "crud.planner.tasks.kst_now",
            return_value=now,
        ):
            single = create_task(
                self.db,
                PlannerTaskCreate(
                    title="단일 일정",
                    schedule_type="single",
                    start_date=date(2026, 11, 17),
                    deadline_days=3,
                ),
                1,
            )
            self.assertEqual(single["status"], "active")
            self.assertEqual(single["start_date"], date(2026, 11, 17))
            self.assertEqual(single["end_date"], date(2026, 11, 19))

            ranged = create_task(
                self.db,
                PlannerTaskCreate(
                    title="범위 일정",
                    schedule_type="range",
                    start_date=date(2026, 11, 17),
                    end_date=date(2026, 11, 20),
                ),
                1,
            )
            self.assertEqual(ranged["schedule_type"], "range")
            self.assertEqual(ranged["end_date"], date(2026, 11, 20))

            inactive = create_task(
                self.db,
                PlannerTaskCreate(
                    title="비활성 추가",
                    schedule_type="single",
                    start_date=date(2026, 11, 17),
                    deadline_days=3,
                    inactive=True,
                ),
                1,
            )
            self.assertEqual(inactive["status"], "inactive")
            self.assertIsNotNone(inactive["inactive_at"])
            self.assertEqual(inactive["start_date"], date(2026, 11, 17))

            undated = create_task(
                self.db,
                PlannerTaskCreate(
                    title="날짜 없음",
                    schedule_type="undated",
                ),
                1,
            )
            self.assertEqual(undated["status"], "inactive")
            self.assertIsNone(undated["start_date"])

            with self.assertRaises(HTTPException):
                create_task(
                    self.db,
                    PlannerTaskCreate(
                        title="잘못된 범위",
                        schedule_type="range",
                        start_date=date(2026, 11, 20),
                        end_date=date(2026, 11, 19),
                    ),
                    1,
                )

    def test_update_undated_task_to_single_activates_it(self) -> None:
        task = self.make_task(
            schedule_type="undated",
            start_date=None,
            end_date=None,
            deadline_days=None,
            status="inactive",
        )
        with patch(
            "crud.planner.common.kst_today",
            return_value=date(2026, 11, 17),
        ), patch(
            "crud.planner.common.kst_now",
            return_value=datetime(2026, 11, 17, 9, tzinfo=KST),
        ), patch(
            "crud.planner.tasks.kst_today",
            return_value=date(2026, 11, 17),
        ), patch(
            "crud.planner.tasks.kst_now",
            return_value=datetime(2026, 11, 17, 9, tzinfo=KST),
        ):
            updated = update_task(
                self.db,
                task.id,
                PlannerTaskUpdate(
                    schedule_type="single",
                    start_date=date(2026, 11, 17),
                    deadline_days=2,
                ),
                1,
            )
        self.assertEqual(updated["status"], "active")
        self.assertEqual(updated["end_date"], date(2026, 11, 18))

    def test_complete_task_writes_history_and_removes_task(self) -> None:
        color = self.make_color(color="#b07a52")
        task = self.make_task(
            title="완료할 일정",
            notes="메모",
            color_id=color.id,
        )
        with patch(
            "crud.planner.tasks._utc_naive_now",
            return_value=datetime(2026, 11, 17, 12, 0),
        ):
            complete_task(self.db, task.id, 1)
        self.assertIsNone(
            self.db.query(type(task)).filter(type(task).id == task.id).first()
        )
        events = get_events(
            self.db,
            1,
            start_date=date(2026, 11, 17),
            end_date=date(2026, 11, 17),
        )["events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["action"], "completed")
        self.assertEqual(events[0]["title"], "완료할 일정")
        self.assertEqual(events[0]["notes"], "메모")
        self.assertEqual(events[0]["color_id"], color.id)

    def test_trash_restore_and_permanent_delete(self) -> None:
        task = self.make_task(
            start_date=date(2026, 11, 10),
            end_date=date(2026, 11, 16),
        )
        with patch(
            "crud.planner.common.kst_today",
            return_value=date(2026, 11, 17),
        ), patch(
            "crud.planner.common.kst_now",
            return_value=datetime(2026, 11, 17, 9, tzinfo=KST),
        ), patch(
            "crud.planner.tasks.kst_today",
            return_value=date(2026, 11, 17),
        ), patch(
            "crud.planner.tasks.kst_now",
            return_value=datetime(2026, 11, 17, 9, tzinfo=KST),
        ):
            trashed = trash_task(self.db, task.id, 1)
            self.assertEqual(trashed["status"], "trashed")
            restored = restore_task(self.db, task.id, 1)
            self.assertEqual(restored["status"], "active")
            self.assertEqual(restored["start_date"], date(2026, 11, 17))
            self.assertEqual(restored["end_date"], date(2026, 11, 23))

            with self.assertRaises(HTTPException):
                delete_task_permanently(self.db, task.id, 1)
            trash_task(self.db, task.id, 1)
            self.assertTrue(
                delete_task_permanently(self.db, task.id, 1)["success"]
            )

    def test_maintain_tasks_lifecycle(self) -> None:
        now = datetime(2026, 11, 17, 0, 0)
        active = self.make_task(
            title="지난 활성",
            end_date=date(2026, 11, 16),
            status="active",
        )
        inactive = self.make_task(
            title="오래된 비활성",
            end_date=date(2026, 10, 1),
            status="inactive",
            inactive_at=now,
        )
        trashed = self.make_task(
            title="오래된 휴지통",
            status="trashed",
            trashed_at=datetime(2026, 10, 1, 0, 0),
        )
        trashed_id = trashed.id
        undated = self.make_task(
            title="날짜 없음",
            schedule_type="undated",
            start_date=None,
            end_date=None,
            status="active",
        )
        with patch(
            "crud.planner.tasks.kst_today",
            return_value=date(2026, 11, 17),
        ), patch(
            "crud.planner.tasks._utc_naive_now",
            return_value=now,
        ):
            maintain_tasks(self.db, 1)
        self.db.refresh(active)
        self.assertEqual(active.status, "inactive")
        self.assertEqual(self.db.get(type(inactive), inactive.id), inactive)
        self.assertEqual(inactive.status, "trashed")
        self.assertIsNone(self.db.get(type(trashed), trashed_id))
        self.db.refresh(undated)
        self.assertEqual(undated.status, "inactive")

    def test_events_range_and_validation(self) -> None:
        start = date(2026, 11, 17)
        event = self.make_event(
            occurred_at=datetime(2026, 11, 17, 12, 0),
            title="오늘 이력",
        )
        self.make_event(
            occurred_at=datetime(2026, 11, 18, 12, 0),
            title="내일 이력",
        )
        events = get_events(
            self.db,
            1,
            start_date=start,
            end_date=start,
        )["events"]
        self.assertEqual([item["id"] for item in events], [event.id])
        with self.assertRaises(HTTPException):
            get_events(
                self.db,
                1,
                start_date=date(2026, 11, 18),
                end_date=date(2026, 11, 17),
            )
        with self.assertRaises(HTTPException):
            get_events(
                self.db,
                1,
                start_date=date(2025, 1, 1),
                end_date=date(2026, 1, 3),
            )

    def test_search_and_completed_record(self) -> None:
        self.make_task(
            title="회의 준비",
            notes="자료 정리",
            start_date=date(2026, 11, 17),
            end_date=date(2026, 11, 17),
        )
        self.make_event(
            title="회의 기록",
            occurred_at=datetime(2026, 11, 17, 12, 0),
        )
        with patch(
            "crud.planner.tasks.kst_today",
            return_value=date(2026, 11, 17),
        ):
            result = search_planner(
                self.db,
                1,
                start_date=date(2026, 11, 17),
                end_date=date(2026, 11, 17),
                query="회의",
            )
        self.assertTrue(result["tasks"])
        self.assertTrue(result["events"])

        with patch(
            "crud.planner.events.kst_today",
            return_value=date(2026, 11, 17),
        ):
            completed = create_completed_record(
                self.db,
                PlannerCompletedCreate(
                    title="지난 완료",
                    notes="과거 기록",
                    completed_on=date(2026, 11, 16),
                ),
                1,
            )
            self.assertEqual(completed["action"], "completed")
            with self.assertRaises(HTTPException):
                create_completed_record(
                    self.db,
                    PlannerCompletedCreate(
                        title="오늘 완료",
                        completed_on=date(2026, 11, 17),
                    ),
                    1,
                )


if __name__ == "__main__":
    unittest.main()
