from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.base import Base
from models.bookmark import BookmarkRoutine, BookmarkRoutineCheck
from models.users import User  # noqa: F401 - registers the users table


class BookmarkDatabaseTestCase:
    """Small SQLite-backed fixture for bookmark CRUD helpers."""

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

    def make_routine(self, **overrides) -> BookmarkRoutine:
        values = {
            "user_id": 1,
            "title": "테스트 루틴",
            "frequency": "daily",
            "tracking_mode": "date",
            "target_count": 1,
            "start_date": date(2025, 1, 1),
            "end_date": None,
            "position": 0,
            "calendar_only": False,
            "active": True,
        }
        values.update(overrides)
        routine = BookmarkRoutine(**values)
        self.db.add(routine)
        self.db.commit()
        self.db.refresh(routine)
        return routine

    def add_check(
        self,
        routine: BookmarkRoutine,
        period_type: str,
        period_start: date,
        *,
        count: int = 1,
    ) -> BookmarkRoutineCheck:
        check = BookmarkRoutineCheck(
            user_id=routine.user_id,
            routine_id=routine.id,
            period_type=period_type,
            period_start=period_start,
            done=count > 0,
            count=count,
        )
        self.db.add(check)
        self.db.commit()
        self.db.refresh(check)
        return check
