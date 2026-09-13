import json
from types import SimpleNamespace

import httpx
import llm
import llm_pollinations
from llm_pollinations import _is_text_model, fetch_models


def test_catalog_filter_requires_text_modalities():
    base = {
        "id": "provider/model",
        "category": "text",
        "input_modalities": ["text"],
        "output_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
    }
    assert _is_text_model(base)
    assert not _is_text_model({**base, "output_modalities": ["image"]})
    assert not _is_text_model({**base, "category": "embedding"})


def test_fetch_models_sends_key_and_caches(monkeypatch, tmp_path):
    requests = []

    def handler(*args, **kwargs):
        requests.append(kwargs)
        return httpx.Response(
            200,
            json={"data": [{"id": "model"}]},
            request=httpx.Request("GET", "https://gen.pollinations.ai/v1/models"),
        )

    monkeypatch.setattr(httpx, "get", handler)
    path = tmp_path / "models.json"
    assert fetch_models("secret", cache_path=path) == [{"id": "model"}]
    assert requests[0]["headers"]["Authorization"] == "Bearer secret"
    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError()))
    assert fetch_models("secret", cache_path=path) == [{"id": "model"}]


def test_fetch_models_uses_stale_cache_on_failure(monkeypatch, tmp_path):
    path = tmp_path / "models.json"
    path.write_text(json.dumps({"data": [{"id": "stale"}]}))
    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: (_ for _ in ()).throw(httpx.ConnectError("offline")))
    assert fetch_models("secret", cache_path=path, cache_seconds=0) == [{"id": "stale"}]


def test_register_models_uses_catalog_capabilities_and_skips_collisions(monkeypatch):
    definition = {
        "id": "community/vision-tools",
        "category": "text",
        "input_modalities": ["text", "image"],
        "output_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": ["reasoning", "tools"],
    }
    monkeypatch.setattr(llm, "get_key", lambda *args: "secret")
    monkeypatch.setattr(llm_pollinations, "fetch_models", lambda key: [definition])
    registered = []
    llm_pollinations.register_models(
        lambda *models: registered.append(models),
        [SimpleNamespace(model=SimpleNamespace(model_id="already/there"))],
    )
    model, async_model = registered[0]
    assert model.model_id == "pollinations/community/vision-tools"
    assert model.model_name == "community/vision-tools"
    assert model.vision is True
    assert "reasoning_effort" in model.Options.model_fields
    assert model.supports_tools is True
    assert async_model.model_id == model.model_id
