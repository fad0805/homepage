import os

os.environ.setdefault("ENVIRONMENT", "development")

import json
import unittest
from io import BytesIO
from unittest.mock import patch
from zipfile import ZipFile

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.scrivener import parse_scrivener_zip
from db.base import Base
from models.manuscript import ManuscriptNode, ManuscriptProject
from models.users import User
from routers import archive


class ArchiveManuscriptTests(unittest.TestCase):
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
        self.other = User(username="other", hashed_password="x")
        self.db.add_all([self.owner, self.other])
        self.db.flush()

        self.project = ManuscriptProject(
            user_id=self.owner.id,
            title="내 원고",
        )
        other_project = ManuscriptProject(
            user_id=self.other.id,
            title="남의 원고",
        )
        self.db.add_all([self.project, other_project])
        self.db.flush()

        self.db.add(
            ManuscriptNode(
                project_id=self.project.id,
                user_id=self.owner.id,
                node_type="chapter",
                title="1장",
                body="<p>본문</p>",
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _prepared(self, section: str) -> archive._PreparedArchive:
        return archive._build_export(self.db, section, self.owner.id)

    def test_manuscript_section_builds_scrivener_files(self) -> None:
        prepared = self._prepared("manuscript")
        self.assertEqual(prepared.counts["manuscripts"], 1)
        self.assertEqual(len(prepared.manuscript_files), 1)

        item = prepared.manuscript_files[0]
        self.assertTrue(item["path"].startswith("manuscript/"))
        self.assertTrue(item["path"].endswith(".scriv"))
        self.assertFalse(item["path"].endswith(".scriv.zip"))

        source_title, parsed = parse_scrivener_zip(item["data"])
        self.assertEqual(source_title, "내 원고")
        self.assertEqual([node.title for node in parsed], ["1장"])

    def test_all_section_includes_manuscript(self) -> None:
        prepared = self._prepared("all")
        self.assertIn("manuscripts", archive._included_keys("all"))
        self.assertEqual(len(prepared.manuscript_files), 1)

    def test_other_user_projects_are_excluded(self) -> None:
        prepared = self._prepared("manuscript")
        titles = [
            item["project"]["title"] for item in prepared.manuscript_files
        ]
        self.assertEqual(titles, ["내 원고"])

    def test_archive_writes_manuscript_and_manifest(self) -> None:
        prepared = self._prepared("manuscript")
        item = prepared.manuscript_files[0]
        buffer = BytesIO()

        with patch.object(archive, "ARCHIVE_THROTTLE_SECONDS", 0):
            with ZipFile(buffer, "w") as target:
                archive._write_archive(
                    target,
                    prepared,
                    self.db,
                    lambda *_args: None,
                    self.owner.id,
                )

        with ZipFile(buffer) as target:
            manifest = json.loads(target.read("manifest.json"))
            descriptor = next(
                entry
                for entry in manifest["files"]
                if entry["kind"] == "manuscript"
            )
            self.assertIn(descriptor["manifest"], target.namelist())
            self.assertTrue(
                target.read(descriptor["manifest"]).startswith(
                    b"<?xml"
                )
            )
            self.assertFalse(
                any(name.endswith(".scriv.zip") for name in target.namelist())
            )

        self.assertEqual(manifest["layout"]["manuscript"], "manuscript/")
        self.assertEqual(manifest["counts"]["manuscripts"], 1)
        self.assertEqual(manifest["manuscripts"][0]["title"], "내 원고")
        self.assertEqual(descriptor["path"], item["path"])
        self.assertGreater(descriptor["file_count"], 0)


if __name__ == "__main__":
    unittest.main()
