import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import click
import httpx
import llm
from llm.default_plugins.openai_models import AsyncChat, Chat

POLLINATIONS_MODELS_URL = "https://gen.pollinations.ai/v1/models"
DEFAULT_CACHE_TIMEOUT = 3600


class DownloadError(Exception):
    """Exception raised when catalog download fails and no cache is available."""

    pass


class PollinationsChat(Chat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def get_client(self, key: Optional[str] = None) -> Any:
        resolved_key = self.get_key(key) or "no-key"
        return super().get_client(key=resolved_key)

    def __str__(self) -> str:
        return f"Pollinations: {self.model_id}"


class PollinationsAsyncChat(AsyncChat):
    needs_key = "pollinations"
    key_env_var = "POLLINATIONS_API_KEY"

    def get_client(self, key: Optional[str] = None) -> Any:
        resolved_key = self.get_key(key) or "no-key"
        return super().get_client(key=resolved_key)

    def __str__(self) -> str:
        return f"Pollinations: {self.model_id}"


def fetch_cached_json(
    url: str,
    path: Path,
    cache_timeout: int = DEFAULT_CACHE_TIMEOUT,
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Fetch JSON from URL with time-limited disk caching and stale fallback."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.is_file():
        mod_time = path.stat().st_mtime
        if time.time() - mod_time < cache_timeout:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

    try:
        response = httpx.get(
            url,
            headers=headers or {},
            follow_redirects=True,
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        return data
    except Exception as exc:
        if path.is_file():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        raise DownloadError(
            f"Failed to fetch Pollinations model catalog and no cache is available: {exc}"
        ) from exc


def get_pollinations_models(
    key: Optional[str] = None, skip_cache: bool = False
) -> List[Dict[str, Any]]:
    """Get text model definitions from Pollinations /v1/models catalog."""
    resolved_key = key or llm.get_key("", "pollinations", "POLLINATIONS_API_KEY")
    headers = {}
    if resolved_key:
        headers["Authorization"] = f"Bearer {resolved_key}"

    cache_path = llm.user_dir() / "pollinations_models.json"
    cache_timeout = 0 if skip_cache else DEFAULT_CACHE_TIMEOUT

    try:
        response_data = fetch_cached_json(
            POLLINATIONS_MODELS_URL,
            cache_path,
            cache_timeout=cache_timeout,
            headers=headers,
        )
    except DownloadError:
        return []

    if isinstance(response_data, dict) and "data" in response_data:
        raw_models = response_data["data"]
    elif isinstance(response_data, list):
        raw_models = response_data
    else:
        raw_models = []

    return [m for m in raw_models if is_compatible_text_model(m)]


def is_compatible_text_model(model: Dict[str, Any]) -> bool:
    """Check if model entry is a compatible text model for chat completions."""
    category = model.get("category")
    if category in ("embedding", "audio", "image", "video", "3d"):
        return False

    output_modalities = model.get("output_modalities", [])
    if output_modalities and "text" not in output_modalities:
        return False

    supported_endpoints = model.get("supported_endpoints", [])
    if supported_endpoints and not any(
        ep in supported_endpoints for ep in ("/v1/chat/completions", "/v1/responses")
    ):
        return False

    return True


def get_supports_images(model: Dict[str, Any]) -> bool:
    """Determine image input (vision) support from catalog definition."""
    input_modalities = model.get("input_modalities", [])
    if "image" in input_modalities:
        return True
    capabilities = model.get("capabilities", {})
    return bool(capabilities.get("image_input", False))


def get_supports_tools(model: Dict[str, Any]) -> bool:
    """Determine tool calling support from catalog definition."""
    if "tools" in model:
        return bool(model["tools"])
    capabilities = model.get("capabilities", {})
    return bool(capabilities.get("tools", False))


def get_supports_reasoning(model: Dict[str, Any]) -> bool:
    """Determine reasoning support from catalog definition."""
    if "reasoning" in model:
        return bool(model["reasoning"])
    capabilities = model.get("capabilities", {})
    return bool(capabilities.get("reasoning", False))


def get_supports_schema(model: Dict[str, Any]) -> bool:
    """Determine structured output (schema) support from catalog definition."""
    if "supports_schema" in model:
        return bool(model["supports_schema"])
    capabilities = model.get("capabilities", {})
    return bool(capabilities.get("structured_outputs", False))


@llm.hookimpl
def register_models(register: Any) -> None:
    """Register Pollinations text models with LLM framework."""
    models = get_pollinations_models()
    registered_aliases = set()

    for model_def in models:
        model_id_raw = model_def.get("id")
        if not model_id_raw:
            continue

        full_model_id = f"pollinations/{model_id_raw}"
        supports_images = get_supports_images(model_def)
        supports_tools = get_supports_tools(model_def)
        supports_reasoning = get_supports_reasoning(model_def)
        supports_schema = get_supports_schema(model_def)

        chat_kwargs = dict(
            model_id=full_model_id,
            model_name=model_id_raw,
            api_base="https://gen.pollinations.ai/v1",
            vision=supports_images,
            supports_tools=supports_tools,
            reasoning=supports_reasoning,
            supports_schema=supports_schema,
            headers={
                "HTTP-Referer": "https://pollinations.ai",
                "X-Title": "LLM Pollinations Plugin",
            },
        )

        aliases = []
        raw_aliases = model_def.get("aliases", [])
        for alias in raw_aliases:
            if not alias or alias == model_id_raw:
                continue
            prefixed_alias = f"pollinations/{alias}"
            if prefixed_alias not in registered_aliases and prefixed_alias != full_model_id:
                aliases.append(prefixed_alias)
                registered_aliases.add(prefixed_alias)

        register(
            PollinationsChat(**chat_kwargs),
            PollinationsAsyncChat(**chat_kwargs),
            aliases=tuple(aliases),
        )


@llm.hookimpl
def register_commands(cli: Any) -> None:
    """Register 'pollinations' CLI commands with LLM CLI."""

    @cli.group()
    def pollinations() -> None:
        """Commands relating to the llm-pollinations plugin"""
        pass

    @pollinations.command(name="models")
    @click.option("json_", "--json", is_flag=True, help="Output models as JSON")
    def list_models(json_: bool) -> None:
        """List available Pollinations text models"""
        models = get_pollinations_models()
        if json_:
            click.echo(json.dumps(models, indent=2))
            return

        for model in models:
            m_id = model.get("id")
            title = model.get("title", m_id)
            click.echo(f"- id: pollinations/{m_id}")
            click.echo(f"  name: {title}")
            if model.get("description"):
                click.echo(f"  description: {model['description']}")
            click.echo(f"  vision: {get_supports_images(model)}")
            click.echo(f"  tools: {get_supports_tools(model)}")
            click.echo(f"  reasoning: {get_supports_reasoning(model)}")
            if model.get("context_length"):
                click.echo(f"  context_length: {model['context_length']:,}")
            click.echo()

    @pollinations.command(name="refresh")
    def refresh_models() -> None:
        """Refresh the cached list of Pollinations models"""
        before_models = {m["id"] for m in get_pollinations_models()}
        after_models = {m["id"] for m in get_pollinations_models(skip_cache=True)}

        added = after_models - before_models
        removed = before_models - after_models

        if added:
            click.echo(
                f"Added models: {', '.join('pollinations/' + m for m in sorted(added))}",
                err=True,
            )
        if removed:
            click.echo(
                f"Removed models: {', '.join('pollinations/' + m for m in sorted(removed))}",
                err=True,
            )
        if not added and not removed:
            click.echo("Pollinations model catalog refreshed (no model changes).", err=True)
