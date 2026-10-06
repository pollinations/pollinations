"""Networkless Unix-socket worker for Polli visual studio rendering."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import signal
import tempfile
import zipfile
from pathlib import Path

LOGGER = logging.getLogger(__name__)
SOCKET_PATH = Path(os.environ.get("POLLI_STUDIO_SOCKET", "/run/polli-studio/renderer.sock"))
MAX_BODY_BYTES = 256 * 1024
MAX_SOURCE_CHARS = 20_000
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_IMAGES = 10
MAX_OUTPUT_BYTES = MAX_IMAGE_BYTES * MAX_IMAGES + 64 * 1024
RENDER_TIMEOUT_SECONDS = 30
MAX_CONCURRENT_RENDERS = 2
MAX_CONNECTIONS = 8
REQUEST_TIMEOUT_SECONDS = 10
RESPONSE_DRAIN_TIMEOUT_SECONDS = 10
RENDER_COMMAND = ("node", "/app/scripts/render_visual_studio.mjs")


class RequestError(ValueError):
    """An HTTP request that can be safely reported to the caller."""


def _error(status: int, message: str) -> tuple[int, bytes, str]:
    return status, json.dumps({"error": message}).encode(), "application/json"


def _validate_request(body: bytes) -> tuple[str, int, int]:
    try:
        request = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RequestError("Request body must be JSON.") from exc
    if not isinstance(request, dict):
        raise RequestError("Request body must be an object.")
    source, width, height = request.get("source"), request.get("width"), request.get("height")
    if not isinstance(source, str) or not source or len(source) > MAX_SOURCE_CHARS:
        raise RequestError("Visual source is invalid or too large.")
    if isinstance(width, bool) or not isinstance(width, int) or not 320 <= width <= 3840:
        raise RequestError("Viewport width is invalid.")
    if isinstance(height, bool) or not isinstance(height, int) or not 240 <= height <= 2160:
        raise RequestError("Viewport height is invalid.")
    return source, width, height


async def _terminate_process(process: asyncio.subprocess.Process) -> None:
    """Kill the request-owned session even when its Node leader has exited."""
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    await process.wait()


async def render(source: str, width: int, height: int) -> bytes:
    """Run the fixed renderer and return validated PNGs plus metadata as a ZIP."""
    with tempfile.TemporaryDirectory(prefix="polli-visual-", dir="/tmp") as temporary_directory:
        work_dir = Path(temporary_directory)
        source_path = work_dir / "visual.jsx"
        metadata_path = work_dir / "metadata.json"
        source_path.write_text(source, encoding="utf-8")
        process = await asyncio.create_subprocess_exec(
            *RENDER_COMMAND,
            str(source_path),
            str(work_dir / "visual"),
            str(metadata_path),
            str(width),
            str(height),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp", "PLAYWRIGHT_BROWSERS_PATH": "/ms-playwright"},
            start_new_session=True,
        )
        try:
            await asyncio.wait_for(process.wait(), timeout=RENDER_TIMEOUT_SECONDS)
            if process.returncode != 0:
                raise RequestError("Visual renderer rejected the page.")
        finally:
            await _terminate_process(process)
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RequestError("Visual renderer returned invalid metadata.") from exc
        images = metadata.get("images") if isinstance(metadata, dict) else None
        if not isinstance(images, list) or not 1 <= len(images) <= MAX_IMAGES:
            raise RequestError("Visual renderer returned invalid image metadata.")
        archive_path = work_dir / "render.zip"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("metadata.json", json.dumps(metadata, separators=(",", ":")))
            for index in range(1, len(images) + 1):
                image_path = work_dir / f"visual-{index}.png"
                if not image_path.is_file() or image_path.stat().st_size > MAX_IMAGE_BYTES:
                    raise RequestError("Visual renderer returned an invalid image.")
                image = image_path.read_bytes()
                if not image.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise RequestError("Visual renderer returned an invalid image.")
                archive.writestr(f"visual-{index}.png", image)
        if archive_path.stat().st_size > MAX_OUTPUT_BYTES:
            raise RequestError("Visual renderer output is too large.")
        return archive_path.read_bytes()


async def _read_request(reader: asyncio.StreamReader) -> tuple[str, bytes]:
    try:
        header = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=REQUEST_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        raise RequestError("Request timed out.") from exc
    if len(header) > 8 * 1024:
        raise RequestError("Request headers are too large.")
    lines = header.decode("ascii").split("\r\n")
    if not lines or lines[0] not in {"POST /render HTTP/1.1", "GET /health HTTP/1.1"}:
        raise RequestError("Only POST /render and GET /health are supported.")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if line:
            name, separator, value = line.partition(":")
            if not separator:
                raise RequestError("Invalid request headers.")
            headers[name.lower()] = value.strip()
    if lines[0] == "GET /health HTTP/1.1":
        return "health", b""
    try:
        length = int(headers.get("content-length", ""))
    except ValueError as exc:
        raise RequestError("Content-Length is required.") from exc
    if not 0 <= length <= MAX_BODY_BYTES:
        raise RequestError("Request body is too large.")
    try:
        return "render", await asyncio.wait_for(reader.readexactly(length), timeout=REQUEST_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        raise RequestError("Request timed out.") from exc


async def _write_response(writer: asyncio.StreamWriter, status: int, body: bytes, content_type: str) -> None:
    reason = {
        200: "OK",
        400: "Bad Request",
        413: "Payload Too Large",
        429: "Too Many Requests",
        500: "Internal Server Error",
        504: "Gateway Timeout",
    }[status]
    writer.write(
        f"HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode()
        + body
    )
    try:
        await asyncio.wait_for(writer.drain(), timeout=RESPONSE_DRAIN_TIMEOUT_SECONDS)
    finally:
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), timeout=RESPONSE_DRAIN_TIMEOUT_SECONDS)
        except (ConnectionError, TimeoutError):
            pass


async def _wait_for_disconnect(reader: asyncio.StreamReader) -> None:
    await reader.read()


async def handle_client(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    slots: asyncio.Semaphore,
    connections: asyncio.Semaphore,
) -> None:
    if connections.locked():
        await _write_response(writer, *_error(429, "Visual studio is busy; try again shortly."))
        return
    async with connections:
        try:
            request_type, body = await _read_request(reader)
            if request_type == "health":
                await _write_response(writer, 200, b'{"status":"ok"}', "application/json")
                return
            source, width, height = _validate_request(body)
            if slots.locked():
                response = _error(429, "Visual studio is busy; try again shortly.")
            else:
                async with slots:
                    render_task = asyncio.create_task(render(source, width, height))
                    disconnect_task = asyncio.create_task(_wait_for_disconnect(reader))
                    try:
                        done, _ = await asyncio.wait(
                            {render_task, disconnect_task}, return_when=asyncio.FIRST_COMPLETED
                        )
                        if disconnect_task in done:
                            render_task.cancel()
                            with contextlib.suppress(asyncio.CancelledError):
                                await render_task
                            writer.close()
                            with contextlib.suppress(ConnectionError, TimeoutError):
                                await asyncio.wait_for(writer.wait_closed(), timeout=RESPONSE_DRAIN_TIMEOUT_SECONDS)
                            return
                        response = (200, render_task.result(), "application/zip")
                    finally:
                        disconnect_task.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await disconnect_task
        except RequestError as exc:
            status = 413 if "too large" in str(exc) else 400
            response = _error(status, str(exc))
        except asyncio.LimitOverrunError:
            response = _error(413, "Request headers are too large.")
        except asyncio.IncompleteReadError:
            response = _error(400, "Incomplete request body.")
        except TimeoutError:
            response = _error(504, "Visual renderer exceeded its time limit.")
        except Exception:
            LOGGER.exception("Visual studio worker failed")
            response = _error(500, "Visual studio worker failed.")
        await _write_response(writer, *response)


async def serve(socket_path: Path = SOCKET_PATH) -> None:
    """Serve local render requests and cancel active work on graceful shutdown."""
    socket_path.parent.mkdir(parents=True, exist_ok=True)
    if socket_path.exists():
        socket_path.unlink()
    slots = asyncio.Semaphore(MAX_CONCURRENT_RENDERS)
    connections = asyncio.Semaphore(MAX_CONNECTIONS)
    stopping = asyncio.Event()
    active: set[asyncio.Task[None]] = set()

    async def tracked_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        if task is None:
            return
        active.add(task)
        try:
            await handle_client(reader, writer, slots, connections)
        finally:
            active.discard(task)

    server = await asyncio.start_unix_server(tracked_client, path=str(socket_path))
    socket_path.chmod(0o660)
    loop = asyncio.get_running_loop()
    for signal_number in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signal_number, stopping.set)
    async with server:
        await stopping.wait()
    for task in active:
        task.cancel()
    await asyncio.gather(*active, return_exceptions=True)


if __name__ == "__main__":
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    asyncio.run(serve())
