import asyncio
import json
import struct
import unittest
import zlib
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from src.integrations.visual_studio import (
    _clean_source,
    _render_isolated,
    _run_bounded,
    _viewport,
)


def _png(width: int, height: int) -> bytes:
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    chunk = b"IHDR" + ihdr
    return signature + struct.pack(">I", len(ihdr)) + chunk + struct.pack(">I", zlib.crc32(chunk))


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

    def test_viewport_rejects_dimensions_outside_resource_bounds(self):
        for options in (
            {"viewport_width": 319},
            {"viewport_width": 3841},
            {"viewport_height": 239},
            {"viewport_height": 2161},
            {"viewport_width": 1440.5},
        ):
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, "Visual viewport_"):
                _viewport(options)

    def test_unavailable_docker_daemon_fails_closed(self):
        async def run():
            with (
                patch("src.integrations.visual_studio.shutil.which", return_value="docker"),
                patch("src.integrations.visual_studio.SECCOMP_PROFILE", Path(__file__)),
                patch("src.integrations.visual_studio._run_bounded", new=AsyncMock(return_value=1)),
            ):
                with self.assertRaisesRegex(ValueError, "daemon is not running"):
                    await _render_isolated("function Visual() { return <div />; }")

        asyncio.run(run())

    def test_docker_preflight_timeout_fails_closed(self):
        async def run():
            with (
                patch("src.integrations.visual_studio.shutil.which", return_value="docker"),
                patch("src.integrations.visual_studio.SECCOMP_PROFILE", Path(__file__)),
                patch("src.integrations.visual_studio._run_bounded", new=AsyncMock(side_effect=TimeoutError)),
            ):
                with self.assertRaisesRegex(ValueError, "readiness timed out"):
                    await _render_isolated("function Visual() { return <div />; }")

        asyncio.run(run())

    def test_isolated_renderer_returns_all_tiles_and_capture_metadata(self):
        async def run():
            process = type("Process", (), {"returncode": 0})()

            async def communicate():
                command = subprocess.call_args.args
                work_dir = Path(command[command.index("-v") + 1].split(":/work:rw")[0])
                (work_dir / "visual-1.png").write_bytes(_png(1440, 4500))
                (work_dir / "visual-2.png").write_bytes(_png(1440, 700))
                metadata = {
                    "viewport": {"width": 1440, "height": 900},
                    "content": {"width": 1440, "height": 5200},
                    "fullPage": True,
                    "images": [
                        {"path": "/work/visual-1.png", "width": 1440, "height": 4500, "y": 0, "bytes": 33},
                        {"path": "/work/visual-2.png", "width": 1440, "height": 700, "y": 4500, "bytes": 33},
                    ],
                }
                (work_dir / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
                return b"", b""

            process.communicate = communicate
            process.kill = Mock()
            process.wait = AsyncMock(return_value=0)
            with (
                patch("src.integrations.visual_studio.shutil.which", return_value="docker"),
                patch("src.integrations.visual_studio.SECCOMP_PROFILE", Path(__file__)),
                patch("src.integrations.visual_studio._run_bounded", new=AsyncMock(return_value=0)),
                patch("src.integrations.visual_studio._remove_container", new=AsyncMock()),
                patch(
                    "src.integrations.visual_studio.asyncio.create_subprocess_exec",
                    new=AsyncMock(return_value=process),
                ) as subprocess,
            ):
                images, metadata = await _render_isolated("function Visual() { return <div />; }")
            self.assertEqual(len(images), 2)
            self.assertEqual(metadata["content"]["height"], 5200)
            self.assertEqual(metadata["images"][-1]["y"] + metadata["images"][-1]["height"], 5200)

        asyncio.run(run())

    def test_bounded_process_is_killed_and_reaped_on_timeout(self):
        async def run():
            process = type("Process", (), {})()
            process.calls = 0
            process.kill = Mock()

            async def wait():
                process.calls += 1
                if process.calls == 1:
                    await asyncio.Event().wait()
                return 0

            process.wait = wait
            with patch(
                "src.integrations.visual_studio.asyncio.create_subprocess_exec", new=AsyncMock(return_value=process)
            ):
                with self.assertRaises(TimeoutError):
                    await _run_bounded("docker", "info", timeout=0.001)
            process.kill.assert_called_once()
            self.assertEqual(process.calls, 2)

        asyncio.run(run())

    def test_bounded_process_is_killed_and_reaped_on_cancellation(self):
        async def run():
            process = type("Process", (), {})()
            process.calls = 0
            process.kill = Mock()

            async def wait():
                process.calls += 1
                if process.calls == 1:
                    await asyncio.Event().wait()
                return 0

            process.wait = wait
            with patch(
                "src.integrations.visual_studio.asyncio.create_subprocess_exec", new=AsyncMock(return_value=process)
            ):
                task = asyncio.create_task(_run_bounded("docker", "info", timeout=60))
                await asyncio.sleep(0)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
            process.kill.assert_called_once()
            self.assertEqual(process.calls, 2)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
