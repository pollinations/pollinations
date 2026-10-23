"""Exercise the real MCP SDK and Floret dispatcher at the HTTP boundary."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from floret.config import _api_key_override
from floret.tools import mcp
from floret.toolset import dispatch


@pytest.fixture
def transport(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, Any]]:
    state: dict[str, Any] = {
        "calls": [],
        "clients": [],
        "result": {
            "content": [{"type": "text", "text": "command complete"}],
            "isError": False,
        },
    }

    async def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "HEAD":
            assert request.url.host == "media.pollinations.ai"
            assert "authorization" not in request.headers
            state.setdefault("heads", []).append(str(request.url))
            return httpx.Response(
                state.get("media_status", 200),
                headers={"Content-Type": state.get("mime", "text/plain")},
            )
        if request.method != "POST":
            return httpx.Response(405)
        payload = json.loads(request.content)
        method = payload["method"]
        state["calls"].append((request, payload))
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "initialize":
            result = {
                "protocolVersion": payload["params"]["protocolVersion"],
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "test-mcp", "version": "1"},
            }
        elif method == "tools/list":
            result = {"tools": []}
        elif method == "tools/call":
            if "started" in state:
                state["started"].set()
                await state["release"].wait()
            await asyncio.sleep(0)
            if "status" in state:
                return httpx.Response(state["status"])
            if "error" in state:
                return httpx.Response(
                    200,
                    json={
                        "jsonrpc": "2.0",
                        "id": payload["id"],
                        "error": state["error"],
                    },
                )
            result = state["result"]
        else:
            raise AssertionError(f"Unexpected MCP method: {method}")
        return httpx.Response(
            200, json={"jsonrpc": "2.0", "id": payload["id"], "result": result}
        )

    real_client = httpx.AsyncClient

    def client(**kwargs: Any) -> httpx.AsyncClient:
        assert kwargs["follow_redirects"] is False
        instance = real_client(transport=httpx.MockTransport(handle), **kwargs)
        state["clients"].append(instance)
        return instance

    monkeypatch.setattr(mcp.httpx, "AsyncClient", client)
    monkeypatch.setattr(mcp.settings, "openai_base_url", "https://gen.pollinations.ai")
    token = _api_key_override.set("ag_test-caller")
    yield state
    _api_key_override.reset(token)
    assert all(client.is_closed for client in state["clients"])


async def test_computer_uses_sdk_and_keeps_auth_out_of_arguments(
    transport: dict[str, Any],
) -> None:
    args = {
        "command": "assets publish /workspace/project/result.txt",
        "cwd": "/workspace/project",
        "stdin": "input",
    }
    transport["result"] = {
        "content": [
            {"type": "text", "text": "https://media.pollinations.ai/result.txt"}
        ]
    }
    result = await dispatch("bash", args)
    calls = [
        (request, payload)
        for request, payload in transport["calls"]
        if payload["method"] == "tools/call"
    ]
    assert len(calls) == 1
    request, payload = calls[0]
    assert request.url.path == "/mcp/computer"
    assert request.headers["authorization"] == "Bearer ag_test-caller"
    assert payload["params"] == {"name": "bash", "arguments": args}
    assert "ag_test-caller" not in request.content.decode()
    assert result.brain == "https://media.pollinations.ai/result.txt"
    assert result.artifacts == [
        {
            "type": "file",
            "url": "https://media.pollinations.ai/result.txt",
            "mime_type": "text/plain",
        }
    ]


@pytest.mark.parametrize(
    ("mime", "kind"),
    [
        ("video/mp4", "video"),
        ("audio/mpeg", "audio"),
        ("image/png", "image"),
        ("application/octet-stream", "file"),
    ],
)
async def test_computer_published_media_text_becomes_artifact(
    transport: dict[str, Any], mime: str, kind: str
) -> None:
    from floret.api import _build_content

    url = "https://media.pollinations.ai/1e73de3b-c7a2-48f4-8f70-467e117f8a24"
    transport["mime"] = mime
    transport["result"] = {"content": [{"type": "text", "text": f"Published: {url}"}]}

    result = await dispatch("bash", {"command": 'assets publish "$output"'})

    assert result.artifacts == [{"type": kind, "url": url, "mime_type": mime}]
    assert transport["heads"] == [url]
    markdown, parts = await _build_content("done", result.artifacts)
    assert url in markdown
    if kind == "file":
        assert parts == [{"type": "text", "text": markdown}]
        assert f"[Download file]({url})" in markdown
    else:
        assert parts[1] == {"type": f"{kind}_url", f"{kind}_url": {"url": url}}


@pytest.mark.parametrize("status", [302, 404, 503])
async def test_computer_media_metadata_failure_is_reported(
    transport: dict[str, Any], status: int
) -> None:
    url = "https://media.pollinations.ai/1e73de3b-c7a2-48f4-8f70-467e117f8a24"
    transport["result"] = {"content": [{"type": "text", "text": url}]}
    transport["media_status"] = status

    result = await dispatch("bash", {"command": "assets publish output"})

    assert result.brain.startswith("ERROR from bash:")
    assert result.artifacts == []
    assert transport["heads"] == [url]


@pytest.mark.parametrize(
    ("mime", "kind"),
    [
        ("video/mp4", "video"),
        ("image/jpeg", "image"),
        ("audio/mpeg", "audio"),
        ("application/octet-stream", "file"),
    ],
)
async def test_ffmpeg_resource_links_reach_final_response(
    transport: dict[str, Any], mime: str, kind: str
) -> None:
    from floret.api import _build_content

    url = "https://media.pollinations.ai/output"
    transport["result"] = {
        "content": [
            {
                "type": "resource_link",
                "uri": url,
                "name": "FFmpeg output",
                "mimeType": mime,
            },
            {"type": "text", "text": "converted"},
        ]
    }
    args = {
        "sources": ["https://media.pollinations.ai/source"],
        "args": ["-i", "input0"],
        "outputExtension": "mp4",
    }
    result = await dispatch("runFfmpeg", args)
    request, payload = next(
        (req, body)
        for req, body in transport["calls"]
        if body["method"] == "tools/call"
    )
    assert request.url.path == "/mcp/ffmpeg"
    assert payload["params"] == {"name": "runFfmpeg", "arguments": args}
    assert result.artifacts == [{"type": kind, "url": url, "mime_type": mime}]
    markdown, parts = await _build_content("done", result.artifacts)
    assert url in markdown
    assert url in json.dumps(parts)


async def test_tool_error_is_not_a_successful_artifact(
    transport: dict[str, Any],
) -> None:
    transport["result"] = {
        "isError": True,
        "content": [
            {"type": "text", "text": "input0 missing"},
            {
                "type": "resource_link",
                "uri": "https://media.pollinations.ai/incomplete",
                "name": "partial",
            },
        ],
    }
    result = await dispatch(
        "runFfmpeg",
        {"sources": ["https://example.test/x"], "args": [], "outputExtension": "mp4"},
    )
    assert result.brain.startswith("ERROR from runFfmpeg")
    assert "input0 missing" in result.brain
    assert result.artifacts == []


@pytest.mark.parametrize(
    "failure",
    [
        {"status": 401},
        {"status": 503},
        {"error": {"code": -32602, "message": "Invalid arguments"}},
    ],
)
async def test_protocol_failures_are_reported(
    transport: dict[str, Any], failure: dict[str, Any]
) -> None:
    transport.update(failure)
    result = await dispatch("bash", {"command": "true"})
    assert result.brain.startswith("ERROR")
    assert result.artifacts == []


async def test_concurrent_callers_never_share_mcp_credentials(
    transport: dict[str, Any],
) -> None:
    async def run(key: str) -> None:
        token = _api_key_override.set(key)
        try:
            result = await dispatch("bash", {"command": f"printf {key[-1]}"})
            assert not result.brain.startswith("ERROR")
        finally:
            _api_key_override.reset(token)

    await asyncio.gather(run("ag_caller-a"), run("ag_caller-b"))
    for request, payload in transport["calls"]:
        if payload["method"] == "tools/call":
            suffix = payload["params"]["arguments"]["command"][-1]
            assert request.headers["authorization"] == f"Bearer ag_caller-{suffix}"
    assert len(transport["clients"]) == 2


async def test_computer_run_directory_is_removed(
    transport: dict[str, Any],
) -> None:
    path = "/workspace/floret/run"
    await mcp.cleanup_workspace(path)

    commands = [
        payload["params"]["arguments"]["command"]
        for _, payload in transport["calls"]
        if payload["method"] == "tools/call"
    ]
    assert commands == [f"rm -rf -- {path}"]


async def test_computer_defaults_to_each_run_directory(
    transport: dict[str, Any],
) -> None:
    for path in ("/workspace/floret/one", "/workspace/floret/two"):
        with mcp.workspace(path):
            await dispatch("bash", {"command": "pwd"})

    calls = [
        payload["params"]["arguments"]
        for _, payload in transport["calls"]
        if payload["method"] == "tools/call"
    ]
    assert calls == [
        {"command": "pwd", "cwd": "/workspace/floret/one"},
        {"command": "pwd", "cwd": "/workspace/floret/two"},
    ]


async def test_computer_preserves_command_text_and_explicit_cwd(
    transport: dict[str, Any],
) -> None:
    args = {"command": "printf '/workspace/example'", "cwd": "/workspace/project"}
    with mcp.workspace("/workspace/floret/run"):
        await dispatch("bash", args)

    call = next(
        payload["params"]["arguments"]
        for _, payload in transport["calls"]
        if payload["method"] == "tools/call"
    )
    assert call == args


async def test_cancellation_closes_mcp_transport(transport: dict[str, Any]) -> None:
    transport["started"] = asyncio.Event()
    transport["release"] = asyncio.Event()
    task = asyncio.create_task(dispatch("bash", {"command": "true"}))
    await asyncio.wait_for(transport["started"].wait(), 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert all(client.is_closed for client in transport["clients"])
