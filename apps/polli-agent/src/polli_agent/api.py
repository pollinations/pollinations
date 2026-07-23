"""OpenAI-compatible HTTP surface for the Polli agent."""

from __future__ import annotations

import base64
import contextlib as asynccontextlib
import json
import logging
import os
import time
import uuid
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from polli_agent.agent import run_agent, run_agent_events
from polli_agent.config import _api_key_override, settings

logger = logging.getLogger(__name__)


@asynccontextlib.asynccontextmanager
async def _lifespan(_: FastAPI):
    # pick_model returns "" if the registry cache is cold inside a running loop.
    from polli_agent.registry import warm_registry

    try:
        await warm_registry()
    except Exception as exc:  # non-fatal; tools auto-fetch on first use
        logger.warning("Registry warm-up failed: %s", exc)
    yield


app = FastAPI(title="polli-agent", lifespan=_lifespan)

# Public API consumed by browser-based clients: without CORS, every web UI's
# preflight OPTIONS gets a 405 and the model is unusable from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: Any  # str or OpenAI content-parts list


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = False


def _files_dir() -> str:
    path = os.path.join(settings.temp_dir, "files")
    os.makedirs(path, exist_ok=True)
    return path


@app.get("/files/{name}")
async def serve_file(name: str) -> FileResponse:
    safe = os.path.basename(name)
    full = os.path.join(_files_dir(), safe)
    if not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(full)


def _persist_audio(b64: str, fmt: str) -> str | None:
    """Save audio and return a served URL, or None if no public base is set."""
    base = settings.public_base_url.rstrip("/")
    if not base:
        return None
    name = f"{uuid.uuid4().hex}.{fmt}"
    with open(os.path.join(_files_dir(), name), "wb") as f:
        f.write(base64.b64decode(b64))
    return f"{base}/files/{name}"


def _persist_data_uri(uri: str) -> str | None:
    """Save a data: URI and return a served URL, or None if not applicable."""
    base = settings.public_base_url.rstrip("/")
    if not base or not uri.startswith("data:"):
        return None
    header, _, b64 = uri.partition(",")
    mime = header[len("data:") :].split(";")[0]
    ext = mime.split("/")[-1] or "bin"
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(_files_dir(), name), "wb") as f:
        f.write(base64.b64decode(b64))
    return f"{base}/files/{name}"


async def _host_audio(art: dict[str, Any]) -> str | None:
    """Publish audio on media hosting (preferred) or local /files; None if neither."""
    from polli_agent.tools import media

    try:
        return await media.upload_media(art["data_uri"])
    except Exception as exc:
        logger.warning("Audio media-hosting failed, trying /files: %s", exc)
        return _persist_audio(art["b64"], art.get("format", "mp3"))


async def _build_content(
    text: str, artifacts: list[dict[str, Any]]
) -> tuple[str, list[dict[str, Any]]]:
    """Return (markdown_text, content_parts). Media is embedded both ways."""
    parts: list[dict[str, Any]] = []
    md_lines: list[str] = [text] if text else []

    for art in artifacts:
        kind = art.get("type")
        if kind == "image":
            url = _persist_data_uri(art["url"]) or art["url"]
            parts.append({"type": "image_url", "image_url": {"url": url}})
            # A data: URI is megabytes of base64 — it belongs in the content part
            # only, never inlined into the markdown text.
            md_lines.append(
                "_(edited image attached)_"
                if url.startswith("data:")
                else f"![image]({url})"
            )
        elif kind == "video":
            url = _persist_data_uri(art["url"]) or art["url"]
            parts.append({"type": "video_url", "video_url": {"url": url}})
            md_lines.append(
                "_(video attached)_" if url.startswith("data:") else f"[video]({url})"
            )
        elif kind == "audio":
            # upload_media artifacts arrive pre-hosted; TTS ones carry raw bytes.
            served = art.get("url") or await _host_audio(art)
            # The content part carries the playable payload; a served URL when we
            # have one, else the data URI.
            parts.append(
                {"type": "audio_url", "audio_url": {"url": served or art["data_uri"]}}
            )
            label = (art.get("transcript") or "audio").strip()[:60]
            # Never inline the base64 in markdown — it would bloat the text part
            # by ~1 MB and render as a wall of characters in chat clients.
            if served:
                md_lines.append(f"[audio: {label}]({served})")
            else:
                md_lines.append(f"_(audio narration attached: “{label}…”)_")

    markdown = "\n\n".join(md_lines)
    content_parts = [{"type": "text", "text": markdown}] + parts
    return markdown, content_parts


