import shutil
import subprocess
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from PIL import Image

from core import uploads


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg is not installed")
class VideoWebpTests(unittest.TestCase):
    def _clip(self, directory: str, seconds: int) -> bytes:
        target = Path(directory) / "clip.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=160x90:rate=24",
                "-t",
                str(seconds),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(target),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return target.read_bytes()

    def test_short_clip_becomes_animated_webp(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            content = self._clip(tmp, 2)
            converted = uploads._video_to_animated_webp(content, ".mp4")

        with Image.open(BytesIO(converted)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertGreater(image.n_frames, 1)

    def test_long_clip_is_truncated(self) -> None:
        original = uploads.MAX_VIDEO_SECONDS
        uploads.MAX_VIDEO_SECONDS = 1
        try:
            with tempfile.TemporaryDirectory() as tmp:
                content = self._clip(tmp, 3)
                converted = uploads._video_to_animated_webp(content, ".mp4")
        finally:
            uploads.MAX_VIDEO_SECONDS = original

        with Image.open(BytesIO(converted)) as image:
            self.assertLessEqual(image.n_frames, uploads.VIDEO_FPS + 1)


if __name__ == "__main__":
    unittest.main()
