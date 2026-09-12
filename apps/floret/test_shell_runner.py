from __future__ import annotations

import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

RUNNER = Path(__file__).with_name("shell-runner.py")


def archive(entries: dict[str, bytes], entry_type: bytes | None = None) -> bytes:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:") as tar:
        for name, data in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            if entry_type is not None:
                info.type = entry_type
            tar.addfile(info, io.BytesIO(data))
    return output.getvalue()


def request(command: str, workspace: bytes, timeout: int = 10) -> bytes:
    metadata = json.dumps({"command": command, "timeout": timeout}).encode()
    return struct.pack(">I", len(metadata)) + metadata + workspace


def run(payload: bytes) -> subprocess.CompletedProcess[bytes]:
    bash = shutil.which("bash")
    if os.name == "nt":
        git = shutil.which("git")
        if git:
            candidate = Path(git).resolve().parent.parent / "bin" / "bash.exe"
            if candidate.is_file():
                bash = str(candidate)
    assert bash is not None
    return subprocess.run(
        [sys.executable, str(RUNNER), "--once"],
        input=payload,
        capture_output=True,
        check=False,
        env={**os.environ, "FLORET_BASH_EXECUTABLE": bash},
    )


def response(payload: bytes) -> tuple[dict[str, object], tarfile.TarFile]:
    size = struct.unpack(">I", payload[:4])[0]
    result = json.loads(payload[4 : 4 + size])
    tar = tarfile.open(  # noqa: SIM115 - caller needs random member access
        fileobj=io.BytesIO(payload[4 + size :]), mode="r:"
    )
    return result, tar


def test_executes_native_bash_and_returns_workspace() -> None:
    completed = run(
        request(
            "cat input.txt; printf changed > output.txt",
            archive({"input.txt": b"hello"}),
        )
    )
    assert completed.returncode == 0, completed.stderr
    result, workspace = response(completed.stdout)
    assert result == {"exit_code": 0, "stdout": "hello", "stderr": ""}
    assert workspace.extractfile("input.txt").read() == b"hello"
    assert workspace.extractfile("output.txt").read() == b"changed"


def test_large_output_is_bounded_without_blocking() -> None:
    completed = run(
        request(
            "python -c \"import sys; sys.stdout.write('x'*1000000); sys.stderr.write('y'*1000000)\"",
            archive({}),
        )
    )
    assert completed.returncode == 0
    result, _ = response(completed.stdout)
    assert len(result["stdout"]) == 8 * 1024
    assert len(result["stderr"]) == 8 * 1024


def test_nonzero_exit_still_returns_workspace() -> None:
    completed = run(request("printf err >&2; touch kept; exit 7", archive({})))
    assert completed.returncode == 0
    result, workspace = response(completed.stdout)
    assert result == {"exit_code": 7, "stdout": "", "stderr": "err"}
    assert workspace.getmember("kept").isfile()


def test_timeout_kills_process_group_and_returns_124() -> None:
    completed = run(request("sleep 5", archive({}), timeout=1))
    assert completed.returncode == 0
    result, _ = response(completed.stdout)
    assert result["exit_code"] == 124


@pytest.mark.skipif(os.name != "posix", reason="process-group semantics are Linux-only")
def test_background_process_is_killed_before_workspace_snapshot_linux() -> None:
    completed = run(
        request(
            "(sleep 2; printf late > raced.txt) & printf early > done.txt", archive({})
        )
    )
    assert completed.returncode == 0
    result, workspace = response(completed.stdout)
    assert result["exit_code"] == 0
    assert workspace.getmember("done.txt").isfile()
    with pytest.raises(KeyError):
        workspace.getmember("raced.txt")


@pytest.mark.parametrize(
    "workspace",
    [
        archive({"../escape": b"bad"}),
        archive({"link": b"target"}, tarfile.SYMTYPE),
        archive({"hard": b"target"}, tarfile.LNKTYPE),
    ],
    ids=["parent", "symlink", "hardlink"],
)
def test_rejects_unsafe_archive_entries(workspace: bytes) -> None:
    completed = run(request("true", workspace))
    assert completed.returncode == 1
    assert b"workspace" in completed.stderr


def test_rejects_truncated_tar() -> None:
    completed = run(request("true", archive({"file": b"value"})[:-100]))
    assert completed.returncode == 1
    assert b"invalid workspace tar" in completed.stderr
