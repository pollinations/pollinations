"""Pollinations provider for Simon Willison's LLM."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"
CACHE_SECONDS = 15 * 60


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


def _cache_path(key: str) -> Path:
    fingerprint = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    return llm.user_dir() / f"pollinations_models_{fingerprint}.json"


def _read_cache(path: Path) -> list[dict] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, list) else None


def fetch_models(key: str) -> list[dict]:
    """Load the authenticated catalog with a short cache and stale fallback."""
    path = _cache_path(key)
    cached = _read_cache(path)
    try:
        fresh = time.time() - path.stat().st_mtime < CACHE_SECONDS
    except OSError:
        fresh = False
    if fresh and cached is not None:
        return cached

    try:
        response = httpx.get(
            MODELS_URL,
            headers={"Authorization": f"Bearer {key}"},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        models = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(models, list):
            raise ValueError("Unexpected Pollinations model catalog")
    except httpx.HTTPStatusError as error:
        if error.response.status_code < 500 or cached is None:
            raise
        return cached
    except (httpx.TransportError, ValueError):
        if cached is None:
            raise
        return cached

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(models), encoding="utf-8")
    except OSError:
        pass
    return models


def _is_chat_model(model: object) -> bool:
    if not isinstance(model, dict):
        return False
    endpoints = model.get("supported_endpoints")
    inputs = model.get("input_modalities")
    outputs = model.get("output_modalities")
    return (
        isinstance(model.get("id"), str)
        and bool(model["id"])
        and isinstance(endpoints, list)
        and "/v1/chat/completions" in endpoints
        and isinstance(inputs, list)
        and isinstance(outputs, list)
        and "text" in outputs
    )


@llm.hookimpl
def register_models(register):
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return
    try:
        catalog = fetch_models(key)
    except (httpx.HTTPError, ValueError):
        return

    seen = set()
    for model in catalog:
        if not _is_chat_model(model) or model["id"] in seen:
            continue
        seen.add(model["id"])
        options = {
            "model_id": f"pollinations/{model['id']}",
            "model_name": model["id"],
            "api_base": API_BASE,
            "vision": "image" in model["input_modalities"],
            "supports_tools": model.get("tools") is True,
            "reasoning": model.get("reasoning") is True,
        }
        register(PollinationsChat(**options), PollinationsAsyncChat(**options))
