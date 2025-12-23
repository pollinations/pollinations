"""Tests for main client module."""
import time
import pytest
import asyncio
from unittest.mock import Mock, MagicMock, AsyncMock, patch
import httpx

from blossom_ai.client import BlossomClient
from blossom_ai.core.config import SessionConfig
from blossom_ai.generators.text_generator import TextGenerator
from blossom_ai.generators.image_generator import ImageGenerator


class TestBlossomClient:
    """Tests for BlossomClient."""

    @pytest.fixture
    def mock_config(self):
        """Mock configuration."""
        return SessionConfig(
            api_key="test-key",
            timeout=30.0,
            max_retries=3,
            rate_limit_per_minute=60
        )

    def test_init_default_config(self, monkeypatch):
        """Test initialization with default config from env."""
        monkeypatch.setenv("POLLINATIONS_API_KEY", "test-key-123")
        monkeypatch.setenv("POLLINATIONS_RATE_LIMIT", "60")

        client = BlossomClient()

        assert isinstance(client.config, SessionConfig)
        assert client.config.api_key == "test-key-123"
        assert client.config.rate_limit_per_minute == 60

        asyncio.run(client.close())

    def test_init_custom_config(self, mock_config):
        """Test initialization with custom config."""
        client = BlossomClient(config=mock_config)

        assert client.config == mock_config
        assert client.config.api_key == "test-key"

        asyncio.run(client.close())

    def test_generators_initialized(self, mock_config):
        """Test generators are properly initialized."""
        client = BlossomClient(config=mock_config)

        assert isinstance(client.text, TextGenerator)
        assert isinstance(client.image, ImageGenerator)

        # Check they share dependencies
        assert client.text.config == mock_config
        assert client.image.config == mock_config
        assert client.text.http_client == client.image.http_client

        asyncio.run(client.close())

    def test_custom_http_client(self, mock_config):
        """Test initialization with custom HTTP client."""
        mock_http = MagicMock()
        mock_http.close = AsyncMock()

        client = BlossomClient(
            config=mock_config,
            http_client=mock_http
        )

        assert client.http_client == mock_http
        assert client.text.http_client == mock_http

        asyncio.run(client.close())

    def test_custom_logger(self, mock_config):
        """Test initialization with custom logger."""
        mock_logger = MagicMock()

        client = BlossomClient(
            config=mock_config,
            logger=mock_logger
        )

        assert client.logger == mock_logger

        asyncio.run(client.close())

    def test_custom_rate_limiter(self, mock_config):
        """Test initialization with custom rate limiter."""
        mock_limiter = MagicMock()
        mock_limiter.acquire_with_wait = AsyncMock()

        client = BlossomClient(
            config=mock_config,
            rate_limiter=mock_limiter
        )

        assert client.rate_limiter == mock_limiter

        asyncio.run(client.close())

    @pytest.mark.asyncio
    async def test_async_context_manager(self, mock_config):
        """Test async context manager protocol."""
        async with BlossomClient(config=mock_config) as client:
            assert isinstance(client, BlossomClient)
            assert client.http_client is not None

    def test_sync_context_manager(self, mock_config):
        """Test sync context manager protocol."""
        with BlossomClient(config=mock_config) as client:
            assert isinstance(client, BlossomClient)
            assert client.http_client is not None

    @pytest.mark.asyncio
    async def test_close(self, mock_config):
        """Test closing client connections."""
        mock_http = MagicMock()
        mock_http.close = AsyncMock()

        client = BlossomClient(
            config=mock_config,
            http_client=mock_http
        )

        await client.close()
        mock_http.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_text_generation(self, mock_config):
        """Test text generation through client."""
        client = BlossomClient(config=mock_config)

        # FIX: Use MagicMock with proper spec and headers
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Generated"}}]}'
        mock_response.json = Mock(return_value={
            "choices": [{"message": {"content": "Generated"}}]
        })
        mock_response.raise_for_status = Mock()
        mock_response.headers = {}  # CRITICAL: Add headers

        client.http_client.post = AsyncMock(return_value=mock_response)

        result = await client.text.generate("Test prompt")
        assert result == "Generated"

        await client.close()

    @pytest.mark.asyncio
    async def test_image_generation(self, mock_config):
        """Test image generation through client."""
        client = BlossomClient(config=mock_config)

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b"fake_image_data"
        mock_response.headers = {}  # CRITICAL: Add headers
        mock_response.raise_for_status = Mock()

        client.http_client.get = AsyncMock(return_value=mock_response)

        result = await client.image.generate("A cat", width=512, height=512)
        assert result == b"fake_image_data"

        await client.close()

    @pytest.mark.asyncio
    async def test_concurrent_requests(self, mock_config):
        """Test handling concurrent requests."""
        client = BlossomClient(config=mock_config)

        # Mock text response
        text_response = MagicMock(spec=httpx.Response)
        text_response.status_code = 200
        text_response.content = b'{"choices":[{"message":{"content":"Text"}}]}'
        text_response.headers = {}  # CRITICAL: Add headers
        text_response.raise_for_status = Mock()

        # Mock image response
        image_response = MagicMock(spec=httpx.Response)
        image_response.status_code = 200
        image_response.content = b"image_data"
        image_response.headers = {}  # CRITICAL: Add headers

        client.http_client.post = AsyncMock(return_value=text_response)
        client.http_client.get = AsyncMock(return_value=image_response)

        # Run concurrent requests
        text_task = client.text.generate("Text prompt")
        image_task = client.image.generate("Image prompt", width=512, height=512)

        text_result, image_result = await asyncio.gather(text_task, image_task)

        assert text_result == "Text"
        assert image_result == b"image_data"

        await client.close()

    def test_sync_text_generation(self, mock_config):
        """Test synchronous text generation."""
        client = BlossomClient(config=mock_config)

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Sync text"}}]}'
        mock_response.headers = {}  # CRITICAL: Add headers
        mock_response.raise_for_status = Mock()

        client.http_client.post = AsyncMock(return_value=mock_response)

        result = client.text.generate_sync("Test")
        assert result == "Sync text"

        asyncio.run(client.close())

    def test_sync_image_generation(self, mock_config):
        """Test synchronous image generation."""
        client = BlossomClient(config=mock_config)

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b"sync_image"
        mock_response.headers = {}  # CRITICAL: Add headers

        client.http_client.get = AsyncMock(return_value=mock_response)

        result = client.image.generate_sync("Test", width=512, height=512)
        assert result == b"sync_image"

        asyncio.run(client.close())

    @pytest.mark.asyncio
    async def test_rate_limiting(self, mock_config):
        """Test that rate limiter is called and respects limits."""
        mock_config = SessionConfig(
            api_key="test-key",
            rate_limit_per_minute=60
        )

        client = BlossomClient(config=mock_config)

        # Mock rate limiter
        mock_limiter = MagicMock()
        mock_limiter.acquire_with_wait = AsyncMock(return_value=True)

        client.rate_limiter = mock_limiter
        client.text.rate_limiter = mock_limiter
        client.image.rate_limiter = mock_limiter

        # Mock HTTP response
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Result"}}]}'
        mock_response.headers = {}  # CRITICAL: Add headers
        mock_response.raise_for_status = Mock()
        client.http_client.post = AsyncMock(return_value=mock_response)

        # Make request
        await client.text.generate("Test prompt")

        # Verify rate limiter was called exactly once
        mock_limiter.acquire_with_wait.assert_called_once()

        # Make second request
        await client.text.generate("Test prompt 2")

        # Verify rate limiter was called twice total
        assert mock_limiter.acquire_with_wait.call_count == 2

        await client.close()

    @pytest.mark.asyncio
    async def test_error_propagation(self, mock_config):
        """Test error propagation from generators."""
        from blossom_ai.core.errors import AuthenticationError

        client = BlossomClient(config=mock_config)

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 401
        mock_response.content = b'{"error": "Unauthorized"}'
        mock_response.text = "Unauthorized"
        mock_response.headers = {}  # CRITICAL: Add headers

        error = httpx.HTTPStatusError("401", request=MagicMock(), response=mock_response)
        client.http_client.post = AsyncMock(side_effect=error)

        with pytest.raises(AuthenticationError):
            await client.text.generate("Test")

        await client.close()

    def test_logging_on_init(self, mock_config):
        """Test initialization logging."""
        mock_logger = MagicMock()

        client = BlossomClient(
            config=mock_config,
            logger=mock_logger
        )

        # Should log initialization
        mock_logger.info.assert_called()

        asyncio.run(client.close())

    @pytest.mark.asyncio
    async def test_chat_functionality(self, mock_config):
        """Test chat functionality through client."""
        client = BlossomClient(config=mock_config)

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Chat response"}}]}'
        mock_response.headers = {}  # CRITICAL: Add headers
        mock_response.raise_for_status = Mock()

        client.http_client.post = AsyncMock(return_value=mock_response)

        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
            {"role": "user", "content": "How are you?"}
        ]

        result = await client.text.chat(messages)
        assert result == "Chat response"

        await client.close()

    @pytest.mark.asyncio
    async def test_image_url_generation(self, mock_config):
        """Test image URL generation through client."""
        client = BlossomClient(config=mock_config)

        url = client.image.generate_url(
            prompt="A landscape",
            model="flux",
            width=512,
            height=512
        )

        assert isinstance(url, str)
        assert url.startswith("http")
        assert "A%20landscape" in url

        await client.close()

    def test_multiple_clients(self):
        """Test creating multiple client instances."""
        config1 = SessionConfig(api_key="key1")
        config2 = SessionConfig(api_key="key2")

        client1 = BlossomClient(config=config1)
        client2 = BlossomClient(config=config2)

        assert client1.config.api_key == "key1"
        assert client2.config.api_key == "key2"
        assert client1.http_client != client2.http_client

        asyncio.run(client1.close())
        asyncio.run(client2.close())

    @pytest.mark.asyncio
    async def test_double_close_does_not_error(self, mock_config):
        """Test that closing already closed client doesn't raise errors."""
        client = BlossomClient(config=mock_config)

        # First close
        await client.close()
        assert client._closed is True

        # Second close should not raise
        await client.close()  # Should not raise

        # Third close in sync context
        client.__exit__(None, None, None)  # Should not raise

    @pytest.mark.asyncio
    async def test_get_stats_with_no_cache(self, mock_config):
        """Test get_stats() when cache is explicitly disabled."""
        mock_config.cache_enabled = False

        client = BlossomClient(config=mock_config, cache=None)
        stats = client.get_stats()

        assert stats["cache"] is None

        await client.close()

    @pytest.mark.asyncio
    async def test_get_stats_with_cache_without_get_stats_method(self, mock_config):
        """Test get_stats() when cache doesn't have get_stats method."""
        mock_cache = MagicMock()
        del mock_cache.get_stats

        client = BlossomClient(config=mock_config, cache=mock_cache)
        stats = client.get_stats()

        assert stats["cache"] is None

        await client.close()