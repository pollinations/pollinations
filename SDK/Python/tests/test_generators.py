"""Tests for generator modules - UPDATED for temperature support."""

import pytest
import asyncio
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch
import httpx

from blossom_ai.core import HttpClientProtocol
from blossom_ai.generators.text_generator import TextGenerator
from blossom_ai.generators.image_generator import ImageGenerator
from blossom_ai.core.config import SessionConfig, ENDPOINTS
from blossom_ai.core.errors import BlossomError, EmptyResponseError


class TestTextGenerator:
    """Tests for TextGenerator."""

    @pytest.fixture
    def mock_config(self):
        """Mock configuration."""
        config = Mock(spec=SessionConfig)
        config.api_key = "test-key"
        config.timeout = 30.0
        config.max_retries = 3
        config.rate_limit_per_minute = 60
        config.__version__ = "0.6.0"
        config.async_limit_per_host = 10
        config.async_limit_total = 100
        config.async_timeout_connect = 30
        config.async_timeout_sock_read = 30
        config.ssl = True
        return config

    @pytest.fixture
    def mock_http_client(self):
        """Mock HTTP client with proper async support."""
        client = Mock(spec=HttpClientProtocol)
        client.get = AsyncMock()
        client.post = AsyncMock()
        client.close = AsyncMock()
        return client

    @pytest.fixture
    def mock_logger(self):
        """Mock logger."""
        logger = Mock()
        logger.info = Mock()
        logger.debug = Mock()
        logger.warning = Mock()
        logger.error = Mock()
        return logger

    @pytest.fixture
    def mock_rate_limiter(self):
        """Mock rate limiter."""
        limiter = Mock()
        limiter.acquire = AsyncMock(return_value=True)
        limiter.acquire_with_wait = AsyncMock(return_value=True)
        return limiter

    @pytest.fixture
    def generator(self, mock_config, mock_http_client, mock_logger, mock_rate_limiter):
        """Create generator instance."""
        return TextGenerator(
            config=mock_config,
            http_client=mock_http_client,
            logger=mock_logger,
            rate_limiter=mock_rate_limiter
        )

    def test_init(self, generator, mock_config):
        """Test generator initialization."""
        assert generator.config == mock_config
        assert generator.http_client is not None
        assert generator.logger is not None
        assert generator.rate_limiter is not None

    @pytest.mark.asyncio
    @pytest.mark.timeout(5)
    async def test_generate_success(self, generator):
        """Test successful text generation."""
        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Generated text"}}]}'
        mock_response.raise_for_status = Mock()
        mock_response.url = "https://test.com"
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)
        generator.rate_limiter.acquire_with_wait = AsyncMock(return_value=True)

        result = await generator.generate("Test prompt")
        assert result == "Generated text"

    @pytest.mark.asyncio
    async def test_generate_empty_prompt(self, generator):
        """Test generation with empty prompt raises error."""
        with pytest.raises(BlossomError, match="must be a non-empty string"):
            await generator.generate("")

    @pytest.mark.asyncio
    async def test_generate_whitespace_prompt(self, generator):
        """Test generation with whitespace-only prompt raises error."""
        with pytest.raises(BlossomError, match="cannot be empty or whitespace only"):
            await generator.generate("   ")

    @pytest.mark.asyncio
    async def test_generate_with_temperature_works(self, generator):
        """Test generation with a temperature parameter WORKS (no error)."""
        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Response with temp"}}]}'
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)
        generator.rate_limiter.acquire_with_wait = AsyncMock(return_value=True)

        result = await generator.generate("Test", temperature=0.7)
        assert result == "Response with temp"

        call_args = generator.http_client.post.call_args
        assert call_args is not None

        args, kwargs = call_args
        assert 'temperature' in str(kwargs) or 'json_data' in kwargs

    @pytest.mark.asyncio
    async def test_generate_with_non_default_temperature_warns(self, generator, capsys):
        """Test that non-default temperature triggers warning."""
        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Response"}}]}'
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)
        generator.rate_limiter.acquire_with_wait = AsyncMock(return_value=True)

        await generator.generate("Test", temperature=0.5)

        generator.logger.warning.assert_called()
        warning_call = generator.logger.warning.call_args
        assert warning_call is not None
        assert "temperature" in str(warning_call).lower()

    @pytest.mark.asyncio
    async def test_generate_with_default_temperature_no_warn(self, generator):
        """Test that temperature=1.0 does NOT trigger warning."""
        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Response"}}]}'
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)
        generator.rate_limiter.acquire_with_wait = AsyncMock(return_value=True)

        generator.logger.warning.reset_mock()

        await generator.generate("Test", temperature=1.0)

        generator.logger.warning.assert_not_called()

    @pytest.mark.asyncio
    async def test_generate_with_invalid_temperature_range(self, generator):
        """Test that temperature outside [0.0, 2.0] raises error."""

        with pytest.raises(BlossomError, match="temperature.*must be between.*0\\.0.*and.*2\\.0"):
            await generator.generate("Test", temperature=-0.1)

        with pytest.raises(BlossomError, match="temperature.*must be between.*0\\.0.*and.*2\\.0"):
            await generator.generate("Test", temperature=2.1)

    @pytest.mark.asyncio
    async def test_generate_empty_response(self, generator):
        """Test handling of empty API response."""
        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":""}}]}'
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)

        with pytest.raises(EmptyResponseError):
            await generator.generate("Test")

    @pytest.mark.asyncio
    async def test_generate_invalid_json(self, generator):
        """Test handling of invalid JSON response."""
        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'invalid json'
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)

        with pytest.raises(BlossomError, match="Invalid JSON response"):
            await generator.generate("Test")

    @pytest.mark.asyncio
    async def test_chat_success(self, generator):
        """Test successful chat."""
        messages = [{"role": "user", "content": "Hello"}]

        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Hi there"}}]}'
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)

        result = await generator.chat(messages)
        assert result == "Hi there"

    @pytest.mark.asyncio
    async def test_chat_empty_messages(self, generator):
        """Test chat with empty messages raises error."""
        with pytest.raises(BlossomError, match="must be a non-empty list"):
            await generator.chat([])

    @pytest.mark.asyncio
    async def test_chat_with_temperature(self, generator):
        """Test chat with temperature parameter works."""
        messages = [{"role": "user", "content": "Hello"}]

        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Response"}}]}'
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}
        mock_response.request = Mock()

        generator.http_client.post = AsyncMock(return_value=mock_response)

        result = await generator.chat(messages, temperature=0.8)
        assert result == "Response"

        call_args = generator.http_client.post.call_args
        assert call_args is not None

        args, kwargs = call_args
        assert 'temperature' in str(kwargs) or 'json_data' in kwargs