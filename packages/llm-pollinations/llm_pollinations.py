"""Pollinations provider for Simon Willison's LLM."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
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


def _write_cache(path: Path, models: list[dict]) -> None:
    """Replace the cache atomically so concurrent LLM processes cannot truncate it."""
    temporary_path = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_path = tempfile.mkstemp(
            dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as temporary_file:
            json.dump(models, temporary_file)
        os.replace(temporary_path, path)
    except OSError:
        if temporary_path:
            try:
                Path(temporary_path).unlink(missing_ok=True)
            except OSError:
                pass


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

    _write_cache(path, models)
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
        and model.get("category") == "text"
        and isinstance(endpoints, list)
        and "/v1/chat/completions" in endpoints
        and isinstance(inputs, list)
        and "text" in inputs
        and isinstance(outputs, list)
        and "text" in outputs
    )


def _advertises(model: dict, flag: str, capability: str) -> bool:
    capabilities = model.get("capabilities")
    return model.get(flag) is True or (
        isinstance(capabilities, list) and capability in capabilities
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
            "supports_tools": _advertises(model, "tools", "tool_calling"),
            "reasoning": _advertises(model, "reasoning", "reasoning"),
        }
        register(PollinationsChat(**options), PollinationsAsyncChat(**options))
