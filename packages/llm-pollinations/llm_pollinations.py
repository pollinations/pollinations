"""Native Pollinations provider plugin for Simon Willison's `llm`.

Reuses LLM's OpenAI-compatible ``Chat`` / ``AsyncChat`` against
``https://gen.pollinations.ai/v1`` — streaming, conversations, tools and
attachments all come from the base classes. Compatible text models are loaded
from the authenticated ``/v1/models`` catalog and registered as
``pollinations/<model-id>`` with no hardcoded model list.
"""

import json
import time
from pathlib import Path

import click
import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

API_BASE = "https://gen.pollinations.ai/v1"
MODELS_URL = f"{API_BASE}/models"
KEY_ALIAS = "pollinations"
KEY_ENV_VAR = "POLLINATIONS_API_KEY"
CACHE_FILENAME = "pollinations_models.json"
# Small time-limited cache (5 minutes) with stale-cache fallback.
CACHE_TIMEOUT_SECONDS = 5 * 60


class DownloadError(Exception):
    pass


class PollinationsChat(Chat):
    needs_key = KEY_ALIAS
    key_env_var = KEY_ENV_VAR


class PollinationsAsyncChat(AsyncChat):
    needs_key = KEY_ALIAS
    key_env_var = KEY_ENV_VAR


def _cache_path() -> Path:
    return llm.user_dir() / CACHE_FILENAME


def _auth_headers(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def get_pollinations_models(skip_cache: bool = False) -> list:
    """Load the authenticated ``/v1/models`` catalog (OpenAI list shape).

    Sends the stored ``pollinations`` key so the catalog reflects the caller's
    permissions. Results are cached briefly; a stale cache is served when the
    network fails.
    """
    key = llm.get_key("", KEY_ALIAS, KEY_ENV_VAR)
    if not key:
        raise DownloadError(
            "No Pollinations API key found. Run `llm keys set pollinations` "
            f"or set {KEY_ENV_VAR}."
        )
    path = _cache_path()
    if not skip_cache and path.is_file():
        try:
            if time.time() - path.stat().st_mtime < CACHE_TIMEOUT_SECONDS:
                with open(path) as f:
                    return json.load(f)["data"]
        except (OSError, ValueError, KeyError):
            pass
    try:
        response = httpx.get(
            MODELS_URL, headers=_auth_headers(key), timeout=30,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json()
        with open(path, "w") as f:
            json.dump(payload, f)
        return payload["data"]
    except Exception:
        if path.is_file():
            try:
                with open(path) as f:
                    return json.load(f)["data"]
            except (OSError, ValueError, KeyError):
                pass
        raise DownloadError(
            f"Failed to download the Pollinations model catalog and no cache "
            f"is available at {path}"
        )


def supports_vision(model: dict) -> bool:
    """True only when the catalog advertises image input for the model."""
    return "image" in (model.get("input_modalities") or [])


def supports_tools(model: dict) -> bool:
    """True only when the catalog advertises tool calling for the model."""
    return "tool_calling" in (model.get("capabilities") or []) or bool(
        model.get("tools")
    )


def supports_reasoning(model: dict) -> bool:
    """True only when the catalog advertises reasoning for the model."""
    return "reasoning" in (model.get("capabilities") or []) or bool(
        model.get("reasoning")
    )


def is_compatible_text_model(model: dict) -> bool:
    if not isinstance(model.get("id"), str):
        return False
    output_modalities = model.get("output_modalities")
    if output_modalities is not None:
        return "text" in output_modalities
    return model.get("category") == "text"


@llm.hookimpl
def register_models(register):
    # Only register when a key is configured, so the catalog reflects the
    # caller's authenticated view (mirrors llm-openrouter behavior).
    key = llm.get_key("", KEY_ALIAS, KEY_ENV_VAR)
    if not key:
        return
    try:
        models = get_pollinations_models()
    except Exception:
        # Discovery is best-effort: never break `llm` startup when the
        # catalog is unreachable and uncached.
        return
    for model in models:
        if not is_compatible_text_model(model):
            continue
        kwargs = dict(
            model_id=f"pollinations/{model['id']}",
            model_name=model["id"],
            api_base=API_BASE,
            vision=supports_vision(model),
            supports_tools=supports_tools(model),
            reasoning=supports_reasoning(model),
        )
        register(
            PollinationsChat(**kwargs),
            PollinationsAsyncChat(**kwargs),
        )


@llm.hookimpl
def register_commands(cli):
    @cli.group()
    def pollinations():
        """Commands for the llm-pollinations plugin."""

    @pollinations.command()
    @click.option("json_", "--json", is_flag=True, help="Output as JSON")
    def models(json_):
        """List cached Pollinations text models."""
        models = get_pollinations_models()
        text_models = [m for m in models if is_compatible_text_model(m)]
        if json_:
            click.echo(json.dumps(text_models, indent=2))
        else:
            for model in text_models:
                click.echo(f"pollinations/{model['id']}")

    @pollinations.command()
    def refresh():
        """Refresh the cached Pollinations model catalog."""
        before = {
            m["id"]
            for m in get_pollinations_models()
            if is_compatible_text_model(m)
        }
        after = {
            m["id"]
            for m in get_pollinations_models(skip_cache=True)
            if is_compatible_text_model(m)
        }
        added = after - before
        removed = before - after
        if added:
            click.echo(
                "Added models: {}".format(
                    ", ".join(f"pollinations/{m}" for m in sorted(added))
                ),
                err=True,
            )
        if removed:
            click.echo(
                "Removed models: {}".format(
                    ", ".join(f"pollinations/{m}" for m in sorted(removed))
                ),
                err=True,
            )
        if not added and not removed:
            click.echo("No changes", err=True)
