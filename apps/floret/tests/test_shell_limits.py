"""Native Bash semantics and bounded command-output capture."""

from __future__ import annotations

import asyncio
import io
import json
import os
import struct
import tarfile
from types import SimpleNamespace

import httpx
import pytest

from floret.tools import shell


class _BodyStream(httpx.AsyncByteStream):
    def __init__(self, body):
        self.body = body

    async def __aiter__(self):
        yield self.body


def _stream_response(status, body):
    return httpx.Response(status, stream=_BodyStream(body))


def _remote_settings(monkeypatch, tmp_path):
    monkeypatch.setattr(
        shell,
        "settings",
        SimpleNamespace(
            temp_dir=str(tmp_path),
            shell_endpoint="http://floret-shell.internal/run",
        ),
    )


async def test_output_reader_drains_without_retaining_entire_stream():
    stream = asyncio.StreamReader()
    stream.feed_data(b"x" * 200_000)
    stream.feed_eof()
    output = await shell._drain(stream)
    assert len(output) < 8200
    assert "discarded" in output
    assert stream.at_eof()


@pytest.mark.skipif(os.name != "posix", reason="deployed Linux Bash behavior")
async def test_native_bash_arrays(monkeypatch, tmp_path):
    monkeypatch.setattr(shell.settings, "temp_dir", str(tmp_path))
    output = await shell.bash('values=(first second); printf "%s" "${values[1]}"')
    assert "exit_code: 0" in output
    assert "second" in output


@pytest.mark.skipif(os.name != "posix", reason="deployed Linux process groups")
async def test_timeout_reaps_descendant_after_shell_exits(monkeypatch, tmp_path):
    monkeypatch.setattr(shell.settings, "temp_dir", str(tmp_path))
    output = await asyncio.wait_for(shell.bash("sleep 30 & exit 0", timeout=1), 5)
    assert "timed out" in output


def _response_body(result, files=None):
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as tar:
        for name, data in (files or {}).items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    header = json.dumps(result, separators=(",", ":")).encode()
    return struct.pack(">I", len(header)) + header + archive.getvalue()


async def test_remote_shell_streams_workspace_and_atomically_applies_response(
    monkeypatch, tmp_path
):
    _remote_settings(monkeypatch, tmp_path)
    # A minimum tar occupies 10 KiB; framing must not count against its cap.
    monkeypatch.setattr(shell, "_MAX_WIRE_BYTES", 10 * 1024)
    monkeypatch.setattr(shell, "resolve_api_key", lambda: "ag_test")
    workdir = tmp_path / "workspace"
    workdir.mkdir()
    (workdir / "before.txt").write_text("before")
    seen = {}

    async def handler(request):
        body = await request.aread()
        size = struct.unpack(">I", body[:4])[0]
        seen["metadata"] = json.loads(body[4 : 4 + size])
        seen["auth"] = request.headers["authorization"]
        seen["content_length"] = request.headers["content-length"]
        with tarfile.open(fileobj=io.BytesIO(body[4 + size :]), mode="r:") as archive:
            seen["input"] = archive.extractfile("before.txt").read()
        return _stream_response(
            200,
            _response_body(
                {"exit_code": 0, "stdout": "ok", "stderr": ""},
                {"after.txt": b"after"},
            ),
        )

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        shell.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )

    output = await shell.bash("touch after.txt", timeout=9)

    assert output == "exit_code: 0\nstdout:\nok"
    assert seen["metadata"] == {"command": "touch after.txt", "timeout": 9}
    assert seen["auth"] == "Bearer ag_test"
    assert int(seen["content_length"]) > 4
    assert seen["input"] == b"before"
    assert not (workdir / "before.txt").exists()
    assert (workdir / "after.txt").read_bytes() == b"after"


async def test_remote_shell_rejects_truncated_archive_without_replacing_workspace(
    monkeypatch, tmp_path
):
    _remote_settings(monkeypatch, tmp_path)
    workdir = tmp_path / "workspace"
    workdir.mkdir()
    (workdir / "safe.txt").write_text("safe")
    body = _response_body(
        {"exit_code": 0, "stdout": "", "stderr": ""}, {"bad.txt": b"bad"}
    )

    header_size = 4 + struct.unpack(">I", body[:4])[0]
    transport = httpx.MockTransport(
        lambda request: _stream_response(200, body[: header_size + 514])
    )
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        shell.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )

    with pytest.raises(RuntimeError, match="incomplete"):
        await shell.bash("true")
    assert (workdir / "safe.txt").read_text() == "safe"
    assert not (workdir / "bad.txt").exists()


@pytest.mark.parametrize("name", ["../escape", r"..\\escape", "C:/escape"])
async def test_remote_shell_rejects_unsafe_archive_member(monkeypatch, tmp_path, name):
    _remote_settings(monkeypatch, tmp_path)
    workdir = tmp_path / "workspace"
    workdir.mkdir()
    (workdir / "safe.txt").write_text("safe")
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as tar:
        info = tarfile.TarInfo(name)
        info.size = 1
        tar.addfile(info, io.BytesIO(b"x"))
    header = json.dumps({"exit_code": 0, "stdout": "", "stderr": ""}).encode()
    body = struct.pack(">I", len(header)) + header + archive.getvalue()
    transport = httpx.MockTransport(lambda request: _stream_response(200, body))
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        shell.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )

    with pytest.raises(RuntimeError, match="unsafe"):
        await shell.bash("true")
    assert (workdir / "safe.txt").read_text() == "safe"
    assert not (tmp_path / "escape").exists()


async def test_remote_shell_non_200_is_bounded_and_does_not_fallback(
    monkeypatch, tmp_path
):
    _remote_settings(monkeypatch, tmp_path)
    transport = httpx.MockTransport(
        lambda request: httpx.Response(503, content=b"x" * 100_000)
    )
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        shell.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=transport, **kwargs),
    )

    with pytest.raises(RuntimeError, match="HTTP 503") as error:
        await shell.bash("this-command-must-not-run-locally")
    assert len(str(error.value)) < 8200
