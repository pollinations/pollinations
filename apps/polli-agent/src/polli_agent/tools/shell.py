"""In-container bash tool.

The agent runs inside a throwaway Docker container, which *is* the sandbox.
Commands execute under a per-process working directory and a hard timeout.
Output is truncated so a runaway command cannot blow up the model context.
"""

from __future__ import annotations

import asyncio
import logging
import os

from polli_agent.config import settings

logger = logging.getLogger(__name__)

_MAX_OUTPUT = 8000  # chars per stream fed back to the brain
_DEFAULT_TIMEOUT = 60


def _workdir() -> str:
    path = os.path.join(settings.temp_dir, "workspace")
    os.makedirs(path, exist_ok=True)
    return path


def _truncate(text: str) -> str:
    if len(text) <= _MAX_OUTPUT:
        return text
    return text[:_MAX_OUTPUT] + f"\n... [truncated {len(text) - _MAX_OUTPUT} chars]"


async def bash(command: str, timeout: int = _DEFAULT_TIMEOUT) -> str:
    """Run a shell command in the sandbox. Returns combined stdout/stderr + exit code."""
    timeout = max(1, min(int(timeout), 600))
    proc = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=_workdir(),
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return f"ERROR: command timed out after {timeout}s"

    stdout = _truncate(out.decode("utf-8", "replace"))
    stderr = _truncate(err.decode("utf-8", "replace"))
    parts = [f"exit_code: {proc.returncode}"]
    if stdout:
        parts.append(f"stdout:\n{stdout}")
    if stderr:
        parts.append(f"stderr:\n{stderr}")
    return "\n".join(parts)
