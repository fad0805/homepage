"""Background archive job queue and on-disk status tracking."""

from __future__ import annotations

import json
import logging
import os
import queue
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from core.config import ARCHIVE_RETENTION_HOURS

logger = logging.getLogger("uvicorn.error")

ProgressCallback = Callable[[str, int, int], None]
ArchiveBuilder = Callable[[str, Path, ProgressCallback, int | None], None]


class ArchiveJobBusy(Exception):
    """Raised when another archive is already queued or running."""

    def __init__(self, job: dict[str, Any]):
        super().__init__("Archive job already running")
        self.job = job


class ArchiveJobManager:
    """A single-worker queue for slow, disk-backed archive exports."""

    def __init__(self, directory: Path, builder: ArchiveBuilder) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self._builder = builder
        self._queue: queue.Queue[str] = queue.Queue()
        self._lock = threading.RLock()
        self._worker = threading.Thread(
            target=self._run,
            name="archive-job-worker",
            daemon=True,
        )
        self._cleanup()
        self._worker.start()

    def create(
        self,
        section: str,
        label: str,
        owner: str,
        *,
        user_id: int | None = None,
        scope_label: str = "전체",
    ) -> dict[str, Any]:
        with self._lock:
            active = self._find_active()
            if active is not None:
                raise ArchiveJobBusy(self._public(active))

            job_id = uuid.uuid4().hex
            now = datetime.now(timezone.utc)
            meta = {
                "id": job_id,
                "owner": owner,
                "section": section,
                "label": label,
                "scope_user_id": user_id,
                "scope_label": scope_label,
                "status": "queued",
                "created_at": now.isoformat(),
                "started_at": None,
                "completed_at": None,
                "size": None,
                "error": None,
                "filename": (
                    f"missing-island-archive-{section}-"
                    f"{now.strftime('%Y%m%d-%H%M%S')}.zip"
                ),
                "progress": {
                    "stage": "queued",
                    "processed": 0,
                    "total": 0,
                    "percent": 0,
                },
            }
            self._save(meta)
            self._queue.put(job_id)
            return self._public(meta)

    def list(self, owner: str) -> list[dict[str, Any]]:
        with self._lock:
            jobs = [
                meta
                for meta in self._load_all()
                if meta.get("owner") == owner
            ]
        jobs.sort(key=lambda meta: meta.get("created_at") or "", reverse=True)
        return [self._public(meta) for meta in jobs[:20]]

    def get(self, job_id: str, owner: str) -> dict[str, Any] | None:
        with self._lock:
            meta = self._load(job_id)
        if meta is None or meta.get("owner") != owner:
            return None
        return self._public(meta)

    def download(self, job_id: str, owner: str) -> tuple[Path, str] | None:
        with self._lock:
            meta = self._load(job_id)
        if (
            meta is None
            or meta.get("owner") != owner
            or meta.get("status") != "completed"
        ):
            return None

        path = self._zip_path(job_id)
        if not path.is_file():
            return None
        return path, meta.get("filename") or f"{job_id}.zip"

    def _run(self) -> None:
        while True:
            try:
                job_id = self._queue.get(timeout=300)
            except queue.Empty:
                self._cleanup()
                continue

            try:
                self._process(job_id)
            except Exception:
                logger.exception("Archive job %s crashed", job_id)
            finally:
                self._queue.task_done()

    def _process(self, job_id: str) -> None:
        with self._lock:
            meta = self._load(job_id)
            if meta is None or meta.get("status") != "queued":
                return
            meta["status"] = "running"
            meta["started_at"] = _now()
            self._save(meta)

        final_path = self._zip_path(job_id)
        temp_path = self._part_path(job_id)
        last_progress = [0.0]

        def progress(stage: str, processed: int, total: int) -> None:
            now_monotonic = time.monotonic()
            if (
                processed < total
                and now_monotonic - last_progress[0] < 0.5
            ):
                return
            last_progress[0] = now_monotonic

            with self._lock:
                current = self._load(job_id)
                if current is None or current.get("status") != "running":
                    return
                percent = (
                    100
                    if total <= 0
                    else min(100, round(processed * 100 / total))
                )
                current["progress"] = {
                    "stage": stage,
                    "processed": processed,
                    "total": total,
                    "percent": percent,
                }
                self._save(current)

        try:
            self._builder(
                meta["section"],
                temp_path,
                progress,
                meta.get("scope_user_id"),
            )
            os.replace(temp_path, final_path)
            size = final_path.stat().st_size

            with self._lock:
                current = self._load(job_id)
                if current is None:
                    return
                current["status"] = "completed"
                current["completed_at"] = _now()
                current["size"] = size
                current["error"] = None
                current["progress"] = {
                    "stage": "completed",
                    "processed": 1,
                    "total": 1,
                    "percent": 100,
                }
                self._save(current)
        except Exception as exc:
            logger.exception("Archive job %s failed", job_id)
            temp_path.unlink(missing_ok=True)
            with self._lock:
                current = self._load(job_id)
                if current is None:
                    return
                current["status"] = "failed"
                current["completed_at"] = _now()
                current["error"] = f"{type(exc).__name__}: {exc}"[:500]
                current["progress"] = {
                    "stage": "failed",
                    "processed": 0,
                    "total": 0,
                    "percent": 0,
                }
                self._save(current)
        finally:
            temp_path.unlink(missing_ok=True)

    def _find_active(self) -> dict[str, Any] | None:
        for meta in self._load_all():
            if meta.get("status") in ("queued", "running"):
                return meta
        return None

    def _public(self, meta: dict[str, Any]) -> dict[str, Any]:
        job = {key: value for key, value in meta.items() if key != "owner"}
        job["download_url"] = (
            f"/api/archive/jobs/{meta['id']}/download"
            if meta.get("status") == "completed"
            else None
        )
        return job

    def _cleanup(self) -> None:
        with self._lock:
            cutoff = datetime.now(timezone.utc) - timedelta(
                hours=ARCHIVE_RETENTION_HOURS
            )

            for meta in self._load_all():
                job_id = meta.get("id")
                if not job_id:
                    continue

                status = meta.get("status")
                created = _parse_datetime(meta.get("created_at"))
                completed = _parse_datetime(meta.get("completed_at"))

                if status in ("queued", "running"):
                    meta["status"] = "failed"
                    meta["completed_at"] = _now()
                    meta["error"] = (
                        "서버가 재시작되어 작업이 중단되었습니다."
                    )
                    meta["progress"] = {
                        "stage": "failed",
                        "processed": 0,
                        "total": 0,
                        "percent": 0,
                    }
                    self._save(meta)
                    self._zip_path(job_id).unlink(missing_ok=True)
                    self._part_path(job_id).unlink(missing_ok=True)
                    continue

                expired = (
                    completed is not None and completed < cutoff
                ) or (
                    completed is None
                    and created is not None
                    and created < cutoff
                )
                if expired:
                    self._zip_path(job_id).unlink(missing_ok=True)
                    self._part_path(job_id).unlink(missing_ok=True)
                    self._meta_path(job_id).unlink(missing_ok=True)

            for part in self.directory.glob("*.part"):
                try:
                    if time.time() - part.stat().st_mtime > 3600:
                        part.unlink(missing_ok=True)
                except OSError:
                    pass

    def _load_all(self) -> list[dict[str, Any]]:
        jobs = []
        for path in self.directory.glob("*.json"):
            try:
                jobs.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                logger.warning("Ignoring unreadable archive job: %s", path)
        return jobs

    def _load(self, job_id: str) -> dict[str, Any] | None:
        path = self._meta_path(job_id)
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def _save(self, meta: dict[str, Any]) -> None:
        path = self._meta_path(meta["id"])
        temp = path.with_suffix(".json.tmp")
        temp.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp, path)

    def _meta_path(self, job_id: str) -> Path:
        return self.directory / f"{job_id}.json"

    def _zip_path(self, job_id: str) -> Path:
        return self.directory / f"{job_id}.zip"

    def _part_path(self, job_id: str) -> Path:
        return self.directory / f"{job_id}.zip.part"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed
