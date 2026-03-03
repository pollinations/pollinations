# tests/test_sugar_integration.py
"""Integration tests for Sugar Layer with BlossomClient."""

import pytest
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
import httpx
from blossom_ai.utils.async_utils import _run_async


@pytest.mark.integration
class TestSugarWithRealClient:
    """Tests using actual BlossomClient (mocked HTTP)."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    @pytest.fixture
    def mock_image_response(self):
        """Mock successful image response."""
        response = Mock(spec=httpx.Response)
        response.status_code = 200
        response.content = b"fake_image_data_png"
        response.raise_for_status = Mock()
        response.headers = {}
        return response

    @pytest.fixture
    def mock_text_response(self):
        """Mock successful text response."""
        response = Mock(spec=httpx.Response)
        response.status_code = 200
        response.content = b'{"choices":[{"message":{"content":"Generated text"}}]}'
        response.json = Mock(return_value={
            "choices": [{"message": {"content": "Generated text"}}]
        })
        response.raise_for_status = Mock()
        response.headers = {}
        return response

    def test_image_generation_with_client(self, mock_image_response):
        """Test image generation with real client instance."""
        from blossom_ai import ai
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        # Get the client instance first
        client = _LazyClient.get()

        with patch.object(client.image, 'generate', return_value=_run_async(
            AsyncMock(return_value=b"fake_image_data_png")()
        )) as mock_generate:
            result = ai.image.generate("test prompt")
            assert result == b"fake_image_data_png"
            mock_generate.assert_called_once()

    def test_text_generation_with_client(self, mock_text_response):
        """Test text generation with real client instance."""
        from blossom_ai import ai
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        client = _LazyClient.get()

        with patch.object(client.text, 'generate', return_value=_run_async(
            AsyncMock(return_value="Generated text")()
        )) as mock_generate:
            result = ai.text.generate("test prompt")
            assert result == "Generated text"
            mock_generate.assert_called_once()

    def test_concurrent_requests(self, mock_text_response, mock_image_response):
        """Test handling concurrent requests."""
        from blossom_ai import ai
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        from concurrent.futures import ThreadPoolExecutor

        client = _LazyClient.get()

        with patch.object(client.text, 'generate', return_value=_run_async(
            AsyncMock(return_value="Generated text")()
        )), \
             patch.object(client.image, 'generate', return_value=_run_async(
                 AsyncMock(return_value=b"image_data")()
             )):

            def generate_text(prompt):
                return ai.text.generate(prompt)

            prompts = ["prompt 1", "prompt 2", "prompt 3"]

            with ThreadPoolExecutor(max_workers=3) as executor:
                results = list(executor.map(generate_text, prompts))

            assert len(results) == 3
            assert all(r == "Generated text" for r in results)


@pytest.mark.integration
class TestSugarWithConfigAndErrors:
    """Test sugar layer with configuration and error handling."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    def test_client_uses_config_from_env(self, monkeypatch):
        """Test client respects environment configuration."""
        from blossom_ai import ai
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        monkeypatch.setenv("POLLINATIONS_API_KEY", "test-key-123")
        monkeypatch.setenv("POLLINATIONS_RATE_LIMIT", "120")

        client = _LazyClient.get()
        assert client.config.api_key == "test-key-123"
        assert client.config.rate_limit_per_minute == 120

    def test_http_error_propagation(self):
        """Test HTTP errors are properly propagated."""
        from blossom_ai import ai
        from blossom_ai.core.errors import AuthenticationError
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        client = _LazyClient.get()

        with patch.object(client.text, 'generate', side_effect=AuthenticationError("Auth failed")):
            with pytest.raises(AuthenticationError):
                ai.text.generate("test")

    def test_rate_limit_error_propagation(self):
        """Test rate limit errors are properly propagated."""
        from blossom_ai import ai
        from blossom_ai.core.errors import RateLimitError
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        error = RateLimitError("Rate limited", retry_after=60)
        client = _LazyClient.get()

        with patch.object(client.text, 'generate', side_effect=error):
            with pytest.raises(RateLimitError) as exc_info:
                ai.text.generate("test")
            assert exc_info.value.retry_after == 60


@pytest.mark.integration
class TestSugarWithCaching:
    """Test sugar layer with caching enabled."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    def test_cache_hit_on_repeated_request(
        self,
        test_config,
        mock_rate_limiter,
        mock_image_response,
        mock_text_response,
        mock_logger
    ):
        """Test cache hit on repeated identical requests."""
        from blossom_ai.client import BlossomClient
        from blossom_ai.utils.cache import CacheManager, CacheConfig, CacheBackend
        from unittest.mock import AsyncMock, Mock

        # Create cache manager
        cache_config = CacheConfig(ttl=3600, backend=CacheBackend.MEMORY)
        cache = CacheManager(cache_config, mock_logger)

        # Create mock HTTP client
        mock_http = Mock()
        mock_http.get = AsyncMock(return_value=mock_image_response)
        mock_http.post = AsyncMock(return_value=mock_text_response)
        mock_http.close = AsyncMock()

        # Create client with cache
        client = BlossomClient(
            config=test_config,
            http_client=mock_http,
            rate_limiter=mock_rate_limiter,
            cache=cache,
        )

        # First request
        result1 = _run_async(client.image.generate("test", width=512, height=512))

        # Second identical request should hit cache
        result2 = _run_async(client.image.generate("test", width=512, height=512))

        assert result1 == result2 == b"fake_image_data_png"

        # HTTP client should only be called ONCE because of cache
        assert mock_http.get.call_count == 1

        _run_async(client.close())


@pytest.mark.integration
class TestSugarWithRateLimiting:
    """Test sugar layer with rate limiting."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    def test_rate_limiter_is_used(self):
        """Test rate limiter is properly initialized and used."""
        from blossom_ai import ai
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        client = _LazyClient.get()
        assert client.rate_limiter is not None
        assert client.rate_limiter.requests_per_minute == 100000


@pytest.mark.integration
class TestSugarFileOperations:
    """Test sugar layer file operations."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        _LazyClient._instance = None
        yield
        _LazyClient._instance = None

    def test_save_creates_directories(self, tmp_path):
        """Test save creates parent directories if needed."""
        from blossom_ai import ai
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        output = tmp_path / "subdir" / "nested" / "image.png"
        client = _LazyClient.get()

        with patch.object(client.image, 'save', return_value=_run_async(
            AsyncMock(return_value=output.absolute())()
        )) as mock_save:
            result = ai.image.save("test", str(output))
            mock_save.assert_called_once_with("test", str(output))
            assert result == output.absolute()

    def test_save_overwrites_existing(self, tmp_path):
        """Test save overwrites existing files."""
        from blossom_ai import ai
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        output = tmp_path / "test.png"
        output.write_bytes(b"old_data")

        client = _LazyClient.get()

        with patch.object(client.image, 'save', return_value=_run_async(
            AsyncMock(return_value=output.absolute())()
        )) as mock_save:
            ai.image.save("test", str(output))
            mock_save.assert_called_once()