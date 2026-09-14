"""Pollinations provider for Simon Willison's LLM."""

from __future__ import annotations

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"


def fetch_models(key: str) -> list[dict]:
    response = httpx.get(
        MODELS_URL,
        headers={"Authorization": f"Bearer {key}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["data"]


def _is_chat_model(model: dict) -> bool:
    return (
        "/v1/chat/completions" in model["supported_endpoints"]
        and "text" in model["output_modalities"]
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

    for model in catalog:
        if not _is_chat_model(model):
            continue
        options = {
            "model_id": f"pollinations/{model['id']}",
            "model_name": model["id"],
            "api_base": API_BASE,
            "vision": "image" in model["input_modalities"],
            "supports_tools": model.get("tools") is True,
            "reasoning": model.get("reasoning") is True,
        }
        register(PollinationsChat(**options), PollinationsAsyncChat(**options))
