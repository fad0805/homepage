import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

import core.mastodon as mastodon
from PIL import Image
from core.mastodon import MastodonError


def _image_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (2, 2), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def _animated_webp_bytes(count: int = 3) -> bytes:
    colors = [(220, 60, 60), (60, 200, 80), (70, 90, 230)]
    frames = [Image.new("RGB", (24, 24), colors[i % len(colors)]) for i in range(count)]
    buffer = BytesIO()
    frames[0].save(
        buffer,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=80,
        loop=0,
    )
    return buffer.getvalue()


class _FakeResponse:
    status_code = 200

    def __init__(self, payload=None):
        self.payload = payload or {"id": "media-1"}

    def json(self):
        return self.payload


class MastodonMediaTests(unittest.TestCase):
    def test_post_status_attaches_mastodon_media_id(self) -> None:
        settings = SimpleNamespace(provider="mastodon")
        with (
            patch.object(
                mastodon,
                "_upload_mastodon_media",
                return_value="media-1",
            ) as upload,
            patch.object(
                mastodon,
                "_post_mastodon_status",
                return_value="status-1",
            ) as post,
        ):
            result = mastodon.post_status(
                settings,
                "본문",
                image_url="/uploads/cover.jpg",
                image_description="삽화 제목",
            )

        self.assertEqual(result, "status-1")
        upload.assert_called_once_with(
            settings, "/uploads/cover.jpg", "삽화 제목"
        )
        post.assert_called_once_with(settings, "본문", ["media-1"])

    def test_post_status_attaches_misskey_file_id(self) -> None:
        settings = SimpleNamespace(provider="misskey")
        with (
            patch.object(
                mastodon,
                "_upload_misskey_media",
                return_value="file-1",
            ) as upload,
            patch.object(
                mastodon,
                "_post_misskey_status",
                return_value="note-1",
            ) as post,
        ):
            result = mastodon.post_status(
                settings, "본문", image_url="/uploads/cover.jpg"
            )

        self.assertEqual(result, "note-1")
        upload.assert_called_once()
        post.assert_called_once_with(settings, "본문", ["file-1"])

    def test_post_status_stays_text_only_without_image(self) -> None:
        settings = SimpleNamespace(provider="mastodon")
        with (
            patch.object(mastodon, "_upload_mastodon_media") as upload,
            patch.object(
                mastodon,
                "_post_mastodon_status",
                return_value="status-1",
            ) as post,
        ):
            mastodon.post_status(settings, "본문")

        upload.assert_not_called()
        post.assert_called_once_with(settings, "본문", None)

    def test_post_status_stays_text_only_when_upload_fails(self) -> None:
        settings = SimpleNamespace(provider="mastodon")
        with (
            patch.object(
                mastodon, "_upload_mastodon_media", return_value=None
            ) as upload,
            patch.object(
                mastodon,
                "_post_mastodon_status",
                return_value="status-1",
            ) as post,
        ):
            mastodon.post_status(settings, "본문", image_url="/uploads/a.jpg")

        upload.assert_called_once()
        post.assert_called_once_with(settings, "본문", None)

    def test_mastodon_upload_sends_multipart_file(self) -> None:
        settings = SimpleNamespace(
            instance_url="https://mastodon.social",
            access_token="token",
        )
        with (
            patch.object(mastodon, "open_uploaded_file") as opened,
            patch.object(
                mastodon, "_request", return_value=_FakeResponse()
            ) as request,
        ):
            opened.return_value.__enter__.return_value = (
                BytesIO(_image_bytes()),
                "image/jpeg",
                3,
            )
            media_id = mastodon._upload_mastodon_media(
                settings, "/uploads/cover.jpg", "표지"
            )

        self.assertEqual(media_id, "media-1")
        self.assertEqual(request.call_args.args[2], "/api/v2/media")
        file_field = request.call_args.kwargs["files"]["file"]
        self.assertEqual(file_field[0], "cover.jpg")
        self.assertTrue(file_field[1].startswith(b"\xff\xd8"))
        self.assertEqual(file_field[2], "image/jpeg")
        self.assertEqual(request.call_args.kwargs["data"]["description"], "표지")

    def test_mastodon_upload_failure_does_not_raise(self) -> None:
        settings = SimpleNamespace(
            instance_url="https://mastodon.social",
            access_token="token",
        )
        with (
            patch.object(mastodon, "open_uploaded_file") as opened,
            patch.object(
                mastodon,
                "_request",
                side_effect=MastodonError("업로드 실패"),
            ),
        ):
            opened.return_value.__enter__.return_value = (
                BytesIO(_image_bytes()),
                "image/jpeg",
                3,
            )
            media_id = mastodon._upload_mastodon_media(
                settings, "/uploads/cover.jpg"
            )

        self.assertIsNone(media_id)

    def test_probe_media_upload_reports_missing_scope(self) -> None:
        settings = SimpleNamespace(provider="mastodon")
        response = SimpleNamespace(
            status_code=403,
            json=lambda: {
                "error": "This action is outside the authorized scopes",
            },
        )
        with patch.object(mastodon, "_request", return_value=response):
            with self.assertRaises(MastodonError) as caught:
                mastodon.probe_media_upload(settings)

        message = str(caught.exception)
        self.assertIn("write:media", message)
        self.assertIn("다시 발급", message)

    def test_probe_media_upload_deletes_probe_file(self) -> None:
        settings = SimpleNamespace(provider="mastodon")
        with patch.object(
            mastodon,
            "_request",
            side_effect=[
                _FakeResponse(),
                SimpleNamespace(status_code=200, json=lambda: {}),
            ],
        ) as request:
            mastodon.probe_media_upload(settings)

        self.assertEqual(request.call_count, 2)
        self.assertEqual(request.call_args_list[0].args[2], "/api/v2/media")
        self.assertEqual(request.call_args_list[1].args[1], "DELETE")
        self.assertEqual(
            request.call_args_list[1].args[2],
            "/api/v2/media/media-1",
        )

    def test_social_image_is_downscaled_and_reencoded(self) -> None:
        source = Image.new("RGB", (3000, 2000), (120, 80, 200))
        buffer = BytesIO()
        source.save(buffer, format="PNG")

        payload, content_type = mastodon._prepare_social_image(
            buffer.getvalue(), "image/png"
        )

        self.assertEqual(content_type, "image/jpeg")
        self.assertLessEqual(len(payload), mastodon.SOCIAL_IMAGE_MAX_BYTES)
        with Image.open(BytesIO(payload)) as result:
            self.assertLessEqual(
                max(result.size), mastodon.SOCIAL_IMAGE_MAX_DIMENSION
            )

    def test_animated_webp_is_converted_to_gif_for_mastodon(self) -> None:
        settings = SimpleNamespace(
            instance_url="https://mastodon.social",
            access_token="token",
        )
        webp = _animated_webp_bytes()
        with (
            patch.object(mastodon, "open_uploaded_file") as opened,
            patch.object(
                mastodon, "_request", return_value=_FakeResponse()
            ) as request,
        ):
            opened.return_value.__enter__.return_value = (
                BytesIO(webp),
                "image/webp",
                len(webp),
            )
            media_id = mastodon._upload_mastodon_media(
                settings, "/uploads/motion.webp", "움직이는 삽화"
            )

        self.assertEqual(media_id, "media-1")
        file_field = request.call_args.kwargs["files"]["file"]
        self.assertEqual(file_field[0], "motion.gif")
        self.assertEqual(file_field[2], "image/gif")
        with Image.open(BytesIO(file_field[1])) as gif:
            self.assertGreaterEqual(gif.n_frames, 2)
            self.assertEqual(gif.format, "GIF")
            self.assertEqual(gif.info.get("loop"), 0)
            self.assertEqual(gif.info.get("duration"), 80)

    def test_misskey_keeps_animated_webp(self) -> None:
        settings = SimpleNamespace(
            instance_url="https://misskey.example",
            access_token="token",
        )
        webp = _animated_webp_bytes()
        with (
            patch.object(
                mastodon,
                "_read_media_file",
                return_value=("motion.webp", webp, "image/webp"),
            ),
            patch.object(
                mastodon,
                "_upload_misskey_media_bytes",
                return_value="file-1",
            ) as upload,
        ):
            result = mastodon._upload_misskey_media(
                settings, "/uploads/motion.webp"
            )

        self.assertEqual(result, "file-1")
        args = upload.call_args.args
        self.assertEqual(args[1], "motion.webp")
        self.assertEqual(args[2], webp)
        self.assertEqual(args[3], "image/webp")

    def test_static_webp_is_not_converted_to_gif(self) -> None:
        buffer = BytesIO()
        Image.new("RGB", (24, 24), "white").save(buffer, format="WEBP")
        self.assertIsNone(mastodon._animated_webp_to_gif(buffer.getvalue()))

    def test_representative_url_prefers_dedicated_image(self) -> None:
        image = SimpleNamespace(id=7, url="/uploads/7.jpg")
        illustration = SimpleNamespace(
            representative_url=None,
            representative_image_id=7,
            images=[image],
        )
        self.assertEqual(
            mastodon._illustration_representative_url(illustration),
            "/uploads/7.jpg",
        )

        illustration.representative_url = "/uploads/custom.jpg"
        self.assertEqual(
            mastodon._illustration_representative_url(illustration),
            "/uploads/custom.jpg",
        )

        illustration.representative_url = None
        illustration.representative_image_id = None
        self.assertEqual(
            mastodon._illustration_representative_url(illustration),
            "/uploads/7.jpg",
        )


if __name__ == "__main__":
    unittest.main()