def _to_openai_messages(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    return [{"role": m.role, "content": m.content} for m in messages]


def _sse_frame(
    chunk_id: str,
    model: str,
    delta: dict[str, Any],
    finish_reason: str | None = None,
) -> str:
    payload = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }
    return f"data: {json.dumps(payload)}\n\n"


_STREAM_DONE = object()


async def _sse_events(
    messages: list[dict[str, Any]], model: str, api_key: str | None
) -> AsyncIterator[str]:
    """Translate agent events into OpenAI chat.completion.chunk SSE frames.

    Agent events are pumped through a queue so quiet stretches (long renders,
    slow brain turns) emit SSE keepalive comments instead of idle silence that
    proxies and clients kill.
    """
    import asyncio

    chunk_id = f"chatcmpl-polli-{uuid.uuid4().hex[:12]}"
    # The endpoint's contextvar scope ends when it returns the response object;
    # the generator body runs later, so it must (re)set the key itself.
    token = _api_key_override.set(api_key)
    queue: asyncio.Queue[Any] = asyncio.Queue()

    async def _pump() -> None:
        try:
            async for event in run_agent_events(messages):
                await queue.put(event)
        except Exception as exc:
            await queue.put(exc)
        finally:
            await queue.put(_STREAM_DONE)

    pump = asyncio.create_task(_pump())
    try:
        yield _sse_frame(chunk_id, model, {"role": "assistant", "content": ""})
        while True:
            try:
                item = await asyncio.wait_for(
                    queue.get(), timeout=settings.sse_keepalive_seconds
                )
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            if item is _STREAM_DONE:
                break
            if isinstance(item, Exception):
                raise item
            if item["type"] == "tool_start":
                yield _sse_frame(
                    chunk_id, model, {"content": f"*→ {item['name']}…*\n\n"}
                )
            elif item["type"] == "nudge":
                yield _sse_frame(
                    chunk_id, model, {"content": f"*→ {item['reason']}…*\n\n"}
                )
            elif item["type"] == "final":
                markdown, _ = await _build_content(item["text"], item["artifacts"])
                yield _sse_frame(chunk_id, model, {"content": markdown})
        yield _sse_frame(chunk_id, model, {}, finish_reason="stop")
    except Exception as exc:
        logger.exception("streaming chat_completions failed")
        yield _sse_frame(
            chunk_id, model, {"content": f"\n\n[error: {exc}]"}, finish_reason="stop"
        )
    finally:
        pump.cancel()
        _api_key_override.reset(token)
    yield "data: [DONE]\n\n"


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest, http_request: Request) -> Any:
    api_key = http_request.headers.get(
        "X-Pollinations-Key"
    ) or http_request.headers.get("Authorization", "").replace("Bearer ", "")
    if request.stream:
        return StreamingResponse(
            _sse_events(
                _to_openai_messages(request.messages),
                request.model,
                api_key or None,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    token = _api_key_override.set(api_key or None)
    try:
        result = await run_agent(_to_openai_messages(request.messages))
        markdown, content_parts = await _build_content(
            result["text"], result["artifacts"]
        )
        content_block: Any = (
            content_parts[0]["text"] if len(content_parts) == 1 else content_parts
        )
        return {
            "id": f"chatcmpl-polli-{uuid.uuid4().hex[:12]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content_block},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("chat_completions failed")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _api_key_override.reset(token)


@app.get("/v1/models")
async def list_models() -> dict[str, Any]:
    return {
        "object": "list",
        "data": [{"id": "polli", "object": "model", "owned_by": "pollinations"}],
    }


@app.get("/v1/chat/completions")
async def chat_completions_get() -> dict[str, Any]:
    # Browsers send GET; a bare 405 reads like an outage. Explain instead.
    return {
        "hint": "This endpoint accepts POST with an OpenAI-compatible JSON body.",
        "example": {
            "method": "POST",
            "headers": {
                "Content-Type": "application/json",
                "Authorization": "Bearer <pollinations-key>",
            },
            "body": {
                "model": "polli",
                "messages": [{"role": "user", "content": "Hi!"}],
                "stream": True,
            },
        },
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "service": "polli-agent",
        "description": "Autonomous multimodal creative agent on Pollinations",
        "endpoints": {
            "chat": "POST /v1/chat/completions (OpenAI-compatible, supports stream)",
            "models": "GET /v1/models",
            "health": "GET /health",
        },
        "auth": "Authorization: Bearer <pollinations-key> or X-Pollinations-Key",
    }
