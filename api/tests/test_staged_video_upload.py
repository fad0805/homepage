import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.uploads import staging_session_dir
from crud.illustrations import create_pending_illustration_group
from db.base import Base
from models.illustrations import Illustration
from models.users import User
with patch("fastapi.dependencies.utils.ensure_multipart_is_installed"):
    from routers import illustrations as illustration_router


class StagedVideoUploadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.owner = User(username="owner", hashed_password="x")
        self.db.add(self.owner)
        self.db.flush()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_session_id_must_be_uuid(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            staging_session_dir("../not-a-uuid")
        self.assertEqual(raised.exception.status_code, 400)

    def test_failed_video_retries_then_saves_private(self) -> None:
        pending = create_pending_illustration_group(
            self.db,
            user_id=self.owner.id,
            title="영상 삽화",
        )
        with tempfile.TemporaryDirectory() as temporary:
            session_dir = Path(temporary) / "session"
            file_dir = session_dir / "0000"
            file_dir.mkdir(parents=True)
            (file_dir / "000000.part").write_bytes(b"chunk")
            meta = {
                "user_id": self.owner.id,
                "purpose": "create",
                "illustration_id": pending["id"],
                "file_count": 1,
                "files": [
                    {
                        "index": 0,
                        "content_type": "video/mp4",
                        "video": True,
                        "chunk_count": 1,
                        "start": 0,
                        "seconds": 10,
                    }
                ],
            }

            with (
                patch.object(
                    illustration_router, "SessionLocal", self.Session
                ),
                patch.object(
                    illustration_router, "assemble_staged_file"
                ) as assemble,
                patch.object(
                    illustration_router,
                    "convert_video_file_to_webp_bytes",
                    side_effect=RuntimeError("broken video"),
                ) as convert,
                patch.object(illustration_router.time, "sleep"),
                patch.object(
                    illustration_router, "VIDEO_CONVERSION_ATTEMPTS", 3
                ),
            ):
                illustration_router._process_staged_upload(
                    pending["id"], self.owner.id, session_dir, meta
                )

            self.assertEqual(assemble.call_count, 1)
            self.assertEqual(convert.call_count, 3)
            self.assertFalse(session_dir.exists())

        self.db.expire_all()
        group = self.db.query(Illustration).filter_by(id=pending["id"]).one()
        self.assertFalse(group.visible)
        self.assertEqual(group.upload_status, "video_failed")
