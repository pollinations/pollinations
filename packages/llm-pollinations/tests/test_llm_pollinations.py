import json
import os
import time

import pytest

import llm_pollinations as plugin


def model(model_id="openai/test", **values):
    item = {
        "id": model_id,
        "category": "text",
        "supported_endpoints": ["/v1/chat/completions"],
        "output_modalities": ["text"],
        "input_modalities": ["text"],
    }
    item.update(values)
    return item


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


def test_catalog_is_authenticated_cached_and_key_scoped(tmp_path, monkeypatch):
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args: "sk_one")
    calls = []

    def get(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse({"data": [model()]})

    monkeypatch.setattr(plugin.httpx, "get", get)
    assert plugin.get_pollinations_models() == [model()]
    assert plugin.get_pollinations_models() == [model()]
    assert len(calls) == 1
    assert calls[0][1]["headers"] == {"Authorization": "Bearer sk_one"}
    assert plugin._cache_path("sk_one") != plugin._cache_path("sk_two")
    assert "sk_one" not in plugin._cache_path("sk_one").name


def test_stale_cache_fallback_and_forced_refresh_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args: "sk_test")
    path = plugin._cache_path("sk_test")
    path.write_text(json.dumps([model("cached")]), encoding="utf-8")
    old = time.time() - plugin.CACHE_SECONDS - 1
    os.utime(path, (old, old))

    monkeypatch.setattr(plugin.httpx, "get", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
    assert plugin.get_pollinations_models() == [model("cached")]
    with pytest.raises(plugin.DownloadError):
        plugin.get_pollinations_models(skip_cache=True)


def test_registration_filters_deduplicates_and_maps_capabilities(monkeypatch):
    catalog = [
        model("openai/test", input_modalities=["text", "image"], tools=True, reasoning=True),
        model("openai/test"),
        model("no-chat", supported_endpoints=["/v1/responses"]),
        model("image", category="image"),
        None,
        "malformed",
    ]
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args: "sk_test")
    monkeypatch.setattr(plugin, "get_pollinations_models", lambda: catalog)
    registered = []
    plugin.register_models(lambda *items: registered.extend(items))

    assert len(registered) == 2
    sync, async_ = registered
    assert isinstance(sync, plugin.PollinationsChat)
    assert isinstance(async_, plugin.PollinationsAsyncChat)
    assert sync.model_id == async_.model_id == "pollinations/openai/test"
    assert sync.model_name == "openai/test"
    assert sync.vision is True
    assert sync.supports_tools is True
    assert "reasoning_effort" in sync.Options.model_fields


def test_invalid_catalog_entries_are_rejected():
    assert plugin.is_compatible_text_model(None) is False
    assert plugin.is_compatible_text_model("malformed") is False
    assert plugin.is_compatible_text_model({"id": "embedding", "category": "text", "supported_endpoints": ["/v1/embeddings"]}) is False
    assert plugin.is_compatible_text_model({"id": "image", "category": "image", "output_modalities": ["text"]}) is False
    assert plugin.is_compatible_text_model({"id": "chat", "category": "text"}) is True


def test_registration_requires_a_key(monkeypatch):
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args: None)
    monkeypatch.setattr(plugin, "get_pollinations_models", lambda: pytest.fail("catalog should not load"))
    registered = []
    plugin.register_models(lambda *items: registered.extend(items))
    assert registered == []
