"""Pollinations provider for Simon Willison's llm.

Registers Pollinations text models as ``pollinations/<model-id>`` by reading
the live ``/v1/models`` catalog — no hardcoded model list. Built on llm's own
OpenAI-compatible Chat/AsyncChat classes, so streaming, conversations, tools,
and attachments all come from llm itself.
"""

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = "https://gen.pollinations.ai/v1/models"
CACHE_TIMEOUT = 3600


def _cache_path() -> Path:
    return llm.user_dir() / "pollinations_models.json"


def _read_cache(path: Path) -> Optional[List[Dict[str, Any]]]:
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(cached.get("models"), list):
            return cached["models"]
    except (OSError, ValueError):
        pass
    return None


def _cache_fresh(path: Path, timeout: int) -> bool:
    try:
        return time.time() - path.stat().st_mtime < timeout
    except OSError:
        return False


def fetch_models(key: str, skip_cache: bool = False) -> List[Dict[str, Any]]:
    """Load the model catalog with the caller's key.

    Uses a small time-limited cache file, falling back to stale cache when
    the network fails so a blip never breaks model listing.
    """
    path = _cache_path()
    if not skip_cache and _cache_fresh(path, CACHE_TIMEOUT):
        cached = _read_cache(path)
        if cached is not None:
            return cached
    try:
        response = httpx.get(
            MODELS_URL,
            headers={"Authorization": f"Bearer {key}"},
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        models = body.get("data", body)
        if not isinstance(models, list):
            raise ValueError("unexpected catalog shape")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"models": models}), encoding="utf-8")
        return models
    except Exception:
        cached = _read_cache(path)
        if cached is not None:
            return cached
        raise


def is_chat_model(entry: Dict[str, Any]) -> bool:
    """Text-in, text-out models only — image/audio models go elsewhere."""
    if entry.get("category") != "text":
        return False
    return "text" in (entry.get("output_modalities") or ["text"])


def supports_vision(entry: Dict[str, Any]) -> bool:
    return "image" in (entry.get("input_modalities") or [])


def supports_tools(entry: Dict[str, Any]) -> bool:
    return entry.get("tools") is True


def supports_reasoning(entry: Dict[str, Any]) -> bool:
    return entry.get("reasoning") is True


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


@llm.hookimpl
def register_models(register):
    # Only register when the user has a key — same pattern as other providers.
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return
    seen: set = set()
    for entry in fetch_models(key):
        if not isinstance(entry, dict):
            continue
        model_id = entry.get("id") or entry.get("name")
        if not model_id or model_id in seen:
            continue
        if not is_chat_model(entry):
            continue
        seen.add(model_id)
        aliases = [
            f"pollinations/{alias}"
            for alias in entry.get("aliases", [])
            if isinstance(alias, str) and alias and alias != model_id
        ]
        kwargs = dict(
            model_id=f"pollinations/{model_id}",
            model_name=model_id,
            vision=supports_vision(entry),
            reasoning=supports_reasoning(entry),
            supports_tools=supports_tools(entry),
            api_base=API_BASE,
        )
        register(
            PollinationsChat(**kwargs),
            PollinationsAsyncChat(**kwargs),
            aliases=aliases,
        )
