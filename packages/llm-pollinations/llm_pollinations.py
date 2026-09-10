import json
import time
from pathlib import Path

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"
CACHE_FILENAME = "pollinations_models.json"
# Short cache: the catalog changes often, and a stale file is only a fallback.
CACHE_TIMEOUT = 1800  # 30 minutes


class DownloadError(Exception):
    pass


def fetch_cached_json(url, path, cache_timeout, headers=None):
    path = Path(path)

    # Create directories if not exist
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.is_file():
        # Get the file's modification time
        mod_time = path.stat().st_mtime
        # Check if it's more than the cache_timeout old
        if time.time() - mod_time < cache_timeout:
            # If not, load the file
              with open(path, "r") as file:
                return json.load(file)

    # Try to download the data
    try:
        response = httpx.get(url, headers=headers, follow_redirects=True, timeout=30)
        response.raise_for_status()  # Raises if the request fails

        # If successful, write to the file
        with open(path, "w") as file:
            json.dump(response.json(), file)

        return response.json()
    except httpx.HTTPError:
        # If there's an existing file, load it (stale-cache fallback)
        if path.is_file():
            with open(path, "r") as file:
                return json.load(file)
        else:
            # If not, raise an error
            raise DownloadError(
                f"Failed to download data and no cache is available at {path}"
            )


def get_pollinations_models(skip_cache=False, key=None):
    headers = {"Authorization": f"Bearer {key}"} if key else None
    payload = fetch_cached_json(
        url=MODELS_URL,
        path=llm.user_dir() / CACHE_FILENAME,
        cache_timeout=0 if skip_cache else CACHE_TIMEOUT,
        headers=headers,
    )
    return payload["data"]


def is_chat_model(model):
    return model.get("category") == "text" and "/v1/chat/completions" in (
        model.get("supported_endpoints") or []
    )


def supports_vision(model):
    return "image" in (model.get("input_modalities") or [])


def supports_tools(model):
    if model.get("tools") is True:
        return True
    return "tool_calling" in (model.get("capabilities") or [])


def supports_reasoning(model):
    if model.get("reasoning") is True:
        return True
    return "reasoning" in (model.get("capabilities") or [])


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
    # Only do this if the pollinations key is set
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return
    for model in get_pollinations_models(key=key):
        model_id = model.get("id")
        if not model_id or not is_chat_model(model):
            continue
        kwargs = dict(
            model_id="pollinations/{}".format(model_id),
            model_name=model_id,
            vision=supports_vision(model),
            reasoning=supports_reasoning(model),
            supports_schema=False,
            supports_tools=supports_tools(model),
            api_base=API_BASE,
        )
        register(
            PollinationsChat(**kwargs),
            PollinationsAsyncChat(**kwargs),
        )
