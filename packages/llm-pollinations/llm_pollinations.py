"""
llm-pollinations: Pollinations models for Simon Willison's llm.

Registers text models from the Pollinations catalog as
``pollinations/<model-id>`` — the catalog is fetched from
https://gen.pollinations.ai/v1/models, cached for an hour in the llm user
directory, and falls back to a stale copy when Pollinations is unreachable.

https://github.com/pollinations/pollinations/tree/main/packages/llm-pollinations
"""

import json
import time

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

BASE_URL = "https://gen.pollinations.ai/v1"
CATALOG_URL = BASE_URL + "/models"
CACHE_PATH = llm.user_dir() / "pollinations_models.json"
CACHE_TIMEOUT = 3600  # one hour


def fetch_catalog(skip_cache=False):
    """
    Return the Pollinations model catalog as a list of dicts.

    The catalog is cached in the llm user directory for CACHE_TIMEOUT
    seconds. If it cannot be fetched, a stale cached copy is returned
    when one exists.
    """
    stale = _read_cache()
    if stale is not None and not skip_cache and _cache_age() < CACHE_TIMEOUT:
        return stale
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    headers = {"Authorization": "Bearer {}".format(key)} if key else None
    try:
        response = httpx.get(CATALOG_URL, headers=headers, timeout=10, follow_redirects=True)
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError:
        if stale is not None:
            return stale
        raise
    catalog = payload.get("data") if isinstance(payload, dict) else payload
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(catalog, indent=2))
    return catalog


def _read_cache():
    try:
        return json.loads(CACHE_PATH.read_text())
    except (OSError, ValueError):
        return None


def _cache_age():
    try:
        return time.time() - CACHE_PATH.stat().st_mtime
    except OSError:
        return float("inf")


def chat_models(catalog):
    """Yield catalog entries for models that chat and reply with text."""
    for model in catalog:
        if "/v1/chat/completions" not in (model.get("supported_endpoints") or []):
            continue
        if "text" not in (model.get("output_modalities") or []):
            continue
        yield model


def model_kwargs(model):
    """Build Chat constructor arguments from a catalog entry.

    Image input, tool calling, reasoning and structured outputs are only
    enabled when the catalog advertises them.
    """
    capabilities = model.get("capabilities") or []
    return dict(
        model_id="pollinations/{}".format(model["id"]),
        model_name=model["id"],
        vision="image" in (model.get("input_modalities") or []),
        reasoning="reasoning" in capabilities,
        supports_tools="tool_calling" in capabilities,
        supports_schema="structured_outputs" in capabilities,
        can_stream=True,
        api_base=BASE_URL,
    )


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
    # Only hit the catalog when a key is configured, so llm startup stays
    # fast for users who are not using this plugin.
    if not llm.get_key("", "pollinations", "POLLINATIONS_API_KEY"):
        return
    for model in chat_models(fetch_catalog()):
        kwargs = model_kwargs(model)
        register(PollinationsChat(**kwargs), PollinationsAsyncChat(**kwargs))
