import json
import os
import time
from unittest.mock import AsyncMock, MagicMock, patch

import click
from click.testing import CliRunner
import httpx
import llm
import pytest

from llm_pollinations import (
    DownloadError,
    PollinationsAsyncChat,
    PollinationsChat,
    fetch_cached_json,
    get_pollinations_models,
    get_supports_images,
    get_supports_reasoning,
    get_supports_schema,
    get_supports_tools,
    is_compatible_text_model,
    register_commands,
    register_models,
)

SAMPLE_CATALOG = {
    "object": "list",
    "data": [
        {
            "id": "openai/gpt-5.4-nano",
            "object": "model",
            "category": "text",
            "title": "GPT-5.4 Nano",
            "description": "Fast model",
            "input_modalities": ["text", "image"],
            "output_modalities": ["text"],
            "tools": True,
            "reasoning": False,
            "supports_schema": True,
            "context_length": 400000,
            "aliases": ["gpt-5.4-nano", "openai"],
        },
        {
            "id": "anthropic/claude-sonnet-4.6",
            "object": "model",
            "category": "text",
            "title": "Claude Sonnet 4.6",
            "description": "Powerful reasoning model",
            "input_modalities": ["text", "image"],
            "output_modalities": ["text"],
            "tools": True,
            "reasoning": True,
            "context_length": 1000000,
            "aliases": ["claude-sonnet-4.6"],
        },
        {
            "id": "black-forest-labs/flux.1-schnell",
            "object": "model",
            "category": "image",
            "title": "FLUX 1 Schnell",
            "input_modalities": ["text"],
            "output_modalities": ["image"],
        },
        {
            "id": "openai/text-embedding-3-small",
            "object": "model",
            "category": "embedding",
            "title": "Embedding 3 Small",
            "input_modalities": ["text"],
            "output_modalities": ["embedding"],
        },
    ],
}


def test_is_compatible_text_model():
    text_model = SAMPLE_CATALOG["data"][0]
    reasoning_model = SAMPLE_CATALOG["data"][1]
    image_model = SAMPLE_CATALOG["data"][2]
    embedding_model = SAMPLE_CATALOG["data"][3]

    assert is_compatible_text_model(text_model) is True
    assert is_compatible_text_model(reasoning_model) is True
    assert is_compatible_text_model(image_model) is False
    assert is_compatible_text_model(embedding_model) is False


def test_capability_helpers():
    m1 = SAMPLE_CATALOG["data"][0]
    m2 = SAMPLE_CATALOG["data"][1]

    assert get_supports_images(m1) is True
    assert get_supports_tools(m1) is True
    assert get_supports_reasoning(m1) is False
    assert get_supports_schema(m1) is True

    assert get_supports_images(m2) is True
    assert get_supports_tools(m2) is True
    assert get_supports_reasoning(m2) is True


def test_fetch_cached_json_fresh(tmp_path):
    cache_file = tmp_path / "cache.json"
    cache_file.write_text(json.dumps(SAMPLE_CATALOG))

    res = fetch_cached_json("https://example.com/v1/models", cache_file, cache_timeout=3600)
    assert res == SAMPLE_CATALOG


def test_fetch_cached_json_http_success(tmp_path):
    cache_file = tmp_path / "cache.json"

    mock_response = MagicMock()
    mock_response.json.return_value = SAMPLE_CATALOG
    mock_response.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_response) as mock_get:
        res = fetch_cached_json("https://example.com/v1/models", cache_file, cache_timeout=3600)
        assert res == SAMPLE_CATALOG
        assert cache_file.exists()
        mock_get.assert_called_once()


def test_fetch_cached_json_stale_fallback(tmp_path):
    cache_file = tmp_path / "cache.json"
    cache_file.write_text(json.dumps(SAMPLE_CATALOG))
    # Make file older than cache_timeout
    old_time = time.time() - 7200
    os.utime(cache_file, (old_time, old_time))

    with patch("httpx.get", side_effect=httpx.HTTPError("Connection failed")):
        res = fetch_cached_json("https://example.com/v1/models", cache_file, cache_timeout=3600)
        assert res == SAMPLE_CATALOG


def test_fetch_cached_json_failure_no_cache(tmp_path):
    cache_file = tmp_path / "cache.json"

    with patch("httpx.get", side_effect=httpx.HTTPError("Connection failed")):
        with pytest.raises(DownloadError):
            fetch_cached_json("https://example.com/v1/models", cache_file, cache_timeout=3600)


