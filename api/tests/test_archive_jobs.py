import os
import tempfile
import time
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("ENVIRONMENT", "development")

from core.archive_jobs import (
    ArchiveJobBusy,
    ArchiveJobManager,
    ArchiveJobThrottled,
)


class ArchiveJobManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.manager = ArchiveJobManager(
            Path(self.tempdir.name),
            self._build,
        )

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    @staticmethod
    def _build(section, output_path, progress, user_id) -> None:
        output_path.write_bytes(b"test archive")

    def _meta(
        self,
        *,
        owner: str,
        status: str,
        completed_at: datetime | None = None,
        scope_user_id: int | None = None,
        scope_label: str = "전체",
        section: str = "all",
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "id": uuid.uuid4().hex,
            "owner": owner,
            "section": section,
            "label": "전체" if section == "all" else section,
            "scope_user_id": scope_user_id,
            "scope_label": scope_label,
            "status": status,
            "created_at": now.isoformat(),
            "started_at": (
                now.isoformat()
                if status in ("running", "completed")
                else None
            ),
            "completed_at": (
                completed_at.isoformat() if completed_at else None
            ),
            "size": 10 if status == "completed" else None,
            "error": None,
            "filename": "archive.zip",
            "progress": {
                "stage": status,
                "processed": 0,
                "total": 0,
                "percent": 0,
            },
        }

    def test_create_rejects_an_active_job(self) -> None:
        active = self._meta(owner="admin", status="running")
        self.manager._save(active)

        with self.assertRaises(ArchiveJobBusy) as raised:
            self.manager.create("all", "전체", "admin")

        self.assertEqual(raised.exception.job["id"], active["id"])

    def test_create_rejects_an_active_job_from_another_owner(self) -> None:
        active = self._meta(owner="member", status="running")
        self.manager._save(active)

        with self.assertRaises(ArchiveJobBusy) as raised:
            self.manager.create("all", "전체", "admin")

        self.assertEqual(raised.exception.job["id"], active["id"])

    def test_create_rejects_a_file_completed_within_24_hours(self) -> None:
        completed = self._meta(
            owner="admin",
            status="completed",
            completed_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        self.manager._save(completed)

        with self.assertRaises(ArchiveJobThrottled) as raised:
            self.manager.create("all", "전체", "admin")

        self.assertEqual(raised.exception.job["id"], completed["id"])
        self.assertGreater(raised.exception.retry_after, 0)
        self.assertLessEqual(raised.exception.retry_after, 24 * 60 * 60)

    def test_create_allows_a_file_older_than_24_hours(self) -> None:
        completed = self._meta(
            owner="admin",
            status="completed",
            completed_at=datetime.now(timezone.utc) - timedelta(hours=25),
        )
        self.manager._save(completed)

        job = self.manager.create("profile", "프로필", "admin")
        self.assertEqual(job["status"], "queued")
        self._wait_for_completion(job["id"], "admin")

    def test_create_throttles_per_owner(self) -> None:
        completed = self._meta(
            owner="admin",
            status="completed",
            completed_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        self.manager._save(completed)

        job = self.manager.create("profile", "프로필", "member")
        self.assertEqual(job["status"], "queued")
        self._wait_for_completion(job["id"], "member")

    def test_recent_partial_blocks_only_the_same_section(self) -> None:
        partial = self._meta(
            owner="admin",
            status="completed",
            completed_at=datetime.now(timezone.utc) - timedelta(hours=1),
            section="profile",
        )
        self.manager._save(partial)

        with self.assertRaises(ArchiveJobThrottled) as raised:
            self.manager.create("profile", "프로필", "admin")
        self.assertEqual(raised.exception.job["id"], partial["id"])

        other = self.manager.create("memos", "주석", "admin")
        self._wait_for_completion(other["id"], "admin")
        full = self.manager.create("all", "전체", "admin")
        self._wait_for_completion(full["id"], "admin")

    def test_recent_full_blocks_every_section(self) -> None:
        full = self._meta(
            owner="admin",
            status="completed",
            completed_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        self.manager._save(full)

        for section in ("all", "profile"):
            with self.subTest(section=section):
                with self.assertRaises(ArchiveJobThrottled) as raised:
                    self.manager.create(section, section, "admin")
                self.assertEqual(raised.exception.job["id"], full["id"])

    def test_scope_filter_hides_other_users_jobs(self) -> None:
        other = self._meta(
            owner="admin",
            status="completed",
            scope_user_id=2,
            scope_label="other",
        )
        self.manager._save(other)

        self.assertEqual(self.manager.list("admin", user_id=1), [])
        self.assertIsNone(self.manager.get(other["id"], "admin", user_id=1))
        self.assertIsNone(
            self.manager.download(other["id"], "admin", user_id=1)
        )
        self.assertIsNotNone(self.manager.get(other["id"], "admin"))

    def test_cooldown_ignores_jobs_for_other_users(self) -> None:
        other = self._meta(
            owner="admin",
            status="completed",
            completed_at=datetime.now(timezone.utc) - timedelta(hours=1),
            scope_user_id=2,
            scope_label="other",
        )
        self.manager._save(other)

        job = self.manager.create(
            "profile",
            "프로필",
            "admin",
            user_id=1,
            scope_label="admin",
        )
        self.assertEqual(job["status"], "queued")
        self._wait_for_completion(job["id"], "admin")

    def _wait_for_completion(self, job_id: str, owner: str) -> None:
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            job = self.manager.get(job_id, owner)
            if job is not None and job["status"] in (
                "completed",
                "failed",
            ):
                self.assertEqual(job["status"], "completed")
                return
            time.sleep(0.01)
        self.fail("archive job did not finish in time")


if __name__ == "__main__":
    unittest.main()
