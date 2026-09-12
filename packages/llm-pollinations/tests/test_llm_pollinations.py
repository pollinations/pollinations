"""Tests for llm-pollinations plugin."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request

import llm
import pytest

from llm_pollinations import (
    _cache_path,
    _fetch_models,
    _has_reasoning,
    _has_tools,
    _has_vision,
    _is_chat_model,
    register_models,
)

MODELS_URL = "https://gen.pollinations.ai/v1/models"

CHAT_MODEL = {
    "id": "openai",
    "category": "text",
    "input_modalities": ["text", "image"],
    "supported_endpoints": ["/v1/chat/completions"],
    "tools": True,
    "reasoning": True,
}

TEXT_ONLY_MODEL = {
    "id": "mistral",
    "category": "text",
    "input_modalities": ["text"],
    "supported_endpoints": ["/v1/chat/completions"],
    "tools": False,
    "reasoning": False,
}

IMAGE_MODEL = {
    "id": "flux",
    "category": "image",
    "input_modalities": ["text"],
    "supported_endpoints": ["/image/generate"],
}

PAYLOAD = {"object": "list", "data": [CHAT_MODEL, TEXT_ONLY_MODEL, IMAGE_MODEL]}


def _stub_fetch(monkeypatch, payload=PAYLOAD, *, fail=False, calls=None):
    """Replace _fetch_models to avoid real HTTP."""
    def fake_fetch(url, key=None):
        if calls is not None:
            calls.append({"url": url, "key": key})
        if fail:
            raise URLError("simulated failure")
        return payload["data"]
    monkeypatch.setattr("llm_pollinations._fetch_models", fake_fetch)


# --- Unit tests for helpers ---

def test_is_chat_model():
    assert _is_chat_model(CHAT_MODEL) is True
    assert _is_chat_model(IMAGE_MODEL) is False
    assert _is_chat_model({"category": "text"}) is False


def test_has_vision():
    assert _has_vision(CHAT_MODEL) is True
    assert _has_vision(TEXT_ONLY_MODEL) is False
    assert _has_vision({}) is False


def test_has_tools():
    assert _has_tools(CHAT_MODEL) is True
    assert _has_tools(TEXT_ONLY_MODEL) is False
    assert _has_tools({"capabilities": ["tool_calling"]}) is True
    assert _has_tools({}) is False


def test_has_reasoning():
    assert _has_reasoning(CHAT_MODEL) is True
    assert _has_reasoning(TEXT_ONLY_MODEL) is False
    assert _has_reasoning({"capabilities": ["reasoning"]}) is True
    assert _has_reasoning({}) is False


# --- Registration tests ---

def test_register_models_with_key(monkeypatch):
    _stub_fetch(monkeypatch)
    registered = []
    monkeypatch.setattr(llm, "get_key", lambda *a: "sk-test")
    register_models(lambda *models: registered.extend(models))
    ids = [m.model_id for m in registered]
    assert "pollinations/openai" in ids
    assert "pollinations/mistral" in ids
    assert "pollinations/flux" not in ids


def test_register_models_skips_without_key(monkeypatch):
    _stub_fetch(monkeypatch)
    registered = []
    monkeypatch.setattr(llm, "get_key", lambda *a: None)
    register_models(lambda *models: registered.extend(models))
    assert registered == []


def test_capabilities_mapped_correctly(monkeypatch):
    _stub_fetch(monkeypatch)
    registered = []
    monkeypatch.setattr(llm, "get_key", lambda *a: "sk-test")
    register_models(lambda *models: registered.extend(models))

    openai = next(m for m in registered if m.model_id == "pollinations/openai")
    assert openai.vision is True
    assert openai.supports_tools is True
    # reasoning builds Options class but isn't stored as an instance attr
    assert hasattr(openai.Options, "model_fields")

    mistral = next(m for m in registered if m.model_id == "pollinations/mistral")
    assert mistral.vision is False
    assert mistral.supports_tools is False


# --- Cache tests ---

def test_cache_path_scoped_to_key():
    p1 = _cache_path("sk-abc")
    p2 = _cache_path("sk-def")
    p0 = _cache_path(None)
    assert p1 != p2
    assert p1.name != p0.name
    assert p1.name.endswith(".json")


def test_fetch_models_uses_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "user_dir", lambda: tmp_path)

    call_count = 0
    original_fetch = _fetch_models.__wrapped__ if hasattr(_fetch_models, '__wrapped__') else None

    def counting_fetch(url, key=None):
        nonlocal call_count
        call_count += 1
        return PAYLOAD["data"]

    monkeypatch.setattr("llm_pollinations._fetch_models", counting_fetch)

    from llm_pollinations import _fetch_models as fetch
    first = fetch(MODELS_URL, key="sk-test")
    second = fetch(MODELS_URL, key="sk-test")
    assert first == second == PAYLOAD["data"]
    assert call_count == 2


def test_stale_cache_fallback(monkeypatch, tmp_path):
    """When cache is stale and network fails, stale cache is returned."""
    monkeypatch.setattr(llm, "user_dir", lambda: tmp_path)

    cache = _cache_path("sk-test")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(PAYLOAD))

    os.utime(cache, (time.time() - 7200, time.time() - 7200))

    def _fake_urlopen(req, timeout=30):
        raise URLError("offline")

    monkeypatch.setattr("llm_pollinations.urlopen", _fake_urlopen)
    result = _fetch_models(MODELS_URL, key="sk-test")
    assert result == PAYLOAD["data"]


# --- pyproject.toml entry point ---

def test_pyproject_entry_point():
    tomllib = pytest.importorskip("tomllib")
    pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
    data = tomllib.loads(pyproject.read_text())
    assert data["project"]["name"] == "llm-pollinations"
    assert data["project"]["entry-points"]["llm"]["pollinations"] == "llm_pollinations"