def test_register_models(tmp_path):
    registered = []

    def mock_register(*models, aliases=()):
        registered.append((models, aliases))

    with patch("llm_pollinations.get_pollinations_models", return_value=[SAMPLE_CATALOG["data"][0], SAMPLE_CATALOG["data"][1]]):
        register_models(mock_register)

    assert len(registered) == 2

    m1_pair, m1_aliases = registered[0]
    chat1, async_chat1 = m1_pair

    assert isinstance(chat1, PollinationsChat)
    assert isinstance(async_chat1, PollinationsAsyncChat)
    assert chat1.model_id == "pollinations/openai/gpt-5.4-nano"
    assert chat1.model_name == "openai/gpt-5.4-nano"
    assert chat1.needs_key == "pollinations"
    assert chat1.key_env_var == "POLLINATIONS_API_KEY"
    assert chat1.vision is True
    assert chat1.supports_tools is True
    assert chat1.reasoning is False
    assert chat1.supports_schema is True
    assert "pollinations/gpt-5.4-nano" in m1_aliases

    m2_pair, m2_aliases = registered[1]
    chat2, async_chat2 = m2_pair
    assert chat2.model_id == "pollinations/anthropic/claude-sonnet-4.6"
    assert chat2.reasoning is True


def test_register_commands():
    cli = click.Group()
    register_commands(cli)

    assert "pollinations" in cli.commands
    pollinations_group = cli.commands["pollinations"]
    assert isinstance(pollinations_group, click.Group)
    assert "models" in pollinations_group.commands
    assert "refresh" in pollinations_group.commands


def test_cli_models_command():
    cli = click.Group()
    register_commands(cli)

    runner = CliRunner()
    with patch("llm_pollinations.get_pollinations_models", return_value=[SAMPLE_CATALOG["data"][0]]):
        result = runner.invoke(cli, ["pollinations", "models"])
        assert result.exit_code == 0
        assert "pollinations/openai/gpt-5.4-nano" in result.output
        assert "GPT-5.4 Nano" in result.output


def test_cli_models_json_command():
    cli = click.Group()
    register_commands(cli)

    runner = CliRunner()
    with patch("llm_pollinations.get_pollinations_models", return_value=[SAMPLE_CATALOG["data"][0]]):
        result = runner.invoke(cli, ["pollinations", "models", "--json"])
        assert result.exit_code == 0
        json_output = json.loads(result.output)
        assert len(json_output) == 1
        assert json_output[0]["id"] == "openai/gpt-5.4-nano"


def test_cli_refresh_command():
    cli = click.Group()
    register_commands(cli)

    runner = CliRunner()
    with patch("llm_pollinations.get_pollinations_models") as mock_get_models:
        mock_get_models.side_effect = [
            [SAMPLE_CATALOG["data"][0]],  # Before refresh
            [SAMPLE_CATALOG["data"][0], SAMPLE_CATALOG["data"][1]],  # After refresh
        ]
        result = runner.invoke(cli, ["pollinations", "refresh"])
        assert result.exit_code == 0
        assert "Added models: pollinations/anthropic/claude-sonnet-4.6" in result.output


def test_pollinations_chat_str():
    chat = PollinationsChat(
        model_id="pollinations/openai/gpt-5.4-nano",
        model_name="openai/gpt-5.4-nano",
        api_base="https://gen.pollinations.ai/v1",
    )
    assert str(chat) == "Pollinations: pollinations/openai/gpt-5.4-nano"


def test_pollinations_chat_get_client():
    chat = PollinationsChat(
        model_id="pollinations/openai/gpt-5.4-nano",
        model_name="openai/gpt-5.4-nano",
        api_base="https://gen.pollinations.ai/v1",
    )
    with patch.object(chat, "get_key", return_value="sk_test_123"):
        with patch("openai.OpenAI") as mock_openai:
            client = chat.get_client()
            mock_openai.assert_called_once_with(
                api_key="sk_test_123",
                base_url="https://gen.pollinations.ai/v1",
            )


def test_pollinations_chat_get_client_no_key():
    chat = PollinationsChat(
        model_id="pollinations/openai/gpt-5.4-nano",
        model_name="openai/gpt-5.4-nano",
        api_base="https://gen.pollinations.ai/v1",
    )
    with patch.object(chat, "get_key", return_value=None):
        with patch("openai.OpenAI") as mock_openai:
            client = chat.get_client()
            mock_openai.assert_called_once_with(
                api_key="no-key",
                base_url="https://gen.pollinations.ai/v1",
            )
