import os
from datetime import date, datetime

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "homepage_test")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASS", "test")
os.environ.setdefault("ENVIRONMENT", "development")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.base import Base
from models.planner import PlannerColor, PlannerEvent, PlannerTask
from models.users import User  # noqa: F401 - registers the users table


class PlannerDatabaseTestCase:
    """SQLite-backed fixture for planner CRUD and lifecycle helpers."""

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def make_color(
        self,
        *,
        color: str = "#123456",
        name: str | None = None,
        position: int = 0,
        user_id: int = 1,
    ) -> PlannerColor:
        saved = PlannerColor(
            user_id=user_id,
            color=color,
            name=name,
            position=position,
        )
        self.db.add(saved)
        self.db.commit()
        self.db.refresh(saved)
        return saved

    def make_task(
        self,
        *,
        title: str = "테스트 일정",
        notes: str | None = None,
        color_id: int | None = None,
        schedule_type: str = "single",
        start_date: date | None = date(2026, 11, 17),
        end_date: date | None = date(2026, 11, 23),
        deadline_days: int | None = 7,
        status: str = "active",
        pinned: bool = False,
        inactive_at: datetime | None = None,
        trashed_at: datetime | None = None,
        user_id: int = 1,
    ) -> PlannerTask:
        task = PlannerTask(
            user_id=user_id,
            title=title,
            notes=notes,
            color_id=color_id,
            schedule_type=schedule_type,
            start_date=start_date,
            deadline_base_date=start_date,
            end_date=end_date,
            deadline_days=deadline_days,
            status=status,
            pinned=pinned,
            inactive_at=inactive_at,
            trashed_at=trashed_at,
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def make_event(
        self,
        *,
        title: str | None = "완료한 일정",
        notes: str | None = None,
        action: str = "completed",
        entity_type: str = "task",
        entity_id: int | None = None,
        occurred_at: datetime | None = None,
        changes: list[dict] | None = None,
        owner_user_id: int = 1,
        actor_user_id: int | None = 1,
    ) -> PlannerEvent:
        event = PlannerEvent(
            owner_user_id=owner_user_id,
            actor_user_id=actor_user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            title=title,
            notes=notes,
            changes=changes,
            occurred_at=occurred_at or datetime(2026, 11, 17, 12, 0),
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event
