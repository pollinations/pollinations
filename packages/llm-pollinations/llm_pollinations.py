import json
import time
from pathlib import Path

import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"
CACHE_PATH = llm.user_dir() / "pollinations_models.json"
CACHE_TIMEOUT = 3600


class DownloadError(Exception):
    pass


def fetch_cached_json(url, path, cache_timeout, headers=None):
    path = Path(path)
    if path.is_file():
        mod_time = path.stat().st_mtime
        if time.time() - mod_time < cache_timeout:
            with open(path, "r") as fp:
                return json.load(fp)
    try:
        response = httpx.get(url, headers=headers, timeout=10, follow_redirects=True)
        response.raise_for_status()
        data = response.json()
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as fp:
            json.dump(data, fp)
        return data
    except httpx.HTTPError:
        if path.is_file():
            with open(path, "r") as fp:
                return json.load(fp)
        raise DownloadError(f"Failed to fetch {url} and no cache is available at {path}")


def get_pollinations_models(key):
    data = fetch_cached_json(
        url=MODELS_URL,
        path=CACHE_PATH,
        cache_timeout=CACHE_TIMEOUT,
        headers={"Authorization": f"Bearer {key}"},
    )
    return data["data"]


def is_chat_model(model_definition):
    return model_definition.get("category") == "text" and "/v1/chat/completions" in (
        model_definition.get("supported_endpoints") or []
    )


def supports_images(model_definition):
    return "image" in (model_definition.get("input_modalities") or [])


class _PollinationsMixin:
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def __str__(self):
        return f"Pollinations Chat: {self.model_id}"


class PollinationsChat(_PollinationsMixin, Chat):
    pass


class PollinationsAsyncChat(_PollinationsMixin, AsyncChat):
    pass


@llm.hookimpl
def register_models(register):
    key = llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    if not key:
        return
    try:
        models = get_pollinations_models(key)
    except DownloadError:
        return
    seen_ids = set()
    for model_definition in models:
        model_id = model_definition.get("id")
        if not model_id or model_id in seen_ids or not is_chat_model(model_definition):
            continue
        seen_ids.add(model_id)
        kwargs = dict(
            model_id=f"pollinations/{model_id}",
            model_name=model_id,
            api_base=API_BASE,
            vision=supports_images(model_definition),
            reasoning=bool(model_definition.get("reasoning")),
            supports_tools=bool(model_definition.get("tools")),
        )
        register(
            PollinationsChat(**kwargs),
            PollinationsAsyncChat(**kwargs),
        )
