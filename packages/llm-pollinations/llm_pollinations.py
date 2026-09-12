"""llm-pollinations: native Pollinations provider for Simon Willison's llm."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
CATALOG_URL = f"{API_BASE}/models"
CACHE_TTL = 1800  # 30 minutes


def _cache_path(key: str | None) -> Path:
    """Return a per-key cache file path inside llm's user directory."""
    name = "pollinations_models.json"
    if key:
        digest = hashlib.sha256(key.encode()).hexdigest()[:16]
        name = f"pollinations_models_{digest}.json"
    return llm.user_dir() / name


def _fetch_models(url: str, key: str | None = None) -> list[dict]:
    """Fetch model catalog with cache + stale fallback."""
    cache = _cache_path(key)
    cache.parent.mkdir(parents=True, exist_ok=True)

    # Return fresh cache
    if cache.is_file() and time.time() - cache.stat().st_mtime < CACHE_TTL:
        return json.loads(cache.read_text())["data"]

    headers = {"Authorization": f"Bearer {key}"} if key else {}
    req = Request(url, headers=headers)  # noqa: S310
    try:
        with urlopen(req, timeout=30) as resp:  # noqa: S310
            payload = json.loads(resp.read())
        cache.write_text(json.dumps(payload))
        return payload["data"]
    except (URLError, OSError):
        if cache.is_file():
            return json.loads(cache.read_text())["data"]
        raise


def _is_chat_model(m: dict) -> bool:
    return m.get("category") == "text" and "/v1/chat/completions" in (
        m.get("supported_endpoints") or []
    )


def _has_vision(m: dict) -> bool:
    return "image" in (m.get("input_modalities") or [])


def _has_tools(m: dict) -> bool:
    return m.get("tools") is True or "tool_calling" in (m.get("capabilities") or [])


def _has_reasoning(m: dict) -> bool:
    return m.get("reasoning") is True or "reasoning" in (m.get("capabilities") or [])


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def __str__(self) -> str:
        return f"Pollinations: {self.model_id}"


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def __str__(self) -> str:
        return f"Pollinations: {self.model_id}"


@llm.hookimpl
def register_models(register):
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return

    for m in _fetch_models(CATALOG_URL, key=key):
        model_id = m.get("id")
        if not model_id or not _is_chat_model(m):
            continue

        kwargs = dict(
            model_id=f"pollinations/{model_id}",
            model_name=model_id,
            vision=_has_vision(m),
            reasoning=_has_reasoning(m),
            supports_tools=_has_tools(m),
            supports_schema=False,
            api_base=API_BASE,
        )
        register(PollinationsChat(**kwargs), PollinationsAsyncChat(**kwargs))
