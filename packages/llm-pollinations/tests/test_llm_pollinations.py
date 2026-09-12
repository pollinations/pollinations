import json
import os
import time

import httpx
import pytest

import llm_pollinations as plugin


def model(model_id="openai/test", **values):
    item = {
        "id": model_id,
        "category": "text",
        "supported_endpoints": ["/v1/chat/completions"],
        "input_modalities": ["text"],
    }
    item.update(values)
    return item


def response(status, data):
    request = httpx.Request("GET", plugin.MODELS_URL)
    return httpx.Response(status, json=data, request=request)


def test_catalog_is_authenticated_cached_and_key_scoped(tmp_path, monkeypatch):
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    calls = []

    def get(url, **kwargs):
        calls.append((url, kwargs))
        return response(200, {"data": [model()]})

    monkeypatch.setattr(plugin.httpx, "get", get)
    assert plugin.fetch_models("sk_one") == [model()]
    assert plugin.fetch_models("sk_one") == [model()]
    assert len(calls) == 1
    assert calls[0][1]["headers"] == {"Authorization": "Bearer sk_one"}
    assert calls[0][1]["timeout"] == 10
    assert plugin._cache_path("sk_one") != plugin._cache_path("sk_two")
    assert "sk_one" not in plugin._cache_path("sk_one").name


@pytest.mark.parametrize("failure", [httpx.ConnectError("offline"), 503])
def test_stale_cache_fallback(tmp_path, monkeypatch, failure):
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    path = plugin._cache_path("sk_test")
    path.write_text(json.dumps([model("cached")]), encoding="utf-8")
    old = time.time() - plugin.CACHE_SECONDS - 1
    os.utime(path, (old, old))

    def fail(*args, **kwargs):
        if isinstance(failure, int):
            return response(failure, {"error": "temporary"})
        raise failure

    monkeypatch.setattr(plugin.httpx, "get", fail)
    assert plugin.fetch_models("sk_test") == [model("cached")]


def test_authentication_failure_does_not_use_stale_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(plugin.llm, "user_dir", lambda: tmp_path)
    path = plugin._cache_path("sk_test")
    path.write_text(json.dumps([model("cached")]), encoding="utf-8")
    os.utime(path, (0, 0))
    monkeypatch.setattr(
        plugin.httpx,
        "get",
        lambda *args, **kwargs: response(401, {"error": "invalid key"}),
    )
    with pytest.raises(httpx.HTTPStatusError):
        plugin.fetch_models("sk_test")


def test_registration_filters_namespaces_and_maps_capabilities(monkeypatch):
    catalog = [
        model("bad-endpoints", supported_endpoints=True),
        model("bad-modalities", input_modalities=1),
        model(
            "openai/test",
            input_modalities=["text", "image"],
            tools=True,
            reasoning=True,
        ),
        model("openai/test"),
        model("no-chat", supported_endpoints=["/v1/responses"]),
        model("image", category="image"),
        {"category": "text", "supported_endpoints": ["/v1/chat/completions"]},
    ]
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args: "sk_test")
    monkeypatch.setattr(plugin, "fetch_models", lambda key: catalog)
    registered = []
    plugin.register_models(lambda *items: registered.extend(items))

    assert len(registered) == 2
    sync, async_ = registered
    assert isinstance(sync, plugin.PollinationsChat)
    assert isinstance(async_, plugin.PollinationsAsyncChat)
    assert sync.model_id == async_.model_id == "pollinations/openai/test"
    assert sync.model_name == "openai/test"
    assert sync.api_base == plugin.API_BASE
    assert sync.vision and sync.supports_tools
    assert "reasoning_effort" in sync.Options.model_fields


def test_registration_requires_a_key(monkeypatch):
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args: None)
    monkeypatch.setattr(
        plugin, "fetch_models", lambda key: pytest.fail("catalog should not load")
    )
    registered = []
    plugin.register_models(lambda *items: registered.extend(items))
    assert registered == []
