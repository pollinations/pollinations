"""Tests for llm-pollinations plugin."""
import pytest
import respx
from httpx import Response

from llm_pollinations import (
    API_BASE,
    PollinationsAsyncChat,
    PollinationsChat,
    _list_models,
    _supports_vision,
    register_models,
)


class TestBasics:
    def test_needs_key(self):
        assert PollinationsChat.needs_key == "pollinations"

    def test_api_base(self):
        assert PollinationsChat.api_base == API_BASE

    def test_str(self):
        assert "Pollinations" in str(PollinationsChat(model_name="gpt-5.4-nano"))


class TestDiscovery:
    @respx.mock
    def test_list_models(self):
        respx.get(f"{API_BASE}/models").mock(
            return_value=Response(200, json={"data": [{"id": "openai/gpt-5.4-nano"}]})
        )
        models = _list_models()
        assert models[0]["id"] == "openai/gpt-5.4-nano"

    @respx.mock
    def test_list_models_fail(self):
        respx.get(f"{API_BASE}/models").mock(return_value=Response(500))
        assert _list_models() == []


class TestVision:
    def test_gpt4_vision(self):
        assert _supports_vision("openai/gpt-4") is True

    def test_no_vision(self):
        assert _supports_vision("openai/gpt-3.5") is False


class TestRegistration:
    @respx.mock
    def test_register(self):
        respx.get(f"{API_BASE}/models").mock(
            return_value=Response(200, json={"data": [{"id": "openai/gpt-5.4-nano"}]})
        )
        registered = []
        def fake_register(cls, aliases, **kwargs):
            registered.append({"cls": cls.__name__, "aliases": aliases})
        register_models(fake_register)
        assert registered[0]["cls"] == "PollinationsChat"
        assert "gpt-5.4-nano" in registered[0]["aliases"]

    def test_fallback(self):
        from unittest.mock import patch
        registered = []
        def fake_register(cls, aliases, **kwargs):
            registered.append({"cls": cls.__name__})
        with patch("llm_pollinations._list_models", return_value=[]):
            register_models(fake_register)
        assert len(registered) == 6  # 3 fallback × 2


class TestAsync:
    def test_async_exists(self):
        model = PollinationsAsyncChat(model_name="gpt-5.4-nano")
        assert model.api_base == API_BASE
