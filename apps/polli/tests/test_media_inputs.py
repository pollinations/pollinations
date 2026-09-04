import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.ai.client import PollinationsClient
from src.bot import decode_base64_images, extract_media_urls


class FakeMessage:
    attachments = []

    def __init__(self, embeds):
        self.embeds = embeds


class MediaExtractionTests(unittest.TestCase):
    def test_gifv_embed_uses_static_thumbnail_for_vision(self):
        embed = SimpleNamespace(
            url="https://klipy.com/gifs/idiots-no-intelligent-life-vEn",
            type="gifv",
            image=None,
            thumbnail=SimpleNamespace(url="https://static.klipy.com/preview.webp"),
            video=SimpleNamespace(url="https://static.klipy.com/animation.mp4"),
        )

        images, videos, files = extract_media_urls(FakeMessage([embed]))  # type: ignore[arg-type]

        self.assertEqual(images, ["https://static.klipy.com/preview.webp"])
        self.assertEqual(videos, [])
        self.assertEqual(files, [])


class ImageDecodeTests(unittest.TestCase):
    def test_rejects_non_png_data_under_png_mime(self):
        blocks = [{"type": "image_url", "image_url": {"url": "data:image/png;base64,bm90LXBuZw=="}}]

        self.assertEqual(decode_base64_images(blocks), [])

    def test_rejects_png_over_attachment_limit(self):
        oversized = b"\x89PNG\r\n\x1a\n" + b"x" * 101
        import base64

        encoded = base64.b64encode(oversized).decode()
        blocks = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}}]

        self.assertEqual(decode_base64_images(blocks, max_bytes=100), [])


class ClientMediaTests(unittest.IsolatedAsyncioTestCase):
    async def test_video_urls_are_text_not_image_inputs(self):
        client = PollinationsClient()
        capture = AsyncMock(
            return_value={
                "response": "ok",
                "tool_calls": [],
                "tool_results": [],
                "content_blocks": [],
                "usage": {},
            }
        )

        with patch.object(client, "_call_with_tools", capture):
            await client.process_with_tools(
                user_message="what is happening here?",
                discord_username="tester",
                video_urls=["https://static.klipy.com/animation.mp4"],
            )

        messages = capture.await_args.args[0]
        current = messages[-1]["content"]
        self.assertIsInstance(current, str)
        self.assertIn("https://static.klipy.com/animation.mp4", current)
        self.assertIn("video", current.lower())


if __name__ == "__main__":
    unittest.main()
