"""Pollinations provider plugin for Simon Willison's LLM.

Registers text models from the Pollinations catalog (https://gen.pollinations.ai)
as ``pollinations/<model-id>`` and serves them through LLM's OpenAI-compatible
Chat classes pointed at https://gen.pollinations.ai/v1.

Auth: `llm keys set pollinations` or the POLLINATIONS_API_KEY environment
variable. Models are only registered when a key is present.

Capabilities (vision, tools, reasoning) are derived live from the catalog and
only advertised when the catalog advertises them. The catalog is cached on
disk for an hour, with stale-cache fallback when the network is unreachable.
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional

import click
import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

CATALOG_URL = "https://gen.pollinations.ai/v1/models"
API_BASE = "https://gen.pollinations.ai/v1"
CACHE_TIMEOUT = 3600


class CatalogError(Exception):
    """Raised when the model catalog cannot be loaded."""


def _is_text_model(model: dict[str, Any]) -> bool:
    """Chat-capable text models only: excludes image/audio/transcription models."""
    outputs = model.get("output_modalities") or []
    if "text" not in outputs and model.get("category") != "text":
        return False
    return "/v1/chat/completions" in (model.get("supported_endpoints") or [])


def _has_capability(model: dict[str, Any], capability: str) -> bool:
    capabilities = model.get("capabilities") or []
    if capability in capabilities:
        return True
    # Some catalog entries also carry a top-level boolean flag.
    return bool(model.get(capability))


def _supports_images(model: dict[str, Any]) -> bool:
    return "image" in (model.get("input_modalities") or [])


def get_catalog(key: Optional[str] = None, skip_cache: bool = False) -> list[dict[str, Any]]:
    """Return the Pollinations text-model catalog.

    Fetches https://gen.pollinations.ai/v1/models (authenticated when a key is
    provided), filters it to chat-capable text models and caches the result at
    <user_dir>/pollinations_models.json for CACHE_TIMEOUT seconds. Falls back
    to the stale cache if the network fetch fails.
    """
    path = llm.user_dir() / "pollinations_models.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not skip_cache and path.is_file():
        if time.time() - path.stat().st_mtime < CACHE_TIMEOUT:
            return json.loads(path.read_text())
    headers = {"Authorization": "Bearer {}".format(key)} if key else None
    try:
        response = httpx.get(CATALOG_URL, headers=headers, timeout=30, follow_redirects=True)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as ex:
        if path.is_file():
            return json.loads(path.read_text())
        raise CatalogError(
            "Failed to download the Pollinations catalog and no cache exists "
            "at {}".format(path)
        ) from ex
    models = payload.get("data", payload) if isinstance(payload, dict) else payload
    models = [m for m in models if _is_text_model(m)]
    path.write_text(json.dumps(models))
    return models


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def __str__(self):
        return "Pollinations: {}".format(self.model_id)


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def __str__(self):
        return "Pollinations: {}".format(self.model_id)


@llm.hookimpl
def register_models(register):
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return
    seen: set[str] = set()
    for definition in get_catalog(key):
        if not _is_text_model(definition):
            continue
        model_id = definition.get("id")
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        kwargs = dict(
            model_id="pollinations/{}".format(model_id),
            model_name=model_id,
            vision=_supports_images(definition),
            reasoning=_has_capability(definition, "reasoning"),
            supports_tools=_has_capability(definition, "tool_calling"),
            api_base=API_BASE,
        )
        register(
            PollinationsChat(**kwargs),
            PollinationsAsyncChat(**kwargs),
        )


@llm.hookimpl
def register_commands(cli):
    @cli.group()
    def pollinations():
        """Commands for working with the Pollinations provider"""

    @pollinations.command()
    @click.option("--skip-cache", is_flag=True, help="Bypass the 1-hour cache")
    def models(skip_cache):
        """Show text models currently advertised by Pollinations"""
        key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
        for definition in get_catalog(key, skip_cache=skip_cache):
            click.echo(definition["id"])
