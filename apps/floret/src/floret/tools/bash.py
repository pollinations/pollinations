"""Shell calls share the filesystem and processes of this run's E2B VM."""

from __future__ import annotations

import asyncio
import os
import signal
from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

_workspace: ContextVar[str | None] = ContextVar("bash_workspace", default=None)
OUTPUT_LIMIT = 32 * 1024


@contextmanager
def workspace(path: str) -> Generator[None, None, None]:
    token = _workspace.set(path)
    try:
        yield
    finally:
        _workspace.reset(token)


async def run(command: str, stdin: str = "", cwd: str | None = None) -> str:
    path = cwd or _workspace.get()
    if path is None:
        raise ValueError("bash requires an active run workspace")
    Path(path).mkdir(parents=True, exist_ok=True)
    process = await asyncio.create_subprocess_exec(
        "/bin/bash",
        "-c",
        command,
        cwd=path,
        env={
            name: os.environ[name]
            for name in ("PATH", "HOME", "LANG", "TMPDIR")
            if name in os.environ
        },
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )

    async def read(stream: asyncio.StreamReader | None) -> str:
        assert stream is not None
        output = bytearray()
        truncated = False
        while chunk := await stream.read(8192):
            remaining = OUTPUT_LIMIT - len(output)
            output.extend(chunk[:remaining])
            truncated |= len(chunk) > remaining
        return output.decode(errors="replace") + (
            "\n[output truncated]" if truncated else ""
        )

    async def write_input() -> None:
        assert process.stdin is not None
        try:
            process.stdin.write(stdin.encode())
            await process.stdin.drain()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            process.stdin.close()

    try:
        _, stdout, stderr, _ = await asyncio.wait_for(
            asyncio.gather(
                process.wait(),
                read(process.stdout),
                read(process.stderr),
                write_input(),
            ),
            timeout=60,
        )
    except (asyncio.TimeoutError, asyncio.CancelledError):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        await process.wait()
        raise
    output = stdout + stderr
    return (
        f"ERROR: command exited {process.returncode}\n" if process.returncode else ""
    ) + output
