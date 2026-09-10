"""LLM CLI plugin for Pollinations AI."""
import json
from typing import Optional

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"


class PollinationsChat(Chat):
    """Synchronous chat model for Pollinations."""

    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"
    api_base = API_BASE

    def __str__(self):
        return f"Pollinations: {self.model_id}"


class PollinationsAsyncChat(AsyncChat):
    """Asynchronous chat model for Pollinations."""

    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"
    api_base = API_BASE

    def __str__(self):
        return f"Pollinations: {self.model_id}"


def _list_models() -> list[dict]:
    """Fetch available models from Pollinations."""
    try:
        response = httpx.get(f"{API_BASE}/models", timeout=10)
        response.raise_for_status()
        return response.json().get("data", [])
    except Exception:
        return []


def _supports_vision(model_id: str) -> bool:
    """Check if model supports vision based on ID heuristics."""
    vision_markers = ["vision", "gpt-4", "claude-3", "gemini"]
    return any(m in model_id.lower() for m in vision_markers)


def _supports_tools(model_id: str) -> bool:
    """Check if model supports tools based on ID heuristics."""
    tool_markers = ["gpt-4", "gpt-5", "claude-3", "claude-opus"]
    return any(m in model_id.lower() for m in tool_markers)


@llm.hookimpl
def register_models(register):
    """Register all Pollinations models with LLM CLI."""
    models = _list_models()
    if not models:
        # Fallback: register known models if API is unreachable
        models = [
            {"id": "openai/gpt-5.4-nano"},
            {"id": "openai/gpt-5.4"},
            {"id": "openai/gpt-5.4-mini"},
        ]

    for model_data in models:
        model_id = model_data["id"]
        aliases = [model_id.split("/")[-1]] if "/" in model_id else [model_id]

        kwargs = {
            "model_name": model_id,
            "model_id": model_id,
            "api_base": API_BASE,
            "headers": {},
        }

        if _supports_vision(model_id):
            kwargs["vision"] = True
        if _supports_tools(model_id):
            kwargs["supports_tool_calls"] = True

        register(
            PollinationsChat,
            aliases=aliases,
            **kwargs,
        )
        register(
            PollinationsAsyncChat,
            aliases=[f"async-{a}" for a in aliases],
            **kwargs,
        )


@llm.hookimpl
def register_commands(cli):
    """Register Pollinations-specific CLI commands."""
    @cli.command()
    def pollinations_models():
        """List available Pollinations models."""
        models = _list_models()
        for model in models:
            print(model["id"])
