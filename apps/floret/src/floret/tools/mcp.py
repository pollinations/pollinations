"""Caller-authenticated access to the official Computer and FFmpeg MCP tools."""

from __future__ import annotations

import posixpath
import re
import shlex
from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any, Literal

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult

from floret.config import resolve_api_key, settings


_workspace: ContextVar[tuple[str, list[bool]] | None] = ContextVar(
    "computer_workspace", default=None
)


@contextmanager
def workspace(path: str) -> Generator[list[bool], None, None]:
    used = [False]
    token: Token[tuple[str, list[bool]] | None] = _workspace.set((path, used))
    try:
        yield used
    finally:
        _workspace.reset(token)


def _workspace_command(arguments: dict[str, Any], path: str) -> dict[str, Any]:
    requested = str(arguments.get("cwd") or "/workspace")
    if requested == "/workspace":
        cwd = path
    elif requested.startswith("/workspace/"):
        cwd = posixpath.join(path, requested.removeprefix("/workspace/"))
    else:
        raise ValueError("Computer cwd must be inside /workspace")
    command = re.sub(
        r"(?<![\w.-])/workspace(?=/|\s|$)", path, str(arguments["command"])
    )
    return {
        **arguments,
        "command": f"mkdir -p {shlex.quote(cwd)} && cd {shlex.quote(cwd)} && {command}",
        "cwd": "/workspace",
    }


async def prepare_workspace(path: str) -> None:
    token: Token[tuple[str, list[bool]] | None] = _workspace.set(None)
    try:
        await call_tool(
            "computer", "bash", {"command": f"mkdir -p {shlex.quote(path)}"}
        )
    finally:
        _workspace.reset(token)


async def cleanup_workspace(path: str) -> None:
    token: Token[tuple[str, list[bool]] | None] = _workspace.set(None)
    try:
        await call_tool(
            "computer", "bash", {"command": f"rm -rf -- {shlex.quote(path)}"}
        )
    finally:
        _workspace.reset(token)


async def call_tool(
    server: Literal["computer", "ffmpeg"], name: str, arguments: dict[str, Any]
) -> CallToolResult:
    key = resolve_api_key()
    if not key:
        raise ValueError("A caller credential is required for MCP tools")
    current = _workspace.get()
    if server == "computer" and name == "bash" and current is not None:
        path, used = current
        used[0] = True
        arguments = _workspace_command(arguments, path)
    # Never share Authorization across runs or expose it to shell commands.
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {key}"},
        timeout=310,
        follow_redirects=False,
    ) as client:
        url = f"{settings.openai_base_url.rstrip('/')}/mcp/{server}"
        async with (
            streamable_http_client(url, http_client=client) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            return await session.call_tool(name, arguments)
