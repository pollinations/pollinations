import httpx
import llm
import pytest
from llm.default_plugins.openai_models import AsyncChat, Chat

import llm_pollinations as plugin


def model(model_id="openai/test", **values):
    item = {
        "id": model_id,
        "category": "text",
        "supported_endpoints": ["/v1/chat/completions"],
        "input_modalities": ["text"],
        "output_modalities": ["text"],
    }
    item.update(values)
    return item


def response(status, data):
    request = httpx.Request("GET", plugin.MODELS_URL)
    return httpx.Response(status, json=data, request=request)


def test_reuses_llm_openai_compatible_models():
    assert issubclass(plugin.PollinationsChat, Chat)
    assert issubclass(plugin.PollinationsAsyncChat, AsyncChat)
    assert "execute" not in plugin.PollinationsChat.__dict__
    assert plugin.PollinationsChat.needs_key == "pollinations"
    assert plugin.PollinationsChat.key_env_var == "POLLINATIONS_API_KEY"


def test_catalog_is_authenticated_and_fetched_each_time(monkeypatch):
    calls = []

    def get(url, **kwargs):
        calls.append((url, kwargs))
        return response(200, {"data": [model(str(len(calls)))]})

    monkeypatch.setattr(plugin.httpx, "get", get)
    assert plugin.fetch_models("sk_one") == [model("1")]
    assert plugin.fetch_models("sk_one") == [model("2")]
    assert len(calls) == 2
    assert all(url == plugin.MODELS_URL for url, _ in calls)
    assert calls[0][1]["headers"] == {"Authorization": "Bearer sk_one"}


@pytest.mark.parametrize("payload", [{"data": None}, []])
def test_catalog_requires_model_list(monkeypatch, payload):
    monkeypatch.setattr(
        plugin.httpx, "get", lambda *args, **kwargs: response(200, payload)
    )
    with pytest.raises(ValueError, match="Unexpected Pollinations model catalog"):
        plugin.fetch_models("sk_test")


@pytest.mark.parametrize("failure", [httpx.ConnectError("offline"), 401, 503])
def test_catalog_failure_does_not_break_plugin_registration(monkeypatch, failure):
    def fail(*args, **kwargs):
        if isinstance(failure, int):
            return response(failure, {"error": "temporary"})
        raise failure

    monkeypatch.setattr(plugin.httpx, "get", fail)
    with pytest.raises(httpx.HTTPError):
        plugin.fetch_models("sk_test")
    monkeypatch.setattr(plugin.llm, "get_key", lambda *args: "sk_test")
    registered = []
    plugin.register_models(lambda *items: registered.extend(items))
    assert registered == []


def test_registration_isolates_bad_records_and_maps_capabilities(monkeypatch):
    catalog = [
        model("bad-endpoints", supported_endpoints=True),
        model("bad-inputs", input_modalities=1),
        model("bad-outputs", output_modalities=None),
        model(
            "openai/test",
            input_modalities=["text", "image"],
            tools=True,
            reasoning=True,
        ),
        model("openai/test"),
        model("responses-only", supported_endpoints=["/v1/responses"]),
        model("image", category="image", output_modalities=["image"]),
        None,
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


def test_filter_uses_endpoint_and_text_output_not_category():
    assert plugin._is_chat_model(model(category=None, input_modalities=["image"]))
    assert not plugin._is_chat_model(model(output_modalities=["audio"]))


def test_registration_requires_key(monkeypatch):
    monkeypatch.setattr(llm, "get_key", lambda *args: None)
    monkeypatch.setattr(
        plugin, "fetch_models", lambda key: pytest.fail("catalog should not load")
    )
    registered = []
    plugin.register_models(lambda *items: registered.extend(items))
    assert registered == []
