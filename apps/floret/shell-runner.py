#!/usr/bin/env python3
"""Disposable native Bash service with a bounded framed-tar protocol."""

from __future__ import annotations

import json
import os
import shutil
import signal
import stat
import struct
import subprocess
import sys
import tarfile
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from typing import BinaryIO

MAX_METADATA_BYTES = 64 * 1024
MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_ARCHIVE_BYTES = MAX_FILE_BYTES + 2 * 1024 * 1024
MAX_ENTRIES = 1024
MAX_OUTPUT_BYTES = 8 * 1024
CHUNK_BYTES = 64 * 1024
BASH_EXECUTABLE = os.environ.get("FLORET_BASH_EXECUTABLE", "/bin/bash")


class ProtocolError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


def _read_exact(source: BinaryIO, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = source.read(min(remaining, CHUNK_BYTES))
        if not chunk:
            raise ProtocolError(400, "truncated request")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def _metadata(source: BinaryIO) -> tuple[str, int]:
    size = struct.unpack(">I", _read_exact(source, 4))[0]
    if size == 0 or size > MAX_METADATA_BYTES:
        raise ProtocolError(400, "invalid metadata length")
    try:
        metadata = json.loads(_read_exact(source, size))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError(400, "invalid metadata JSON") from exc
    if not isinstance(metadata, dict) or set(metadata) != {"command", "timeout"}:
        raise ProtocolError(400, "metadata must contain only command and timeout")
    command = metadata["command"]
    timeout = metadata["timeout"]
    if not isinstance(command, str) or not command or len(command) > MAX_METADATA_BYTES:
        raise ProtocolError(400, "invalid command")
    if (
        isinstance(timeout, bool)
        or not isinstance(timeout, int)
        or not 1 <= timeout <= 600
    ):
        raise ProtocolError(400, "invalid timeout")
    return command, timeout


def _copy_archive(source: BinaryIO, destination: BinaryIO) -> None:
    total = 0
    while True:
        chunk = source.read(CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_ARCHIVE_BYTES:
            raise ProtocolError(413, "workspace archive exceeds wire limit")
        destination.write(chunk)


class LimitedReader:
    def __init__(self, source: BinaryIO, remaining: int) -> None:
        self.source = source
        self.remaining = remaining

    def read(self, size: int = -1) -> bytes:
        if self.remaining == 0:
            return b""
        wanted = self.remaining if size < 0 else min(size, self.remaining)
        chunk = self.source.read(wanted)
        if not chunk:
            raise ProtocolError(400, "truncated request")
        self.remaining -= len(chunk)
        return chunk


def _safe_name(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if not name or path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ProtocolError(400, "unsafe workspace path")
    normalized = PurePosixPath(*(part for part in path.parts if part not in {"", "."}))
    if not normalized.parts:
        raise ProtocolError(400, "unsafe workspace path")
    return normalized


def _validated_members(
    archive_path: Path,
) -> list[tuple[tarfile.TarInfo, PurePosixPath]]:
    size = archive_path.stat().st_size
    if size < 1024 or size % 512 != 0:
        raise ProtocolError(400, "invalid workspace tar")
    with archive_path.open("rb") as raw:
        raw.seek(-1024, os.SEEK_END)
        if raw.read(1024) != bytes(1024):
            raise ProtocolError(400, "invalid workspace tar")

    members: list[tuple[tarfile.TarInfo, PurePosixPath]] = []
    names: set[PurePosixPath] = set()
    regular_bytes = 0
    try:
        with tarfile.open(archive_path, mode="r:") as archive:
            for member in archive:
                if len(members) >= MAX_ENTRIES:
                    raise ProtocolError(413, "workspace has too many entries")
                path = _safe_name(member.name)
                if path in names:
                    raise ProtocolError(400, "workspace contains duplicate paths")
                names.add(path)
                if not (member.isdir() or member.isreg()):
                    raise ProtocolError(
                        400, "workspace contains unsupported entry type"
                    )
                if member.isreg():
                    regular_bytes += member.size
                    if regular_bytes > MAX_FILE_BYTES:
                        raise ProtocolError(413, "workspace file payload exceeds limit")
                members.append((member, path))
    except (tarfile.TarError, EOFError) as exc:
        raise ProtocolError(400, "invalid workspace tar") from exc
    return members


def _extract(archive_path: Path, workspace: Path) -> None:
    members = _validated_members(archive_path)
    with tarfile.open(archive_path, mode="r:") as archive:
        by_name = {member.name: (member, path) for member, path in members}
        for member in archive:
            _, path = by_name[member.name]
            destination = workspace.joinpath(*path.parts)
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                raise ProtocolError(400, "workspace file has no payload")
            with destination.open("xb") as output:
                shutil.copyfileobj(source, output, CHUNK_BYTES)
            os.chmod(destination, member.mode & 0o777)


def _process_status(pid: int) -> tuple[int, str, int] | None:
    try:
        fields = Path(f"/proc/{pid}/status").read_text().splitlines()
    except (FileNotFoundError, ProcessLookupError, PermissionError):
        return None
    uid = next((line for line in fields if line.startswith("Uid:")), "").split()
    state = next((line for line in fields if line.startswith("State:")), "").split()
    parent = next((line for line in fields if line.startswith("PPid:")), "").split()
    if len(uid) < 2 or len(state) < 2 or len(parent) < 2:
        return None
    return int(uid[1]), state[1], int(parent[1])


def _sandbox_processes(own_pid: int, own_uid: int) -> list[int]:
    processes: dict[int, tuple[str, int]] = {}
    for path in Path("/proc").iterdir():
        if not path.name.isdigit() or int(path.name) == own_pid:
            continue
        status = _process_status(int(path.name))
        if status is not None and status[0] == own_uid:
            processes[int(path.name)] = (status[1], status[2])
    if os.environ.get("FLORET_ISOLATED_CONTAINER") == "1":
        return [pid for pid, (state, _) in processes.items() if state != "Z"]
    descendants = {own_pid}
    while True:
        added = {pid for pid, (_, parent) in processes.items() if parent in descendants}
        if added <= descendants:
            break
        descendants.update(added)
    return [pid for pid in descendants - {own_pid} if processes[pid][0] != "Z"]


def _terminate_sandbox_processes() -> None:
    if not sys.platform.startswith("linux"):
        return
    own_pid = os.getpid()
    own_uid = os.getuid()
    for _ in range(10):
        live = _sandbox_processes(own_pid, own_uid)
        if not live:
            while True:
                try:
                    if os.waitpid(-1, os.WNOHANG) == (0, 0):
                        break
                except ChildProcessError:
                    break
            return
        for pid in live:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    raise ProtocolError(500, "sandbox processes did not terminate")


def _archive_workspace(workspace: Path, destination: Path) -> None:
    entries = sorted(workspace.rglob("*"), key=lambda path: path.as_posix())
    if len(entries) > MAX_ENTRIES:
        raise ProtocolError(413, "result workspace has too many entries")
    regular_bytes = 0
    with tarfile.open(destination, mode="w:") as archive:
        for entry in entries:
            relative = entry.relative_to(workspace).as_posix()
            entry_stat = entry.lstat()
            info = tarfile.TarInfo(relative)
            info.mode = stat.S_IMODE(entry_stat.st_mode)
            info.mtime = int(entry_stat.st_mtime)
            if stat.S_ISDIR(entry_stat.st_mode):
                info.type = tarfile.DIRTYPE
                archive.addfile(info)
                continue
            if not stat.S_ISREG(entry_stat.st_mode):
                raise ProtocolError(
                    422, "result workspace contains unsupported entry type"
                )
            regular_bytes += entry_stat.st_size
            if regular_bytes > MAX_FILE_BYTES:
                raise ProtocolError(413, "result workspace payload exceeds limit")
            flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
            try:
                descriptor = os.open(entry, flags)
            except OSError as exc:
                raise ProtocolError(
                    422, "result workspace changed during snapshot"
                ) from exc
            with os.fdopen(descriptor, "rb") as source:
                opened_stat = os.fstat(source.fileno())
                if (
                    not stat.S_ISREG(opened_stat.st_mode)
                    or opened_stat.st_dev != entry_stat.st_dev
                    or opened_stat.st_ino != entry_stat.st_ino
                ):
                    raise ProtocolError(422, "result workspace changed during snapshot")
                info.size = opened_stat.st_size
                archive.addfile(info, source)
    if destination.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ProtocolError(413, "result workspace archive exceeds wire limit")


def _bounded_output(value: bytes | bytearray) -> str:
    return value[:MAX_OUTPUT_BYTES].decode("utf-8", "replace")


def execute(source: BinaryIO, destination: BinaryIO) -> None:
    command, timeout = _metadata(source)
    with tempfile.TemporaryDirectory(prefix="floret-shell-") as root:
        root_path = Path(root)
        incoming = root_path / "incoming.tar"
        workspace = root_path / "workspace"
        outgoing = root_path / "outgoing.tar"
        workspace.mkdir()
        with incoming.open("wb") as archive_file:
            _copy_archive(source, archive_file)
        _extract(incoming, workspace)

        process = subprocess.Popen(
            [BASH_EXECUTABLE, "-c", command],
            cwd=workspace,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        stdout = bytearray()
        stderr = bytearray()

        def drain(stream: BinaryIO, retained: bytearray) -> None:
            with stream:
                while chunk := stream.read(CHUNK_BYTES):
                    retained.extend(chunk[: max(0, MAX_OUTPUT_BYTES - len(retained))])

        assert process.stdout is not None and process.stderr is not None
        readers = [
            threading.Thread(target=drain, args=(process.stdout, stdout), daemon=True),
            threading.Thread(target=drain, args=(process.stderr, stderr), daemon=True),
        ]
        for reader in readers:
            reader.start()
        try:
            process.wait(timeout=timeout)
            exit_code = process.returncode
        except subprocess.TimeoutExpired:
            if os.name == "posix":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.wait()
            exit_code = 124
        finally:
            if os.name == "posix":
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            _terminate_sandbox_processes()
            for reader in readers:
                reader.join(timeout=5)
            if any(reader.is_alive() for reader in readers):
                raise ProtocolError(500, "sandbox output did not close")
        _archive_workspace(workspace, outgoing)
        result = json.dumps(
            {
                "exit_code": exit_code,
                "stdout": _bounded_output(stdout),
                "stderr": _bounded_output(stderr),
            },
            separators=(",", ":"),
        ).encode()
        if len(result) > MAX_METADATA_BYTES:
            raise ProtocolError(500, "result metadata exceeds limit")
        destination.write(struct.pack(">I", len(result)))
        destination.write(result)
        with outgoing.open("rb") as archive_file:
            shutil.copyfileobj(archive_file, destination, CHUNK_BYTES)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:
        if self.path != "/run":
            self.send_error(404)
            return
        length_value = self.headers.get("Content-Length")
        if length_value is None:
            self.send_error(411)
            return
        try:
            length = int(length_value)
        except ValueError:
            self.send_error(400)
            return
        if length < 4 or length > MAX_ARCHIVE_BYTES + MAX_METADATA_BYTES + 4:
            self.send_error(413)
            return

        try:
            request_body = LimitedReader(self.rfile, length)
            with tempfile.SpooledTemporaryFile(
                max_size=2 * 1024 * 1024
            ) as response_body:
                execute(request_body, response_body)
                if request_body.remaining != 0:
                    raise ProtocolError(400, "truncated request")
                response_body.seek(0, os.SEEK_END)
                response_size = response_body.tell()
                response_body.seek(0)
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(response_size))
                self.end_headers()
                shutil.copyfileobj(response_body, self.wfile, CHUNK_BYTES)
        except ProtocolError as exc:
            self.send_error(exc.status, str(exc))

    def log_message(self, _format: str, *_args: object) -> None:
        return


def main() -> None:
    if sys.argv[1:] == ["--once"]:
        try:
            execute(sys.stdin.buffer, sys.stdout.buffer)
        except ProtocolError as exc:
            print(str(exc), file=sys.stderr)
            raise SystemExit(1) from exc
        return
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()


if __name__ == "__main__":
    main()
