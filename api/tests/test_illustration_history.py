# ruff: noqa: DTZ001
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "homepage_test")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASS", "test")
os.environ.setdefault("ENVIRONMENT", "development")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core import audit
from crud.illustrations import (
    create_pending_illustration_group,
    delete_illustration,
    finish_illustration_upload,
    update_illustration,
)
from db.base import Base
from models.illustrations import Illustration
from models.planner import PlannerEvent
from models.users import User
from schemas.illustrations import IllustrationUpdate


class IllustrationHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.audit_patch = patch.object(
            audit, "SessionLocal", side_effect=lambda: self.Session()
        )
        self.audit_patch.start()
        self.owner = User(username="owner", hashed_password="x")
        self.db.add(self.owner)
        self.db.commit()

    def tearDown(self) -> None:
        self.audit_patch.stop()
        self.db.close()
        self.engine.dispose()

    def _events(self):
        return (
            self.db.query(PlannerEvent)
            .filter(PlannerEvent.entity_type == "illustration")
            .all()
        )

    def _pending(self, *, visible: bool = True):
        return create_pending_illustration_group(
            self.db,
            user_id=self.owner.id,
            title="삽화",
            visible=visible,
        )

    def test_failed_pending_upload_leaves_no_history(self) -> None:
        pending = self._pending()
        self.assertEqual(self._events(), [])

        group = self.db.get(Illustration, pending["id"])
        self.db.delete(group)
        self.db.commit()

        self.assertEqual(self._events(), [])

    def test_explicit_private_save_writes_history(self) -> None:
        pending = self._pending(visible=False)
        finish_illustration_upload(
            self.db, pending["id"], ["/uploads/illustrations/private.png"]
        )

        events = self._events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].action, "created")

    def test_video_failure_privatization_leaves_no_history(self) -> None:
        pending = self._pending()
        group = self.db.get(Illustration, pending["id"])
        group.upload_status = "video_failed"
        group.visible = False
        group.protected = False
        self.db.commit()
        self.assertEqual(self._events(), [])

        self.db.delete(group)
        self.db.commit()
        self.assertEqual(self._events(), [])

    def test_public_publishing_writes_one_creation_event(self) -> None:
        pending = self._pending()
        finish_illustration_upload(
            self.db, pending["id"], ["/uploads/illustrations/public.png"]
        )

        events = self._events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].action, "created")
        self.assertEqual(events[0].entity_id, pending["id"])

    def test_visibility_edit_adds_history(self) -> None:
        pending = self._pending(visible=False)
        finish_illustration_upload(
            self.db, pending["id"], ["/uploads/illustrations/private.png"]
        )

        update_illustration(
            self.db,
            pending["id"],
            IllustrationUpdate(visible=True),
        )

        actions = sorted(event.action for event in self._events())
        self.assertEqual(actions, ["created", "updated"])

    def test_deleting_published_illustration_keeps_history(self) -> None:
        pending = self._pending()
        finish_illustration_upload(
            self.db, pending["id"], ["/uploads/illustrations/public.png"]
        )
        delete_illustration(self.db, pending["id"])

        actions = sorted(event.action for event in self._events())
        self.assertEqual(actions, ["created", "deleted"])


if __name__ == "__main__":
    unittest.main()
