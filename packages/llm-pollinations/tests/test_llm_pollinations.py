import json

import pytest

import llm_pollinations as plugin


def entry(model_id, **overrides):
    base = {
        "id": model_id,
        "category": "text",
        "input_modalities": ["text"],
        "output_modalities": ["text"],
    }
    base.update(overrides)
    return base


def test_chat_model_filtering():
    assert plugin.is_chat_model(entry("a")) is True
    assert plugin.is_chat_model(entry("b", category="image")) is False
    assert (
        plugin.is_chat_model(entry("c", output_modalities=["audio"]))
        is False
    )
    # Missing category cannot be confirmed as chat — excluded, not guessed.
    assert plugin.is_chat_model({"id": "d"}) is False


def test_capability_flags_come_from_catalog():
    vision = entry("v", input_modalities=["text", "image"])
    assert plugin.supports_vision(vision) is True
    assert plugin.supports_vision(entry("t")) is False
    assert plugin.supports_tools(entry("x", tools=True)) is True
    assert plugin.supports_tools(entry("x")) is False
    assert plugin.supports_reasoning(entry("x", reasoning=True)) is True
    assert plugin.supports_reasoning(entry("x")) is False


def test_fetch_models_uses_fresh_cache(tmp_path, monkeypatch):
    cache = tmp_path / "models.json"
    cache.write_text(
        json.dumps({"models": [entry("cached-model")]}), encoding="utf-8"
    )
    monkeypatch.setattr(plugin, "_cache_path", lambda: cache)

    def boom(*args, **kwargs):
        raise AssertionError("network should not be touched")

    monkeypatch.setattr(plugin.httpx, "get", boom)
    assert plugin.fetch_models("sk_test") == [entry("cached-model")]


def test_fetch_models_stale_fallback(tmp_path, monkeypatch):
    import time

    cache = tmp_path / "models.json"
    cache.write_text(
        json.dumps({"models": [entry("old-model")]}), encoding="utf-8"
    )
    old = time.time() - plugin.CACHE_TIMEOUT - 10
    import os

    os.utime(cache, (old, old))
    monkeypatch.setattr(plugin, "_cache_path", lambda: cache)

    def fail(*args, **kwargs):
        raise ConnectionError("offline")

    monkeypatch.setattr(plugin.httpx, "get", fail)
    assert plugin.fetch_models("sk_test") == [entry("old-model")]


def test_fetch_models_raises_without_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(
        plugin, "_cache_path", lambda: tmp_path / "missing.json"
    )

    def fail(*args, **kwargs):
        raise ConnectionError("offline")

    monkeypatch.setattr(plugin.httpx, "get", fail)
    with pytest.raises(ConnectionError):
        plugin.fetch_models("sk_test")


def test_register_models_skips_duplicates_and_non_chat(monkeypatch):
    catalog = [
        entry("openai", **{"aliases": ["gpt-5.4-nano"]}),
        entry("openai"),
        entry("img", category="image"),
        {"id": "", "category": "text"},
        "not-a-dict",
    ]
    monkeypatch.setattr(plugin, "fetch_models", lambda key: catalog)
    monkeypatch.setattr(
        plugin.llm, "get_key", lambda *args, **kwargs: "sk_test"
    )
    registered = []
    seen_aliases = []

    def collect(model, async_model=None, aliases=None):
        registered.extend([model, async_model])
        seen_aliases.extend(aliases or [])

    plugin.register_models(collect)
    assert len(registered) == 2  # Chat + AsyncChat for one model
    assert registered[0].model_id == "pollinations/openai"
    assert isinstance(registered[0], plugin.PollinationsChat)
    assert isinstance(registered[1], plugin.PollinationsAsyncChat)
    assert "pollinations/gpt-5.4-nano" in seen_aliases


def test_register_models_needs_key(monkeypatch):
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args, **kwargs: "")
    registered = []
    plugin.register_models(registered.append)
    assert registered == []


def test_model_classes_point_at_pollinations():
    chat = plugin.PollinationsChat(
        "pollinations/openai", api_base=plugin.API_BASE
    )
    assert chat.api_base == "https://gen.pollinations.ai/v1"
    assert chat.needs_key == "pollinations"
    assert chat.key_env_var == "POLLINATIONS_API_KEY"
