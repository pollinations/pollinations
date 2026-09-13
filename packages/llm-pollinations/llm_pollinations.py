"""LLM plugin for the OpenAI-compatible Pollinations API."""

import json
import time
from pathlib import Path

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"
CACHE_SECONDS = 15 * 60


def _models_from_catalog(payload):
    if isinstance(payload, dict):
        payload = payload.get("data", [])
    return [model for model in payload if isinstance(model, dict) and model.get("id")]


def fetch_models(key, *, cache_path=None, cache_seconds=CACHE_SECONDS):
    """Fetch the authenticated catalog, using a fresh cache or stale fallback."""
    cache_path = Path(cache_path or llm.user_dir() / "pollinations_models.json")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.is_file() and time.time() - cache_path.stat().st_mtime < cache_seconds:
        return _models_from_catalog(json.loads(cache_path.read_text()))
    try:
        response = httpx.get(
            MODELS_URL,
            headers={"Authorization": f"Bearer {key}"},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        cache_path.write_text(json.dumps(payload))
        return _models_from_catalog(payload)
    except (httpx.HTTPError, OSError, ValueError):
        if cache_path.is_file():
            return _models_from_catalog(json.loads(cache_path.read_text()))
        raise


def _has(model, *values):
    values = set(values)
    return bool(values.intersection(model.get("capabilities", []))) or bool(
        values.intersection(model.get("supported_parameters", []))
    )


def _is_text_model(model):
    endpoints = model.get("supported_endpoints", [])
    return (
        model.get("category") == "text"
        and "text" in model.get("input_modalities", [])
        and "text" in model.get("output_modalities", [])
        and (not endpoints or "/v1/chat/completions" in endpoints)
    )


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def __str__(self):
        return f"Pollinations: {self.model_id}"


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def __str__(self):
        return f"Pollinations: {self.model_id}"


@llm.hookimpl
def register_models(register, model_aliases):
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return
    existing = {item.model.model_id for item in model_aliases}
    for definition in fetch_models(key):
        if not _is_text_model(definition):
            continue
        model_id = f"pollinations/{definition['id']}"
        if model_id in existing:
            continue
        kwargs = dict(
            model_id=model_id,
            model_name=definition["id"],
            api_base=API_BASE,
            vision="image" in definition.get("input_modalities", []),
            reasoning=_has(definition, "reasoning"),
            supports_tools=_has(definition, "tools", "tool_calling"),
            supports_schema=_has(definition, "structured_outputs", "json_schema"),
        )
        register(PollinationsChat(**kwargs), PollinationsAsyncChat(**kwargs))
        existing.add(model_id)
