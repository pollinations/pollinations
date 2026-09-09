import json
import time

import httpx
import llm
import pytest

import llm_pollinations as mod

TEXT_MODEL = {
    "id": "openai/gpt-5.4-nano",
    "category": "text",
    "supported_endpoints": ["/v1/chat/completions", "/text"],
    "input_modalities": ["text", "image"],
    "tools": True,
    "reasoning": False,
}
NON_CHAT_TEXT_MODEL = {
    "id": "some/embedding-model",
    "category": "text",
    "supported_endpoints": ["/v1/embeddings"],
}
IMAGE_MODEL = {
    "id": "black-forest-labs/flux",
    "category": "image",
    "supported_endpoints": ["/v1/chat/completions", "/v1/images/generations"],
}


def test_is_chat_model():
    assert mod.is_chat_model(TEXT_MODEL) is True
    assert mod.is_chat_model(NON_CHAT_TEXT_MODEL) is False
    assert mod.is_chat_model(IMAGE_MODEL) is False


def test_supports_images():
    assert mod.supports_images(TEXT_MODEL) is True
    assert mod.supports_images(NON_CHAT_TEXT_MODEL) is False


def test_fetch_cached_json_writes_and_reuses_cache(tmp_path, monkeypatch):
    calls = []

    def fake_get(url, headers=None, timeout=None, follow_redirects=None):
        calls.append(url)
        return httpx.Response(200, json={"data": [TEXT_MODEL]}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    path = tmp_path / "models.json"

    first = mod.fetch_cached_json(mod.MODELS_URL, path, cache_timeout=3600)
    second = mod.fetch_cached_json(mod.MODELS_URL, path, cache_timeout=3600)

    assert first == second == {"data": [TEXT_MODEL]}
    assert len(calls) == 1


def test_fetch_cached_json_falls_back_to_stale_cache_on_error(tmp_path, monkeypatch):
    path = tmp_path / "models.json"
    path.write_text(json.dumps({"data": [TEXT_MODEL]}))
    old_time = time.time() - 10000
    import os

    os.utime(path, (old_time, old_time))

    def failing_get(url, headers=None, timeout=None, follow_redirects=None):
        raise httpx.ConnectError("boom", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", failing_get)

    result = mod.fetch_cached_json(mod.MODELS_URL, path, cache_timeout=3600)
    assert result == {"data": [TEXT_MODEL]}


def test_fetch_cached_json_raises_without_cache_or_network(tmp_path, monkeypatch):
    path = tmp_path / "models.json"

    def failing_get(url, headers=None, timeout=None, follow_redirects=None):
        raise httpx.ConnectError("boom", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", failing_get)

    with pytest.raises(mod.DownloadError):
        mod.fetch_cached_json(mod.MODELS_URL, path, cache_timeout=3600)


def test_register_models_skips_when_no_key(monkeypatch):
    monkeypatch.setattr(llm, "get_key", lambda *a, **k: None)
    registered = []
    mod.register_models(lambda *models: registered.extend(models))
    assert registered == []


def test_register_models_registers_chat_models_only(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "get_key", lambda *a, **k: "sk_test")
    monkeypatch.setattr(mod, "CACHE_PATH", tmp_path / "models.json")
    monkeypatch.setattr(
        mod,
        "get_pollinations_models",
        lambda key: [TEXT_MODEL, NON_CHAT_TEXT_MODEL, IMAGE_MODEL],
    )

    registered = []
    mod.register_models(lambda *models: registered.extend(models))

    assert len(registered) == 2
    chat_model, async_chat_model = registered
    assert isinstance(chat_model, mod.PollinationsChat)
    assert isinstance(async_chat_model, mod.PollinationsAsyncChat)
    assert chat_model.model_id == "pollinations/openai/gpt-5.4-nano"
    assert chat_model.model_name == "openai/gpt-5.4-nano"
    assert chat_model.vision is True
    assert chat_model.supports_tools is True
    assert chat_model.needs_key == "pollinations"
    assert chat_model.key_env_var == "POLLINATIONS_API_KEY"


def test_register_models_deduplicates_ids(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "get_key", lambda *a, **k: "sk_test")
    monkeypatch.setattr(mod, "CACHE_PATH", tmp_path / "models.json")
    monkeypatch.setattr(
        mod,
        "get_pollinations_models",
        lambda key: [TEXT_MODEL, dict(TEXT_MODEL)],
    )

    registered = []
    mod.register_models(lambda *models: registered.extend(models))

    assert len(registered) == 2
