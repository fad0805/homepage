import asyncio
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

os.environ.setdefault("SECRET_KEY", "test")

from PIL import Image
from starlette.datastructures import Headers, UploadFile

from core import uploads


class FaviconUploadTests(unittest.TestCase):
    def test_favicon_variants_have_expected_sizes(self) -> None:
        source = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
        buffer = io.BytesIO()
        source.save(buffer, format="PNG")
        buffer.seek(0)
        upload = UploadFile(
            filename="favicon.png",
            file=buffer,
            headers=Headers({"content-type": "image/png"}),
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            with (
                mock.patch.object(uploads, "UPLOAD_DIR", Path(temp_dir)),
                mock.patch.object(
                    uploads,
                    "_s3_is_configured",
                    return_value=False,
                ),
            ):
                keys = asyncio.run(
                    uploads.save_favicon_variants(upload, folder="index")
                )

                sizes = []
                for key in keys:
                    path = Path(temp_dir) / key.split("/", 1)[1]
                    with Image.open(path) as image:
                        sizes.append(image.size)

        self.assertEqual(
            sorted(sizes),
            [(192, 192), (512, 512), (512, 512)],
        )


if __name__ == "__main__":
    unittest.main()
