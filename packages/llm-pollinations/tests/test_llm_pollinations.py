import json

import llm_pollinations as plugin
from llm.default_plugins.openai_models import AsyncChat, Chat


def test_reuses_openai_compatible_chat_classes():
    assert issubclass(plugin.PollinationsChat, Chat)
    assert issubclass(plugin.PollinationsAsyncChat, AsyncChat)
    # No custom execution logic: streaming, conversations, tools and
    # attachments all come from the base classes.
    assert "execute" not in plugin.PollinationsChat.__dict__
    assert "execute" not in plugin.PollinationsAsyncChat.__dict__
    assert plugin.PollinationsChat.needs_key == "pollinations"
    assert plugin.PollinationsChat.key_env_var == "POLLINATIONS_API_KEY"
    assert plugin.API_BASE == "https://gen.pollinations.ai/v1"
    assert plugin.MODELS_URL == "https://gen.pollinations.ai/v1/models"


def test_auth_uses_llm_keys_or_env(monkeypatch):
    seen = {}

    def fake_get_key(explicit, alias, env_var):
        seen["alias"] = alias
        seen["env_var"] = env_var
        return "sk_test"

    monkeypatch.setattr(plugin.llm, "get_key", fake_get_key)
    monkeypatch.setattr(
        plugin, "get_pollinations_models", lambda skip_cache=False: []
    )
    registered = []
    plugin.register_models(registered.append)
    assert seen == {"alias": "pollinations", "env_var": "POLLINATIONS_API_KEY"}
    assert registered == []


def test_capabilities_enabled_only_when_advertised():
    vision = {
        "id": "m",
        "category": "text",
        "input_modalities": ["text", "image"],
        "capabilities": [],
    }
    assert plugin.supports_vision(vision) is True
    assert plugin.supports_vision({"input_modalities": ["text"]}) is False
    assert plugin.supports_vision({}) is False

    assert plugin.supports_tools({"capabilities": ["tool_calling"]}) is True
    assert plugin.supports_tools({"tools": True}) is True
    assert plugin.supports_tools({"capabilities": [], "tools": None}) is False
    assert plugin.supports_tools({}) is False

    assert plugin.supports_reasoning({"capabilities": ["reasoning"]}) is True
    assert plugin.supports_reasoning({"reasoning": True}) is True
    assert plugin.supports_reasoning({"reasoning": None}) is False
    assert plugin.supports_reasoning({}) is False


def test_registration_namespaces_ids_without_hardcoded_list(monkeypatch, tmp_path):
    catalog = {
        "data": [
            {
                "id": "openai/gpt-5.4-nano",
                "category": "text",
                "input_modalities": ["text", "image"],
                "capabilities": ["tool_calling"],
                "tools": True,
            },
            {
                "id": "some/image-model",
                "category": "image",
                "input_modalities": ["text"],
                "capabilities": [],
            },
        ]
    }

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return catalog

    monkeypatch.setattr(plugin.llm, "get_key", lambda *a, **k: "sk_test")
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(
        plugin.httpx, "get", lambda *a, **k: FakeResponse()
    )
    registered = []
    plugin.register_models(lambda *models: registered.extend(models))
    assert len(registered) == 2  # sync + async for the one text model
    chat, async_chat = registered
    assert isinstance(chat, plugin.PollinationsChat)
    assert isinstance(async_chat, plugin.PollinationsAsyncChat)
    # No provider-name collisions: namespaced IDs, canonical API names.
    assert chat.model_id == "pollinations/openai/gpt-5.4-nano"
    assert chat.model_name == "openai/gpt-5.4-nano"
    assert chat.vision is True
    assert chat.supports_tools is True
    # reasoning=False builds no reasoning options (base Chat behavior).
    assert "reasoning_effort" not in chat.Options.model_fields
    assert "image-model" not in [m.model_id for m in registered]


def test_reasoning_option_only_when_advertised(monkeypatch, tmp_path):
    catalog = {
        "data": [
            {
                "id": "plain-model",
                "category": "text",
                "input_modalities": ["text"],
                "capabilities": [],
            },
            {
                "id": "reason-model",
                "category": "text",
                "input_modalities": ["text"],
                "capabilities": ["reasoning"],
                "reasoning": True,
            },
        ]
    }

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return catalog

    monkeypatch.setattr(plugin.llm, "get_key", lambda *a, **k: "sk_test")
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(plugin.httpx, "get", lambda *a, **k: FakeResponse())
    registered = []
    plugin.register_models(lambda *models: registered.extend(models))
    by_id = {m.model_id: m for m in registered}
    assert "reasoning_effort" not in by_id["pollinations/plain-model"].Options.model_fields
    assert "reasoning_effort" in by_id["pollinations/reason-model"].Options.model_fields


def test_stale_cache_fallback(monkeypatch, tmp_path):
    stale = {"data": [{"id": "openai/x", "category": "text"}]}
    cache = tmp_path / plugin.CACHE_FILENAME
    cache.write_text(json.dumps(stale))
    # Make the cache stale (older than the timeout).
    import os
    import time

    old = time.time() - plugin.CACHE_TIMEOUT_SECONDS - 10
    os.utime(cache, (old, old))

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(plugin.llm, "get_key", lambda *a, **k: "sk_test")
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(plugin.httpx, "get", boom)
    assert plugin.get_pollinations_models() == stale["data"]
    # Forced refresh also falls back to stale rather than raising.
    assert plugin.get_pollinations_models(skip_cache=True) == stale["data"]
