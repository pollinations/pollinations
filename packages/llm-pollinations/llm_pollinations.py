import hashlib
import json
import time

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"
CACHE_SECONDS = 3600


def _cache_path(key):
    fingerprint = hashlib.sha256(key.encode()).hexdigest()[:12]
    return llm.user_dir() / f"pollinations_models_{fingerprint}.json"


def _read_cache(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else None
    except (OSError, ValueError):
        return None


def fetch_models(key):
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
        body = response.json()
        models = body.get("data") if isinstance(body, dict) else None
        if not isinstance(models, list):
            raise TypeError("Unexpected Pollinations model catalog")
    except httpx.HTTPStatusError as error:
        if error.response.status_code < 500 or cached is None:
            raise
        return cached
    except (httpx.TransportError, TypeError, ValueError):
        if cached is None:
            raise
        return cached

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(models), encoding="utf-8")
    except OSError:
        pass
    return models


def _is_chat_model(model):
    supported_endpoints = model.get("supported_endpoints")
    input_modalities = model.get("input_modalities")
    return (
        model.get("category") == "text"
        and isinstance(supported_endpoints, list)
        and "/v1/chat/completions" in supported_endpoints
        and isinstance(input_modalities, list)
    )


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


@llm.hookimpl
def register_models(register):
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return
    try:
        catalog = fetch_models(key)
    except (httpx.HTTPError, TypeError, ValueError):
        return

    seen = set()
    for model in catalog:
        if not isinstance(model, dict) or not _is_chat_model(model):
            continue
        model_name = model.get("id")
        if not isinstance(model_name, str) or not model_name or model_name in seen:
            continue
        seen.add(model_name)
        options = {
            "model_id": f"pollinations/{model_name}",
            "model_name": model_name,
            "api_base": API_BASE,
            "vision": "image" in model["input_modalities"],
            "supports_tools": model.get("tools") is True,
            "reasoning": model.get("reasoning") is True,
        }
        register(PollinationsChat(**options), PollinationsAsyncChat(**options))
