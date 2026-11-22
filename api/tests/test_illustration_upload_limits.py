import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from core.uploads import (
    MAX_BULK_REQUEST_BYTES,
    MAX_VIDEOS_PER_ILLUSTRATION,
    validate_upload_batch,
)


class IllustrationUploadLimitTests(unittest.TestCase):
    @staticmethod
    def _files(count: int, content_type: str = "image/png"):
        return [
            SimpleNamespace(content_type=content_type) for _ in range(count)
        ]

    def test_single_file_request_is_allowed(self) -> None:
        validate_upload_batch(self._files(1), None)
        validate_upload_batch(
            self._files(1, "video/mp4"),
            str(MAX_BULK_REQUEST_BYTES - 1),
        )

    def test_more_than_one_file_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            validate_upload_batch(self._files(2), None)
        self.assertEqual(raised.exception.status_code, 400)

    def test_oversized_request_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            validate_upload_batch(
                self._files(1), str(MAX_BULK_REQUEST_BYTES + 1)
            )
        self.assertEqual(raised.exception.status_code, 413)

    def test_video_cap_is_five_per_illustration(self) -> None:
        self.assertEqual(MAX_VIDEOS_PER_ILLUSTRATION, 5)
