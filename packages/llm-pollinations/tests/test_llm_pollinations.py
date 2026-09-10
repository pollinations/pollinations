import json
import os
import time
from pathlib import Path

import httpx
import llm
import pytest
from llm_pollinations import (
    CACHE_FILENAME,
    get_pollinations_models,
    is_chat_model,
    register_models,
    supports_reasoning,
    supports_tools,
    supports_vision,
)

TEXT_MODEL = {
    "id": "openai",
    "category": "text",
    "input_modalities": ["text", "image"],
    "supported_endpoints": ["/v1/chat/completions"],
    "capabilities": ["tool_calling", "reasoning"],
    "tools": True,
    "reasoning": True,
}

TEXT_ONLY_MODEL = {
    "id": "mistral",
    "category": "text",
    "input_modalities": ["text"],
    "supported_endpoints": ["/v1/chat/completions"],
    "capabilities": [],
}

IMAGE_MODEL = {
    "id": "flux",
    "category": "image",
    "input_modalities": ["text", "image"],
    "supported_endpoints": ["/image/{prompt}"],
    "capabilities": [],
}

PAYLOAD = {"object": "list", "data": [TEXT_MODEL, TEXT_ONLY_MODEL, IMAGE_MODEL]}


def _stub_catalog(monkeypatch, payload, calls=None):
    def fake_get(url, headers=None, follow_redirects=True, timeout=30):
        if calls is not None:
            calls.append({"url": url, "headers": headers})

        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return payload

        return FakeResponse()

    monkeypatch.setattr(httpx, "get", fake_get)


def test_registers_text_chat_models_with_pollinations_prefix(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(llm, "get_key", lambda *args: "sk-test")
    monkeypatch.setattr(llm, "user_dir", lambda: tmp_path)
    _stub_catalog(monkeypatch, PAYLOAD)

    registered = []
    register_models(lambda *models: registered.extend(models))

    assert len(registered) == 4  # sync + async class per model
    ids = [model.model_id for model in registered]
    assert ids == [
        "pollinations/openai",
        "pollinations/openai",
        "pollinations/mistral",
        "pollinations/mistral",
    ]
    assert all(model.model_name in ("openai", "mistral") for model in registered)


def test_capability_flags_come_from_the_catalog(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "get_key", lambda *args: "sk-test")
    monkeypatch.setattr(llm, "user_dir", lambda: tmp_path)
    _stub_catalog(monkeypatch, PAYLOAD)

    registered = []
    register_models(lambda *models: registered.extend(models))
    by_id = {model.model_id: model for model in registered}

    assert by_id["pollinations/openai"].vision is True
    assert by_id["pollinations/openai"].supports_tools is True
    assert by_id["pollinations/openai"].reasoning is True
    assert by_id["pollinations/mistral"].vision is False
    assert by_id["pollinations/mistral"].supports_tools is False
    assert by_id["pollinations/mistral"].reasoning is False


def test_skips_registration_without_key(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "get_key", lambda *args: None)
    monkeypatch.setattr(llm, "user_dir", lambda: tmp_path)
    calls = []
    _stub_catalog(monkeypatch, PAYLOAD, calls=calls)

    registered = []
    register_models(lambda *models: registered.extend(models))

    assert registered == []
    assert calls == []


def test_excludes_non_chat_models():
    assert is_chat_model(TEXT_MODEL) is True
    assert is_chat_model(IMAGE_MODEL) is False
    assert is_chat_model({**TEXT_ONLY_MODEL, "supported_endpoints": []}) is False
    assert supports_vision(TEXT_MODEL) is True
    assert supports_vision(TEXT_ONLY_MODEL) is False
    assert supports_tools(TEXT_MODEL) is True
    assert supports_tools(TEXT_ONLY_MODEL) is False
    assert supports_reasoning(TEXT_MODEL) is True
    assert supports_reasoning(TEXT_ONLY_MODEL) is False


def test_catalog_uses_cache_and_falls_back_to_stale_file(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(llm, "user_dir", lambda: tmp_path)
    calls = []
    _stub_catalog(monkeypatch, PAYLOAD, calls=calls)

    first = get_pollinations_models(key="sk-test")
    second = get_pollinations_models(key="sk-test")
    assert first == second == PAYLOAD["data"]
    assert len(calls) == 1
    assert calls[0]["url"] == "https://gen.pollinations.ai/v1/models"
    assert calls[0]["headers"] == {"Authorization": "Bearer sk-test"}

    # Make the cache stale, then break the network: stale file must win.
    cache_file = tmp_path / CACHE_FILENAME
    old_mtime = time.time() - 7200
    os.utime(cache_file, (old_mtime, old_mtime))

    def failing_get(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx, "get", failing_get)
    assert get_pollinations_models(key="sk-test") == PAYLOAD["data"]


def test_pyproject_registers_llm_entry_point():
    tomllib = pytest.importorskip("tomllib")
    pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
    data = tomllib.loads(pyproject.read_text())
    assert data["project"]["name"] == "llm-pollinations"
    assert data["project"]["entry-points"]["llm"]["pollinations"] == (
        "llm_pollinations"
    )


def test_catalog_payload_shape():
    assert set(PAYLOAD.keys()) == {"object", "data"}
    assert isinstance(PAYLOAD["data"], list)
    assert json.loads(json.dumps(PAYLOAD)) == PAYLOAD
