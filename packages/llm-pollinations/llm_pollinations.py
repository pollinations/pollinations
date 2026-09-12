"""Native Pollinations provider plugin for Simon Willison's \x60llm\x60.

Reuses LLM's OpenAI-compatible \x60\x60Chat\x60\x60 / \x60\x60AsyncChat\x60\x60 against
\x60\x60https://gen.pollinations.ai/v1\x60\x60 — streaming, conversations, tools and
attachments all come from the base classes. Compatible text models are loaded
from the authenticated \x60\x60/v1/models\x60\x60 catalog and registered as
\x60\x60pollinations/<model-id>\x60\x60 with no hardcoded model list.
"""

import hashlib
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
KV_FILENAME = "pollinations_kv.json"
# Kept as a compatibility alias for callers that used the old cache constant.
CACHE_FILENAME = KV_FILENAME
CACHE_NAMESPACE = "pollinations.models"
# Small time-limited cache (5 minutes) with stale-cache fallback.
CACHE_TIMEOUT_SECONDS = 5 * 60


class DownloadError(Exception):
    pass


class PersistentKV:
    """Small file-backed key-value store for user-level plugin state."""

    def __init__(self, path: Path):
        self.path = path

    def _read(self) -> dict:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}

    def get(self, key: str, default=None):
        return self._read().get(key, default)

    def set(self, key: str, value) -> None:
        data = self._read()
        data[key] = value
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.tmp")
        try:
            temporary.write_text(
                json.dumps(data, separators=(",", ":")), encoding="utf-8"
            )
            temporary.replace(self.path)
        finally:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass


class PollinationsChat(Chat):
    needs_key = KEY_ALIAS
    key_env_var = KEY_ENV_VAR


class PollinationsAsyncChat(AsyncChat):
    needs_key = KEY_ALIAS
    key_env_var = KEY_ENV_VAR


def _cache_path() -> Path:
    return llm.user_dir() / KV_FILENAME


def _cache_key(key: str) -> str:
    """Return a persistent cache key without storing the API key itself."""
    fingerprint = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return f"{CACHE_NAMESPACE}:{fingerprint}"


def _cache_entry(key: str):
    entry = PersistentKV(_cache_path()).get(_cache_key(key))
    return entry if isinstance(entry, dict) else None


def _cached_models(entry):
    if not isinstance(entry, dict):
        return None
    payload = entry.get("payload")
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return None
    return payload["data"]


def _is_fresh(entry) -> bool:
    stored_at = entry.get("stored_at") if isinstance(entry, dict) else None
    if not isinstance(stored_at, (int, float)):
        return False
    age = time.time() - stored_at
    return 0 <= age < CACHE_TIMEOUT_SECONDS


def _auth_headers(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def get_pollinations_models(skip_cache: bool = False) -> list:
    """Load the authenticated \x60\x60/v1/models\x60\x60 catalog (OpenAI list shape).

    Results are persisted in a user-level key-value file under a hash of the
    API key, so catalogs for different keys never leak into one another. A
    stale value is served when the network fails unless skip_cache is requested.
    """
    key = llm.get_key("", KEY_ALIAS, KEY_ENV_VAR)
    if not key:
        raise DownloadError(
            "No Pollinations API key found. Run \x60llm keys set pollinations\x60 "
            f"or set {KEY_ENV_VAR}."
        )

    entry = _cache_entry(key)
    cached = _cached_models(entry)
    if not skip_cache and cached is not None and _is_fresh(entry):
        return cached

    try:
        response = httpx.get(
            MODELS_URL,
            headers=_auth_headers(key),
            timeout=30,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise ValueError("Unexpected Pollinations model catalog")
        try:
            PersistentKV(_cache_path()).set(
                _cache_key(key),
                {"payload": payload, "stored_at": time.time()},
            )
        except OSError:
            # A read-only user directory should not prevent a live response.
            pass
        return payload["data"]
    except Exception as exc:
        if cached is not None and not skip_cache:
            return cached
        raise DownloadError(
            "Failed to download the Pollinations model catalog and no cached "
            "value is available"
        ) from exc


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
    if not isinstance(model, dict):
        return False
    if not isinstance(model.get("id"), str) or not model["id"]:
        return False

    supported_endpoints = model.get("supported_endpoints")
    if supported_endpoints is not None:
        if not isinstance(supported_endpoints, list):
            return False
        if "/v1/chat/completions" not in supported_endpoints:
            return False

    output_modalities = model.get("output_modalities")
    if output_modalities is not None:
        return isinstance(output_modalities, list) and "text" in output_modalities
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
        # Discovery is best-effort: never break \x60llm\x60 startup when the
        # catalog is unreachable and uncached.
        return
    seen_ids = set()
    for model in models:
        if not is_compatible_text_model(model):
            continue
        model_id = model["id"]
        if model_id in seen_ids:
            continue
        seen_ids.add(model_id)
        kwargs = dict(
            model_id=f"pollinations/{model_id}",
            model_name=model_id,
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
