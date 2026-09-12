"""Run Bash locally for development or through the per-call shell service."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import os
import shutil
import stat
import struct
import sys
import tarfile
import tempfile
import uuid
from collections.abc import AsyncIterator
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO

import httpx

from floret.config import resolve_api_key, settings

if sys.platform != "win32":
    from os import killpg
    from signal import SIGKILL

logger = logging.getLogger(__name__)

_MAX_OUTPUT = 8000
_DEFAULT_TIMEOUT = 60
_MAX_JSON_BYTES = 64 * 1024
_MAX_WORKSPACE_BYTES = 100 * 1024 * 1024
_MAX_WORKSPACE_FILES = 1024
_MAX_WIRE_BYTES = _MAX_WORKSPACE_BYTES + 2 * 1024 * 1024
_CHUNK_BYTES = 64 * 1024
_SHELL_ENDPOINT = "http://floret-shell.internal/run"
_workspace_override: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "workspace_override", default=None
)


def create_workspace() -> tuple[str, contextvars.Token[str | None]]:
    root = os.path.join(settings.temp_dir, "workspaces")
    os.makedirs(root, exist_ok=True)
    path = tempfile.mkdtemp(prefix="run-", dir=root)
    return path, _workspace_override.set(path)


def cleanup_workspace(path: str, token: contextvars.Token[str | None]) -> None:
    del token
    _workspace_override.set(None)
    shutil.rmtree(path, ignore_errors=True)


def _workdir() -> str:
    path = _workspace_override.get() or os.path.join(settings.temp_dir, "workspace")
    os.makedirs(path, exist_ok=True)
    return path


def _truncate(text: str) -> str:
    if len(text) <= _MAX_OUTPUT:
        return text
    return text[:_MAX_OUTPUT] + f"\n... [truncated {len(text) - _MAX_OUTPUT} chars]"


async def _terminate(proc: asyncio.subprocess.Process) -> None:
    try:
        if sys.platform != "win32":
            killpg(proc.pid, SIGKILL)
        elif proc.returncode is None:
            proc.kill()
    except ProcessLookupError:
        pass
    await asyncio.gather(proc.wait(), _drain(proc.stdout), _drain(proc.stderr))


async def _drain(stream: asyncio.StreamReader | None) -> str:
    if stream is None:
        return ""
    retained = bytearray()
    discarded = 0
    while chunk := await stream.read(_CHUNK_BYTES):
        take = min(len(chunk), _MAX_OUTPUT * 4 - len(retained))
        retained.extend(chunk[:take])
        discarded += len(chunk) - take
    text = _truncate(retained.decode("utf-8", "replace"))
    if discarded:
        text += f"\n... [{discarded} additional bytes discarded]"
    return text


async def _collect(proc: asyncio.subprocess.Process) -> tuple[str, str]:
    out, err = await asyncio.gather(_drain(proc.stdout), _drain(proc.stderr))
    await proc.wait()
    return out, err


async def _local_bash(command: str, timeout: int) -> str:
    if sys.platform != "win32":
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=_workdir(),
            start_new_session=True,
            executable="/bin/bash",
        )
    else:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=_workdir(),
        )
    try:
        stdout, stderr = await asyncio.wait_for(_collect(proc), timeout=timeout)
    except asyncio.TimeoutError:
        await _terminate(proc)
        return f"ERROR: command timed out after {timeout}s"
    except asyncio.CancelledError:
        await asyncio.shield(_terminate(proc))
        raise
    return _format_result(proc.returncode or 0, stdout, stderr)


def _format_result(exit_code: int, stdout: str, stderr: str) -> str:
    parts = [f"exit_code: {exit_code}"]
    if stdout:
        parts.append(f"stdout:\n{_truncate(stdout)}")
    if stderr:
        parts.append(f"stderr:\n{_truncate(stderr)}")
    return "\n".join(parts)


def _build_workspace_tar(workdir: str) -> str:
    fd, archive_path = tempfile.mkstemp(prefix="floret-shell-request-", suffix=".tar")
    os.close(fd)
    count = 0
    total = 0
    try:
        with tarfile.open(archive_path, "w") as archive:
            for root, dirs, files in os.walk(workdir, followlinks=False):
                dirs.sort()
                files.sort()
                for name in [*dirs, *files]:
                    full = os.path.join(root, name)
                    info = os.lstat(full)
                    if (
                        stat.S_ISLNK(info.st_mode)
                        or (stat.S_ISREG(info.st_mode) and info.st_nlink != 1)
                        or not (
                            stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)
                        )
                    ):
                        raise ValueError("workspace contains an unsupported file type")
                    count += 1
                    if count > _MAX_WORKSPACE_FILES:
                        raise ValueError("workspace contains too many files")
                    if stat.S_ISREG(info.st_mode):
                        total += info.st_size
                        if total > _MAX_WORKSPACE_BYTES:
                            raise ValueError("workspace exceeds shell transfer limit")
                    relative = os.path.relpath(full, workdir).replace(os.sep, "/")
                    archive.add(full, arcname=relative, recursive=False)
        if os.path.getsize(archive_path) > _MAX_WIRE_BYTES:
            raise ValueError("workspace archive exceeds shell transfer limit")
        return archive_path
    except BaseException:
        os.unlink(archive_path)
        raise


async def _request_body(header: bytes, archive_path: str) -> AsyncIterator[bytes]:
    yield struct.pack(">I", len(header))
    yield header
    with open(archive_path, "rb") as archive:
        while chunk := archive.read(_CHUNK_BYTES):
            yield chunk


async def _save_response(response: httpx.Response) -> str:
    fd, response_path = tempfile.mkstemp(prefix="floret-shell-response-")
    os.close(fd)
    size = 0
    try:
        with open(response_path, "wb") as output:
            async for chunk in response.aiter_bytes(_CHUNK_BYTES):
                size += len(chunk)
                if size > _MAX_WIRE_BYTES + _MAX_JSON_BYTES + 4:
                    raise RuntimeError("shell response exceeds transfer limit")
                output.write(chunk)
        return response_path
    except BaseException:
        os.unlink(response_path)
        raise


def _read_response_header(response_file: BinaryIO) -> dict[str, Any]:
    prefix = response_file.read(4)
    if len(prefix) != 4:
        raise RuntimeError("shell response has an incomplete header")
    length = struct.unpack(">I", prefix)[0]
    if length > _MAX_JSON_BYTES:
        raise RuntimeError("shell response header exceeds limit")
    encoded = response_file.read(length)
    if len(encoded) != length:
        raise RuntimeError("shell response has an incomplete header")
    try:
        payload = json.loads(encoded)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("shell response header is invalid") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("shell response header is invalid")
    return payload


def _safe_member_path(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    first = path.parts[0] if path.parts else ""
    if (
        path.is_absolute()
        or "\\" in name
        or (len(first) >= 2 and first[1] == ":")
        or not path.parts
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise RuntimeError("shell response contains an unsafe workspace path")
    return path


def _extract_workspace(archive_path: str, workdir: str) -> None:
    archive_size = os.path.getsize(archive_path)
    if archive_size < 1024 or archive_size % 512:
        raise RuntimeError("shell response workspace archive is incomplete")
    with open(archive_path, "rb") as raw:
        raw.seek(-1024, os.SEEK_END)
        if raw.read(1024) != b"\0" * 1024:
            raise RuntimeError("shell response workspace archive is incomplete")

    parent = os.path.dirname(workdir)
    stage = tempfile.mkdtemp(prefix="shell-stage-", dir=parent)
    backup = f"{workdir}.old-{uuid.uuid4().hex}"
    count = 0
    total = 0
    seen: set[PurePosixPath] = set()
    try:
        with tarfile.open(archive_path, "r:") as archive:
            for member in archive:
                path = _safe_member_path(member.name)
                if (
                    path in seen
                    or member.issym()
                    or member.islnk()
                    or not (member.isdir() or member.isfile())
                ):
                    raise RuntimeError("shell response workspace archive is unsafe")
                seen.add(path)
                count += 1
                if count > _MAX_WORKSPACE_FILES:
                    raise RuntimeError("shell response workspace has too many files")
                target = Path(stage).joinpath(*path.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                total += member.size
                if total > _MAX_WORKSPACE_BYTES:
                    raise RuntimeError(
                        "shell response workspace exceeds transfer limit"
                    )
                target.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    raise RuntimeError("shell response workspace archive is invalid")
                with target.open("xb") as output:
                    remaining = member.size
                    while remaining:
                        chunk = source.read(min(_CHUNK_BYTES, remaining))
                        if not chunk:
                            raise RuntimeError(
                                "shell response workspace archive is incomplete"
                            )
                        output.write(chunk)
                        remaining -= len(chunk)
                    if source.read(1):
                        raise RuntimeError(
                            "shell response workspace archive is invalid"
                        )

        os.replace(workdir, backup)
        try:
            os.replace(stage, workdir)
        except BaseException:
            os.replace(backup, workdir)
            raise
        shutil.rmtree(backup)
    finally:
        shutil.rmtree(stage, ignore_errors=True)
        shutil.rmtree(backup, ignore_errors=True)


async def _remote_bash(command: str, timeout: int, endpoint: str) -> str:
    header = json.dumps(
        {"command": command, "timeout": timeout}, separators=(",", ":")
    ).encode()
    if len(header) > _MAX_JSON_BYTES:
        raise ValueError("shell request header exceeds limit")
    archive_path = _build_workspace_tar(_workdir())
    wire_size = 4 + len(header) + os.path.getsize(archive_path)
    if wire_size > _MAX_WIRE_BYTES + _MAX_JSON_BYTES + 4:
        os.unlink(archive_path)
        raise ValueError("shell request exceeds transfer limit")
    response_path: str | None = None
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=None) as client:
            async with client.stream(
                "POST",
                endpoint,
                headers={
                    "Authorization": f"Bearer {resolve_api_key()}",
                    "Content-Length": str(wire_size),
                    "Content-Type": "application/octet-stream",
                },
                content=_request_body(header, archive_path),
            ) as response:
                if response.status_code != 200:
                    diagnostic = bytearray()
                    async for chunk in response.aiter_bytes(_CHUNK_BYTES):
                        diagnostic.extend(chunk[: _MAX_OUTPUT - len(diagnostic)])
                        if len(diagnostic) >= _MAX_OUTPUT:
                            break
                    detail = diagnostic.decode("utf-8", "replace")
                    raise RuntimeError(
                        f"shell service returned HTTP {response.status_code}: {_truncate(detail)}"
                    )
                response_path = await _save_response(response)

        with open(response_path, "rb") as response_file:
            result = _read_response_header(response_file)
            tar_offset = response_file.tell()
        exit_code = result.get("exit_code")
        stdout = result.get("stdout")
        stderr = result.get("stderr")
        if (
            not isinstance(exit_code, int)
            or not isinstance(stdout, str)
            or not isinstance(stderr, str)
        ):
            raise RuntimeError("shell response result is invalid")
        fd, tar_path = tempfile.mkstemp(prefix="floret-shell-workspace-", suffix=".tar")
        os.close(fd)
        try:
            with open(response_path, "rb") as source, open(tar_path, "wb") as target:
                source.seek(tar_offset)
                shutil.copyfileobj(source, target, _CHUNK_BYTES)
            _extract_workspace(tar_path, _workdir())
        finally:
            os.unlink(tar_path)
        return _format_result(exit_code, stdout, stderr)
    finally:
        os.unlink(archive_path)
        if response_path is not None:
            os.unlink(response_path)


async def bash(command: str, timeout: int = _DEFAULT_TIMEOUT) -> str:
    """Run one Bash command, preserving only explicit workspace files between calls."""
    timeout = max(1, min(int(timeout), 600))
    endpoint = getattr(settings, "shell_endpoint", "")
    if endpoint:
        if endpoint != _SHELL_ENDPOINT:
            raise RuntimeError("shell service endpoint is invalid")
        return await _remote_bash(command, timeout, endpoint)
    return await _local_bash(command, timeout)
