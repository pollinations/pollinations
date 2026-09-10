import json
import os
import time

import httpx
import llm
import pytest

from llm_pollinations import (
    PollinationsAsyncChat,
    PollinationsChat,
    chat_models,
    fetch_catalog,
    model_kwargs,
    register_models,
)

CATALOG = [
    {
        "id": "acme/alpha",
        "output_modalities": ["text"],
        "input_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": ["tool_calling"],
    },
    {
        "id": "acme/beta",
        "output_modalities": ["text"],
        "input_modalities": ["text", "image"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": ["tool_calling", "reasoning"],
    },
    {
        # Audio model: no chat completions endpoint, no text output
        "id": "acme/voice",
        "output_modalities": ["audio"],
        "input_modalities": ["text"],
        "supported_endpoints": ["/v1/audio/speech"],
        "capabilities": [],
    },
    {
        # Text model that cannot chat
        "id": "acme/notchat",
        "output_modalities": ["text"],
        "input_modalities": ["text"],
        "supported_endpoints": ["/text"],
        "capabilities": [],
    },
]


def test_chat_models_keeps_only_chat_models():
    assert [m["id"] for m in chat_models(CATALOG)] == ["acme/alpha", "acme/beta"]


def test_model_kwargs_advertises_only_catalog_capabilities():
    assert model_kwargs(CATALOG[1]) == {
        "model_id": "pollinations/acme/beta",
        "model_name": "acme/beta",
        "vision": True,
        "reasoning": True,
        "supports_tools": True,
        "supports_schema": False,
        "can_stream": True,
        "api_base": "https://gen.pollinations.ai/v1",
    }
    plain = model_kwargs(CATALOG[0])
    assert not plain["vision"]
    assert not plain["reasoning"]
    assert plain["supports_tools"]
    assert not plain["supports_schema"]


def test_register_models_registers_sync_and_async(monkeypatch):
    monkeypatch.setattr(llm, "get_key", lambda *args, **kwargs: "test-key")
    monkeypatch.setattr(
        "llm_pollinations.fetch_catalog", lambda skip_cache=False: CATALOG
    )
    registered = []

    register_models(lambda *models: registered.extend(models))

    sync = {m.model_id: m for m in registered if isinstance(m, PollinationsChat)}
    async_ = {
        m.model_id: m for m in registered if isinstance(m, PollinationsAsyncChat)
    }
    assert set(sync) == {"pollinations/acme/alpha", "pollinations/acme/beta"}
    assert set(async_) == set(sync)
    assert len(registered) == 2 * len(sync)  # sync + async for each model
    beta = sync["pollinations/acme/beta"]
    assert beta.needs_key == "pollinations"
    assert beta.key_env_var == "POLLINATIONS_API_KEY"
    assert str(beta) == "Pollinations: pollinations/acme/beta"


def test_register_models_without_key_registers_nothing(monkeypatch):
    monkeypatch.setattr(llm, "get_key", lambda *args, **kwargs: "")

    def fail(*args, **kwargs):
        raise AssertionError("catalog should not be fetched without a key")

    monkeypatch.setattr("llm_pollinations.fetch_catalog", fail)
    registered = []
    register_models(lambda *models: registered.extend(models))
    assert registered == []


@pytest.fixture
def cache_path(tmp_path, monkeypatch):
    path = tmp_path / "pollinations_models.json"
    monkeypatch.setattr("llm_pollinations.CACHE_PATH", path)
    return path


def test_fetch_catalog_uses_fresh_cache(cache_path, monkeypatch):
    cache_path.write_text(json.dumps(CATALOG))

    def explode(*args, **kwargs):
        raise AssertionError("a fresh cache should not be refetched")

    monkeypatch.setattr(httpx, "get", explode)
    assert fetch_catalog() == CATALOG


def test_fetch_catalog_ignores_fresh_cache_with_skip_cache(cache_path, monkeypatch):
    cache_path.write_text(json.dumps([{"id": "cached/one"}]))
    monkeypatch.setattr(llm, "get_key", lambda *args, **kwargs: "k")

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": CATALOG}

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: Response())
    assert fetch_catalog(skip_cache=True) == CATALOG


def test_fetch_catalog_falls_back_to_stale(cache_path, monkeypatch):
    cache_path.write_text(json.dumps(CATALOG))
    old = time.time() - 7200
    os.utime(cache_path, (old, old))
    monkeypatch.setattr(llm, "get_key", lambda *args, **kwargs: "")

    def fail(*args, **kwargs):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(httpx, "get", fail)
    assert fetch_catalog() == CATALOG


def test_fetch_catalog_fetches_and_caches(cache_path, monkeypatch):
    monkeypatch.setattr(llm, "get_key", lambda *args, **kwargs: "secret")

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": CATALOG}

    seen = {}

    def fake_get(url, headers=None, **kwargs):
        seen["url"] = url
        seen["headers"] = headers
        return Response()

    monkeypatch.setattr(httpx, "get", fake_get)
    assert fetch_catalog() == CATALOG
    assert json.loads(cache_path.read_text()) == CATALOG
    assert seen["url"] == "https://gen.pollinations.ai/v1/models"
    assert seen["headers"] == {"Authorization": "Bearer secret"}
