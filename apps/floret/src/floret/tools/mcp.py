"""Caller-authenticated access to the official Computer and FFmpeg MCP tools."""

from __future__ import annotations

from typing import Any, Literal

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult

from floret.config import resolve_api_key, settings


async def call_tool(
    server: Literal["computer", "ffmpeg"], name: str, arguments: dict[str, Any]
) -> CallToolResult:
    key = resolve_api_key()
    if not key:
        raise ValueError("A caller credential is required for MCP tools")
    # Never share Authorization across runs or expose it to shell commands.
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {key}"},
        timeout=180,
        follow_redirects=False,
    ) as client:
        url = f"{settings.openai_base_url.rstrip('/')}/mcp/{server}"
        async with (
            streamable_http_client(url, http_client=client) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            return await session.call_tool(name, arguments)
