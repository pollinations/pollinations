import json
import os
import time

import httpx
import llm
import pytest

import llm_pollinations as lp


def make_model(**overrides):
    model = {
        "id": "openai/gpt-5-nano",
        "category": "text",
        "output_modalities": ["text"],
        "input_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": ["tool_calling"],
    }
    model.update(overrides)
    return model


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_text_model_requires_chat_completions():
    assert lp._is_text_model(make_model())
    # Transcription/realtime models without the chat endpoint are excluded
    assert not lp._is_text_model(
        make_model(id="x/whisper", supported_endpoints=["/v1/audio/transcriptions"])
    )


def test_non_text_models_excluded():
    assert not lp._is_text_model(make_model(category="image", output_modalities=["image"]))
    assert not lp._is_text_model(make_model(output_modalities=["image"], category=None))


def test_capability_from_capabilities_list():
    assert lp._has_capability(make_model(capabilities=["tool_calling", "reasoning"]), "reasoning")
    assert lp._has_capability(make_model(capabilities=["tool_calling"]), "tool_calling")
    assert not lp._has_capability(make_model(capabilities=[]), "tool_calling")


def test_capability_from_top_level_flag():
    assert lp._has_capability(make_model(reasoning=True), "reasoning")
    assert not lp._has_capability(make_model(reasoning=False), "reasoning")


def test_vision_from_input_modalities():
    assert lp._supports_images(make_model(input_modalities=["text", "image"]))
    assert not lp._supports_images(make_model(input_modalities=["text"]))


def test_register_models_registers_sync_and_async(monkeypatch):
    monkeypatch.setattr(llm, "get_key", lambda *args, **kwargs: "sk_test")
    monkeypatch.setattr(
        lp,
        "get_catalog",
        lambda key, skip_cache=False: [
            make_model(),
            make_model(),  # duplicate id
            make_model(id="x/vision", input_modalities=["text", "image"], reasoning=True),
        ],
    )
    registered = []
    lp.register_models(lambda *ms: registered.extend(ms))
    ids = {m.model_id for m in registered}
    assert ids == {"pollinations/openai/gpt-5-nano", "pollinations/x/vision"}
    # sync + async pair for every model, duplicates skipped
    assert len(registered) == 4
    types = {(m.model_id, type(m).__name__) for m in registered}
    assert ("pollinations/openai/gpt-5-nano", "PollinationsChat") in types
    assert ("pollinations/openai/gpt-5-nano", "PollinationsAsyncChat") in types
    vision = next(m for m in registered if m.model_id == "pollinations/x/vision")
    assert vision.vision is True
    # reasoning via top-level flag yields a reasoning_effort option
    assert "reasoning_effort" in vision.Options.model_fields


def test_no_key_registers_nothing(monkeypatch):
    monkeypatch.setattr(llm, "get_key", lambda *args, **kwargs: "")
    registered = []
    lp.register_models(lambda *ms: registered.extend(ms))
    assert registered == []


def test_get_catalog_filters_and_caches(monkeypatch, tmp_path):
    monkeypatch.setattr(lp.llm, "user_dir", lambda: tmp_path)

    payload = {"data": [make_model(), make_model(id="x/image-only", category="image", output_modalities=["image"])]}
    calls = {}

    def fake_get(url, headers=None, **kwargs):
        calls["url"] = url
        calls["headers"] = headers
        return FakeResponse(payload)

    monkeypatch.setattr(httpx, "get", fake_get)
    models = lp.get_catalog("sk_test", skip_cache=True)
    assert [m["id"] for m in models] == ["openai/gpt-5-nano"]
    assert calls["url"] == lp.CATALOG_URL
    assert calls["headers"] == {"Authorization": "Bearer sk_test"}
    assert (tmp_path / "pollinations_models.json").is_file()

    # Within the cache window the network is not hit again
    def exploding_get(*args, **kwargs):
        raise AssertionError("network should not be hit")

    monkeypatch.setattr(httpx, "get", exploding_get)
    assert lp.get_catalog("sk_test") == models


def test_get_catalog_stale_cache_fallback(monkeypatch, tmp_path):
    monkeypatch.setattr(lp.llm, "user_dir", lambda: tmp_path)
    cache = tmp_path / "pollinations_models.json"
    cache.write_text(json.dumps([make_model(id="x/stale")]))
    old = time.time() - lp.CACHE_TIMEOUT - 10
    os.utime(cache, (old, old))

    def failing_get(*args, **kwargs):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(httpx, "get", failing_get)
    assert [m["id"] for m in lp.get_catalog("sk_test")] == ["x/stale"]


def test_get_catalog_error_without_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(lp.llm, "user_dir", lambda: tmp_path)

    def failing_get(*args, **kwargs):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(httpx, "get", failing_get)
    with pytest.raises(lp.CatalogError):
        lp.get_catalog("sk_test", skip_cache=True)
