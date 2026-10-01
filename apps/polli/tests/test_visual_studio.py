import asyncio
import importlib.util
import io
import json
import os
import struct
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from src.integrations.visual_studio import _clean_source, _decode_response, _viewport

_WORKER_PATH = Path(__file__).parents[1] / "scripts" / "studio_worker.py"
_WORKER_SPEC = importlib.util.spec_from_file_location("studio_worker", _WORKER_PATH)
assert _WORKER_SPEC and _WORKER_SPEC.loader
studio_worker = importlib.util.module_from_spec(_WORKER_SPEC)
_WORKER_SPEC.loader.exec_module(studio_worker)


def _png() -> bytes:
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    chunk = b"IHDR" + ihdr
    return signature + struct.pack(">I", len(ihdr)) + chunk


def _archive() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("metadata.json", json.dumps({"images": [{"path": "visual-1.png"}]}))
        archive.writestr("visual-1.png", _png())
    return output.getvalue()


class VisualStudioTests(unittest.TestCase):
    def test_visual_source_rejects_browser_escape_hatches(self):
        for source in (
            "function Visual() { fetch('https://example.com'); return <div />; }",
            "export function Visual() { return <div />; }",
        ):
            with self.subTest(source=source), self.assertRaises(ValueError):
                _clean_source(source)

    def test_viewport_defaults_and_accepts_4k(self):
        self.assertEqual(_viewport({}), (1440, 900))
        self.assertEqual(_viewport({"viewport_width": 3840, "viewport_height": 2160}), (3840, 2160))

    def test_client_rejects_archive_with_unexpected_names(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("metadata.json", "{}")
            output.writestr("../escape.png", _png())
        with self.assertRaisesRegex(ValueError, "archive names"):
            _decode_response(archive.getvalue())

    def test_client_accepts_bounded_worker_archive(self):
        images, metadata = _decode_response(_archive())
        self.assertEqual(len(images), 1)
        self.assertEqual(len(metadata["images"]), 1)

    def test_client_rejects_compressed_oversized_metadata_before_reading(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            output.writestr("metadata.json", b"x" * (65 * 1024))
            output.writestr("visual-1.png", _png())
        with self.assertRaisesRegex(ValueError, "compressed output|too large"):
            _decode_response(archive.getvalue())


@unittest.skipUnless(os.name == "posix", "Unix domain sockets require a POSIX host")
class StudioWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_worker_serves_zip_over_unix_socket(self):
        async def fake_render(source: str, width: int, height: int) -> bytes:
            self.assertEqual((source, width, height), ("function Visual() { return <div />; }", 1440, 900))
            return _archive()

        with tempfile.TemporaryDirectory() as directory:
            socket_path = Path(directory) / "renderer.sock"
            with patch.object(studio_worker, "render", new=fake_render):
                server = await asyncio.start_unix_server(
                    lambda reader, writer: studio_worker.handle_client(
                        reader, writer, asyncio.Semaphore(1), asyncio.Semaphore(1)
                    ),
                    path=str(socket_path),
                )
                try:
                    reader, writer = await asyncio.open_unix_connection(str(socket_path))
                    body = json.dumps(
                        {"source": "function Visual() { return <div />; }", "width": 1440, "height": 900}
                    ).encode()
                    writer.write(
                        b"POST /render HTTP/1.1\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
                    )
                    await writer.drain()
                    response = await reader.read()
                    self.assertIn(b"HTTP/1.1 200 OK", response)
                    self.assertTrue(response.endswith(_archive()))
                finally:
                    server.close()
                    await server.wait_closed()

    async def test_worker_reaps_renderer_process_group_after_timeout(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            script = Path(directory) / "hang.py"
            script.write_text("import time\ntime.sleep(60)\n", encoding="utf-8")
            with (
                patch.object(studio_worker, "RENDER_COMMAND", (sys.executable, str(script))),
                patch.object(studio_worker, "RENDER_TIMEOUT_SECONDS", 0.01),
            ):
                with self.assertRaises(TimeoutError):
                    await studio_worker.render("function Visual() { return <div />; }", 1440, 900)

    async def test_worker_cancels_render_when_client_disconnects(self):
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def slow_render(source: str, width: int, height: int) -> bytes:
            started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelled.set()
                raise

        with tempfile.TemporaryDirectory() as directory:
            socket_path = Path(directory) / "renderer.sock"
            with patch.object(studio_worker, "render", new=slow_render):
                server = await asyncio.start_unix_server(
                    lambda reader, writer: studio_worker.handle_client(
                        reader, writer, asyncio.Semaphore(1), asyncio.Semaphore(1)
                    ),
                    path=str(socket_path),
                )
                try:
                    reader, writer = await asyncio.open_unix_connection(str(socket_path))
                    body = json.dumps(
                        {"source": "function Visual() { return <div />; }", "width": 1440, "height": 900}
                    ).encode()
                    writer.write(
                        b"POST /render HTTP/1.1\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
                    )
                    await writer.drain()
                    await started.wait()
                    writer.close()
                    await writer.wait_closed()
                    await asyncio.wait_for(cancelled.wait(), timeout=1)
                finally:
                    server.close()
                    await server.wait_closed()

    async def test_worker_rejects_body_above_limit_without_rendering(self):
        reader = asyncio.StreamReader()
        writer = Mock()
        writer.close = Mock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()
        body = b"x" * (studio_worker.MAX_BODY_BYTES + 1)
        reader.feed_data(b"POST /render HTTP/1.1\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n")
        reader.feed_eof()
        with patch.object(studio_worker, "render", new=AsyncMock()) as render:
            await studio_worker.handle_client(reader, writer, asyncio.Semaphore(1), asyncio.Semaphore(1))
        render.assert_not_awaited()
        self.assertIn(b"413 Payload Too Large", writer.write.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
