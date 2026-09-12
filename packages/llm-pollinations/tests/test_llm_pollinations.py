import json
import time

import pytest

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


def test_catalog_persists_in_key_value_store(monkeypatch, tmp_path):
    catalog = {"data": [{"id": "openai/cached", "output_modalities": ["text"]}]}
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return catalog

    monkeypatch.setattr(plugin.llm, "get_key", lambda *a, **k: "sk_one")
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(
        plugin.httpx,
        "get",
        lambda *a, **k: (calls.append((a, k)) or FakeResponse()),
    )

    assert plugin.get_pollinations_models() == catalog["data"]
    store = json.loads((tmp_path / plugin.KV_FILENAME).read_text())
    cache_key = plugin._cache_key("sk_one")
    assert store[cache_key]["payload"] == catalog
    assert "sk_one" not in json.dumps(store)

    def network_must_not_run(*args, **kwargs):
        raise AssertionError("fresh KV value was not used")

    monkeypatch.setattr(plugin.httpx, "get", network_must_not_run)
    assert plugin.get_pollinations_models() == catalog["data"]
    assert len(calls) == 1


def test_cache_is_scoped_to_hashed_key(monkeypatch, tmp_path):
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    plugin.PersistentKV(tmp_path / plugin.KV_FILENAME).set(
        plugin._cache_key("sk_one"),
        {"payload": {"data": [{"id": "only-for-one"}]}, "stored_at": time.time()},
    )
    monkeypatch.setattr(plugin.llm, "get_key", lambda *a, **k: "sk_two")
    monkeypatch.setattr(plugin.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("offline")))

    with pytest.raises(plugin.DownloadError):
        plugin.get_pollinations_models()


def test_malformed_key_value_store_is_replaced(monkeypatch, tmp_path):
    cache = tmp_path / plugin.KV_FILENAME
    cache.write_text("not json")
    catalog = {"data": [{"id": "openai/recovered"}]}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return catalog

    monkeypatch.setattr(plugin.llm, "get_key", lambda *a, **k: "sk_test")
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(plugin.httpx, "get", lambda *a, **k: FakeResponse())
    assert plugin.get_pollinations_models() == catalog["data"]
    assert json.loads(cache.read_text())[plugin._cache_key("sk_test")]["payload"] == catalog


def test_registration_namespaces_ids_without_hardcoded_list(monkeypatch, tmp_path):
    catalog = {
        "data": [
            {
                "id": "openai/gpt-5.4-nano",
                "output_modalities": ["text"],
                "supported_endpoints": ["/v1/chat/completions"],
                "input_modalities": ["text", "image"],
                "capabilities": ["tool_calling"],
                "tools": True,
            },
            {
                "id": "some/image-model",
                "output_modalities": ["image"],
                "supported_endpoints": ["/v1/images/generations"],
                "input_modalities": ["text"],
                "capabilities": [],
            },
            {
                "id": "embedding-model",
                "output_modalities": ["text"],
                "supported_endpoints": ["/v1/embeddings"],
            },
            {
                "id": "openai/gpt-5.4-nano",
                "output_modalities": ["text"],
                "supported_endpoints": ["/v1/chat/completions"],
            },
            None,
            "malformed",
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
    assert len(registered) == 2  # sync + async; duplicate/non-chat entries skipped
    assert [model.model_id for model in registered] == [
        "pollinations/openai/gpt-5.4-nano",
        "pollinations/openai/gpt-5.4-nano",
    ]
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
    old = time.time() - plugin.CACHE_TIMEOUT_SECONDS - 10
    cache = tmp_path / plugin.KV_FILENAME
    cache.write_text(
        json.dumps(
            {
                plugin._cache_key("sk_test"): {
                    "payload": stale,
                    "stored_at": old,
                }
            }
        )
    )

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(plugin.llm, "get_key", lambda *a, **k: "sk_test")
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(plugin.httpx, "get", boom)
    assert plugin.get_pollinations_models() == stale["data"]
    # A forced refresh must not silently report success from stale data.
    with pytest.raises(plugin.DownloadError):
        plugin.get_pollinations_models(skip_cache=True)


def test_invalid_catalog_entries_are_ignored():
    assert plugin.is_compatible_text_model(None) is False
    assert plugin.is_compatible_text_model("not-a-model") is False
    assert plugin.is_compatible_text_model({"id": "text-model", "category": "text"}) is True
    assert plugin.is_compatible_text_model(
        {"id": "embedding", "output_modalities": ["text"], "supported_endpoints": ["/v1/embeddings"]}
    ) is False
    assert plugin.is_compatible_text_model(
        {"id": "chat", "output_modalities": ["text"], "supported_endpoints": ["/v1/chat/completions"]}
    ) is True
