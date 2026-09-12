import hashlib
import json
import time
from pathlib import Path

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"
CACHE_SECONDS = 300
CHAT_ENDPOINT = "/v1/chat/completions"
KEY_ALIAS = "pollinations"
KEY_ENV_VAR = "POLLINATIONS_API_KEY"


class DownloadError(Exception):
    pass


def _cache_path(key: str) -> Path:
    fingerprint = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return llm.user_dir() / f"pollinations_models_{fingerprint}.json"


def _read_cache(path: Path) -> list | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, list) else None


def get_pollinations_models(skip_cache: bool = False) -> list:
    key = llm.get_key("", KEY_ALIAS, KEY_ENV_VAR)
    if not key:
        raise DownloadError(
            f"No Pollinations API key found. Run llm keys set pollinations or set {KEY_ENV_VAR}."
        )

    path = _cache_path(key)
    cached = _read_cache(path)
    try:
        fresh = time.time() - path.stat().st_mtime < CACHE_SECONDS
    except OSError:
        fresh = False
    if not skip_cache and fresh and cached is not None:
        return cached

    try:
        response = httpx.get(
            MODELS_URL,
            headers={"Authorization": f"Bearer {key}"},
            timeout=30,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json()
        models = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(models, list):
            raise ValueError("Unexpected Pollinations model catalog")
    except Exception as exc:
        if cached is not None and not skip_cache:
            return cached
        raise DownloadError(
            "Failed to download the Pollinations model catalog and no usable cache is available"
        ) from exc

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(models), encoding="utf-8")
    except OSError:
        pass
    return models


def is_compatible_text_model(model: object) -> bool:
    if not isinstance(model, dict):
        return False
    model_id = model.get("id")
    if not isinstance(model_id, str) or not model_id:
        return False
    if model.get("category") not in (None, "text"):
        return False

    endpoints = model.get("supported_endpoints")
    if endpoints is not None and (
        not isinstance(endpoints, list) or CHAT_ENDPOINT not in endpoints
    ):
        return False

    outputs = model.get("output_modalities")
    if outputs is not None:
        return isinstance(outputs, list) and "text" in outputs
    return model.get("category") == "text"


def _has_capability(model: dict, capability: str) -> bool:
    values = model.get("capabilities")
    return (isinstance(values, list) and capability in values) or model.get(capability) is True


def supports_vision(model: dict) -> bool:
    values = model.get("input_modalities")
    return isinstance(values, list) and "image" in values


class PollinationsChat(Chat):
    needs_key = KEY_ALIAS
    key_env_var = KEY_ENV_VAR


class PollinationsAsyncChat(AsyncChat):
    needs_key = KEY_ALIAS
    key_env_var = KEY_ENV_VAR


@llm.hookimpl
def register_models(register):
    if not llm.get_key("", KEY_ALIAS, KEY_ENV_VAR):
        return
    try:
        models = get_pollinations_models()
    except DownloadError:
        return

    seen = set()
    for model in models:
        if not is_compatible_text_model(model):
            continue
        model_id = model["id"]
        if model_id in seen:
            continue
        seen.add(model_id)
        options = {
            "model_id": f"pollinations/{model_id}",
            "model_name": model_id,
            "api_base": API_BASE,
            "vision": supports_vision(model),
            "supports_tools": _has_capability(model, "tool_calling") or model.get("tools") is True,
            "reasoning": _has_capability(model, "reasoning") or model.get("reasoning") is True,
        }
        register(PollinationsChat(**options), PollinationsAsyncChat(**options))
