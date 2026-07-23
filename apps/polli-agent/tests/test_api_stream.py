"""Unit tests for SSE streaming on /v1/chat/completions (no network)."""

from __future__ import annotations

import base64
import json

import pytest
from fastapi.testclient import TestClient

from polli_agent import api as api_mod


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    async def noop():
        return None

    monkeypatch.setattr("polli_agent.registry.warm_registry", noop)


def _request_body(stream: bool) -> dict:
    return {
        "model": "polli",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": stream,
    }


def test_stream_true_returns_openai_sse_chunks(monkeypatch):
    async def fake_events(messages, **kwargs):
        yield {"type": "tool_start", "name": "generate_image"}
        yield {
            "type": "final",
            "text": "done!",
            "artifacts": [{"type": "image", "url": "http://img/x.png"}],
            "iterations": 2,
        }

    monkeypatch.setattr(api_mod, "run_agent_events", fake_events)

    client = TestClient(api_mod.app)
    with client.stream(
        "POST", "/v1/chat/completions", json=_request_body(stream=True)
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = "".join(resp.iter_text())

    frames = [line for line in body.split("\n") if line.startswith("data: ")]
    assert frames[-1] == "data: [DONE]"

    payloads = [json.loads(f[len("data: ") :]) for f in frames[:-1]]
    assert all(p["object"] == "chat.completion.chunk" for p in payloads)
    assert payloads[0]["choices"][0]["delta"].get("role") == "assistant"
    assert payloads[-1]["choices"][0]["finish_reason"] == "stop"

    content = "".join(p["choices"][0]["delta"].get("content") or "" for p in payloads)
    assert "generate_image" in content  # tool progress is surfaced
    assert "done!" in content  # final text is streamed
    assert "http://img/x.png" in content  # media embedded as markdown


def test_stream_emits_keepalives_during_silence(monkeypatch):
    """Long tool/brain gaps must produce SSE comments so proxies don't kill us."""
    import asyncio

    monkeypatch.setattr(api_mod.settings, "sse_keepalive_seconds", 0.05)

    async def slow_events(messages, **kwargs):
        await asyncio.sleep(0.2)  # several keepalive intervals of silence
        yield {"type": "final", "text": "done", "artifacts": [], "iterations": 1}

    monkeypatch.setattr(api_mod, "run_agent_events", slow_events)

    client = TestClient(api_mod.app)
    with client.stream(
        "POST", "/v1/chat/completions", json=_request_body(stream=True)
    ) as resp:
        body = "".join(resp.iter_text())

    assert body.count(": keepalive") >= 2
    assert "done" in body
    assert body.rstrip().endswith("data: [DONE]")


async def test_data_uri_image_is_persisted_and_linked(monkeypatch, tmp_path):
    """With a public base URL set, data-URI media must become a served /files link."""
    monkeypatch.setattr(api_mod.settings, "public_base_url", "http://host")
    monkeypatch.setattr(api_mod.settings, "temp_dir", str(tmp_path))

    b64 = base64.b64encode(b"fake png bytes").decode()
    markdown, parts = await api_mod._build_content(
        "here", [{"type": "image", "url": f"data:image/png;base64,{b64}"}]
    )

    assert "http://host/files/" in markdown
    img_part = next(p for p in parts if p["type"] == "image_url")
    assert img_part["image_url"]["url"].startswith("http://host/files/")


async def test_audio_artifact_is_hosted_via_media_upload(monkeypatch):
    """Audio must get a media.pollinations.ai URL — no PUBLIC_BASE_URL needed."""
    from polli_agent.tools import media

    async def fake_upload(source, filename=None):
        return "https://media.pollinations.ai/aud1"

    monkeypatch.setattr(media, "upload_media", fake_upload)

    b64 = base64.b64encode(b"mp3 bytes").decode()
    markdown, parts = await api_mod._build_content(
        "here",
        [
            {
                "type": "audio",
                "b64": b64,
                "data_uri": f"data:audio/mpeg;base64,{b64}",
                "format": "mp3",
                "transcript": "hello world",
            }
        ],
    )

    assert "https://media.pollinations.ai/aud1" in markdown
    audio_part = next(p for p in parts if p["type"] == "audio_url")
    assert audio_part["audio_url"]["url"] == "https://media.pollinations.ai/aud1"


def test_cors_preflight_allows_browser_clients():
    """Web UIs send OPTIONS first; without CORS the API is browser-unusable."""
    client = TestClient(api_mod.app)
    resp = client.options(
        "/v1/chat/completions",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "*"
    assert "POST" in resp.headers["access-control-allow-methods"]


def test_root_returns_service_info():
    """Browser GETs on the root must not look broken (no 405/404 confusion)."""
    client = TestClient(api_mod.app)
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["service"] == "polli-agent"
    assert "/v1/chat/completions" in str(body)


def test_stream_false_returns_plain_json(monkeypatch):
    async def fake_run_agent(messages, **kwargs):
        return {"text": "plain", "artifacts": [], "iterations": 1}

    monkeypatch.setattr(api_mod, "run_agent", fake_run_agent)

    client = TestClient(api_mod.app)
    resp = client.post("/v1/chat/completions", json=_request_body(stream=False))
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"] == "plain"
