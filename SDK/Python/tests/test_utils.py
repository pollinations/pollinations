# tests/test_utils.py
"""Tests for utility modules."""

import pytest
import asyncio
import time
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
import httpx

from blossom_ai.utils.http_client import HttpxClient
from blossom_ai.utils.logging import StructuredLogger, set_correlation_id, get_correlation_id
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter, TokenBucket
from blossom_ai.utils.security import (
    validate_file_path,
    validate_image_file,
    sanitize_filename,
    ensure_safe_directory,
    generate_safe_filename,
)
from blossom_ai.utils.async_utils import _run_async
from blossom_ai.utils.sugar_layer.simple import _LazyClient, _ImageAPI, _TextAPI, ai
from blossom_ai.core.config import SessionConfig


class TestHttpxClient:
    """Tests for HttpxClient."""

    @pytest.fixture
    def mock_config(self):
        """Mock configuration."""
        config = Mock(spec=SessionConfig)
        config.api_key = "test-key"
        config.timeout = 30.0
        config.__version__ = "0.8.0"
        config.async_limit_per_host = 30
        config.async_limit_total = 100
        config.async_timeout_connect = 30
        config.async_timeout_sock_read = 30
        config.ssl = True
        return config

    def test_init_default_headers(self, mock_config):
        """Test default headers generation."""
        client = HttpxClient(mock_config)
        headers = client._get_default_headers()

        assert "User-Agent" in headers
        assert "blossom-ai" in headers["User-Agent"]
        assert "Authorization" in headers
        assert headers["Authorization"] == "Bearer test-key"

    def test_init_no_api_key(self, mock_config):
        """Test headers without API key."""
        mock_config.api_key = None
        client = HttpxClient(mock_config)
        headers = client._get_default_headers()

        assert "Authorization" not in headers

    def test_validate_url_valid_http(self, mock_config):
        """Test URL validation with valid HTTP URL."""
        client = HttpxClient(mock_config)
        url = client._validate_url("http://example.com")
        assert url == "http://example.com"

    def test_validate_url_valid_https(self, mock_config):
        """Test URL validation with valid HTTPS URL."""
        client = HttpxClient(mock_config)
        url = client._validate_url("https://example.com")
        assert url == "https://example.com"

    def test_validate_url_strips_whitespace(self, mock_config):
        """Test URL validation strips whitespace."""
        client = HttpxClient(mock_config)
        url = client._validate_url("  https://example.com  ")
        assert url == "https://example.com"

    def test_validate_url_empty(self, mock_config):
        """Test URL validation with empty string."""
        client = HttpxClient(mock_config)
        with pytest.raises(ValueError, match="URL cannot be empty"):
            client._validate_url("")

    def test_validate_url_invalid_scheme(self, mock_config):
        """Test URL validation with invalid scheme."""
        client = HttpxClient(mock_config)
        with pytest.raises(ValueError, match="Invalid URL scheme"):
            client._validate_url("ftp://example.com")

    def test_validate_url_dangerous_pattern(self, mock_config):
        """Test URL validation rejects dangerous patterns."""
        client = HttpxClient(mock_config)
        with pytest.raises(ValueError, match="Dangerous URL pattern"):
            client._validate_url("javascript:alert(1)")

    @pytest.mark.asyncio
    async def test_get_success(self, mock_config):
        """Test successful GET request."""
        client = HttpxClient(mock_config)

        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b"success"
        mock_response.raise_for_status = Mock()

        with patch.object(client._async_client, 'get', AsyncMock(return_value=mock_response)):
            response = await client.get("https://example.com")
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_post_success(self, mock_config):
        """Test successful POST request."""
        client = HttpxClient(mock_config)

        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.content = b"success"
        mock_response.raise_for_status = Mock()

        with patch.object(client._async_client, 'post', AsyncMock(return_value=mock_response)):
            response = await client.post("https://example.com", json={"test": "data"})
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_http_error(self, mock_config):
        """Test GET request with HTTP error."""
        client = HttpxClient(mock_config)

        mock_response = Mock(spec=httpx.Response)
        mock_response.status_code = 404
        mock_response.text = "Not found"
        mock_response.headers = {}
        mock_response.raise_for_status = Mock(
            side_effect=httpx.HTTPStatusError("404", request=Mock(), response=mock_response)
        )

        with patch.object(client._async_client, 'get', AsyncMock(return_value=mock_response)):
            with pytest.raises(httpx.HTTPStatusError):
                await client.get("https://example.com")

    @pytest.mark.asyncio
    async def test_close(self, mock_config):
        """Test client close."""
        client = HttpxClient(mock_config)
        with patch.object(client._async_client, 'aclose', AsyncMock()) as mock_close:
            await client.close()
            mock_close.assert_called_once()


class TestStructuredLogger:
    """Tests for StructuredLogger."""

    def test_init(self):
        """Test logger initialization."""
        logger = StructuredLogger("test_logger")
        assert logger.name == "test_logger"
        assert logger.level == "INFO"

    def test_init_custom_level(self):
        """Test logger with custom level."""
        logger = StructuredLogger("test", level="DEBUG")
        assert logger.level == "DEBUG"

    def test_debug_logging(self):
        """Test debug logging."""
        logger = StructuredLogger("test")
        with patch.object(logger._logger, 'debug') as mock_debug:
            logger.debug("Test message", key="value")
            mock_debug.assert_called_once()

    def test_info_logging(self):
        """Test info logging."""
        logger = StructuredLogger("test")
        with patch.object(logger._logger, 'info') as mock_info:
            logger.info("Test message", user_id=123)
            mock_info.assert_called_once()

    def test_warning_logging(self):
        """Test warning logging."""
        logger = StructuredLogger("test")
        with patch.object(logger._logger, 'warning') as mock_warning:
            logger.warning("Test warning")
            mock_warning.assert_called_once()

    def test_error_logging(self):
        """Test error logging."""
        logger = StructuredLogger("test")
        with patch.object(logger._logger, 'error') as mock_error:
            logger.error("Test error", error="details")
            mock_error.assert_called_once()


class TestCorrelationId:
    """Tests for correlation ID functions."""

    def test_set_and_get_correlation_id(self):
        """Test setting and getting correlation ID."""
        set_correlation_id("test-123")
        assert get_correlation_id() == "test-123"

        # Clean up
        set_correlation_id(None)

    def test_get_correlation_id_default(self):
        """Test getting correlation ID when not set."""
        set_correlation_id(None)
        assert get_correlation_id() is None


class TestTokenBucket:
    """Tests for TokenBucket."""

    def test_init(self):
        """Test token bucket initialization."""
        bucket = TokenBucket(capacity=10, refill_rate=1.0)
        assert bucket.capacity == 10
        assert bucket.tokens == 10
        assert bucket.refill_rate == 1.0

    @pytest.mark.asyncio
    async def test_try_acquire_success(self):
        """Test successful token acquisition."""
        bucket = TokenBucket(capacity=10, refill_rate=1.0)
        result = await bucket.try_acquire(1)
        assert result is True
        assert bucket.tokens == 9

    @pytest.mark.asyncio
    async def test_try_acquire_insufficient_tokens(self):
        """Test acquisition with insufficient tokens."""
        bucket = TokenBucket(capacity=2, refill_rate=1.0)
        result = await bucket.try_acquire(2)
        assert result is True
        result = await bucket.try_acquire(1)
        assert result is False

    @pytest.mark.asyncio
    async def test_refill_over_time(self):
        """Test token refill over time - FIXED."""
        bucket = TokenBucket(capacity=10, refill_rate=10.0)
        await bucket.try_acquire(10)

        await asyncio.sleep(0.5)
        await bucket._refill()

        assert 3 <= bucket.tokens <= 6

    @pytest.mark.asyncio
    async def test_time_until_available(self):
        """Test calculating time until tokens available - FIXED."""
        bucket = TokenBucket(capacity=10, refill_rate=1.0)
        await bucket.try_acquire(10)

        time_needed = await bucket.time_until_available(5)

        assert 4.5 <= time_needed <= 5.5


class TestTokenBucketRateLimiter:
    """Tests for TokenBucketRateLimiter."""

    def test_init_defaults(self):
        """Test rate limiter with defaults."""
        limiter = TokenBucketRateLimiter()
        assert limiter.requests_per_minute == 60
        assert limiter.burst_capacity == 60

    def test_init_custom(self):
        """Test rate limiter with custom values."""
        limiter = TokenBucketRateLimiter(
            requests_per_minute=120,
            burst_capacity=10
        )
        assert limiter.requests_per_minute == 120
        assert limiter.burst_capacity == 10

    @pytest.mark.asyncio
    async def test_acquire_success(self):
        """Test successful token acquisition."""
        limiter = TokenBucketRateLimiter(requests_per_minute=60, burst_capacity=10)
        result = await limiter.acquire()
        assert result is True

    @pytest.mark.asyncio
    async def test_acquire_with_wait(self):
        """Test acquisition with waiting - FIXED for Python 3.14."""
        limiter = TokenBucketRateLimiter(requests_per_minute=60, burst_capacity=1)

        assert await limiter.acquire_with_wait() is True

        start = time.monotonic()
        result = await limiter.acquire_with_wait(timeout=2.0)
        elapsed = time.monotonic() - start

        assert result is True
        assert elapsed >= 0.9

    @pytest.mark.asyncio
    async def test_acquire_with_timeout(self):
        """Test acquisition with timeout - FIXED for slow Windows systems."""
        # Use very low rate so refill is extremely slow
        limiter = TokenBucketRateLimiter(requests_per_minute=1, burst_capacity=1)

        # First acquire succeeds immediately
        await limiter.acquire_with_wait()

        # Second acquire should timeout because refill rate is 1/60 tokens per second
        # At this rate, it would take ~60 seconds to refill 1 token
        start = time.monotonic()
        result = await limiter.acquire_with_wait(timeout=0.5)
        elapsed = time.monotonic() - start

        # Should fail (timeout)
        assert result is False
        # Should have waited approximately the timeout duration
        # Allow wider range for Windows/Python 3.14 variations
        assert 0.3 <= elapsed <= 1.2, f"Elapsed time {elapsed} outside expected range"

    def test_get_stats(self):
        """Test getting limiter statistics."""
        limiter = TokenBucketRateLimiter(requests_per_minute=120, burst_capacity=10)

        asyncio.run(limiter.acquire(key="test"))

        stats = limiter.get_stats()
        assert "bucket_test" in stats or "default" in stats
        assert stats["default"]["capacity"] == 10


class TestSecurityUtilities:
    """Tests for security utilities."""

    @pytest.fixture(autouse=True)
    def setup_test_mode(self, monkeypatch):
        """Enable test mode for security utilities."""
        monkeypatch.setenv("BLOSSOM_AI_TEST_MODE", "true")

    def test_validate_file_path_valid(self, tmp_path):
        """Test validating valid file path."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("test")

        result = validate_file_path(test_file)
        assert result == test_file.resolve()

    def test_validate_image_file_in_test_mode(self, tmp_path, monkeypatch):
        """Test image validation in test mode."""
        monkeypatch.setenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", "true")
        monkeypatch.setenv("BLOSSOM_AI_TEST_MODE", "true")

        test_file = tmp_path / "test.jpg"
        test_file.write_text("fake image data")

        result = validate_image_file(test_file)
        assert result == test_file.resolve()

        bad_file = tmp_path / "test.exe"
        bad_file.write_text("fake")
        with pytest.raises(ValueError, match="Invalid image file extension"):
            validate_image_file(bad_file)

        monkeypatch.delenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", raising=False)
        monkeypatch.delenv("BLOSSOM_AI_TEST_MODE")

    def test_sanitize_filename_removes_dangerous_chars(self):
        """Test sanitizing dangerous characters."""
        dangerous = 'file<name>:test"|?*.txt'
        safe = sanitize_filename(dangerous)

        assert '<' not in safe
        assert '>' not in safe
        assert ':' not in safe
        assert '"' not in safe
        assert '|' not in safe
        assert '?' not in safe
        assert '*' not in safe

    def test_sanitize_filename_strips_whitespace(self):
        """Test sanitizing strips whitespace."""
        filename = "  test.txt  "
        safe = sanitize_filename(filename)
        assert safe == "test.txt"

    def test_sanitize_filename_enforces_length_limit(self):
        """Test sanitizing enforces length limit."""
        long_name = "x" * 200 + ".txt"
        safe = sanitize_filename(long_name)
        assert len(safe) <= 100

    def test_ensure_safe_directory_creates(self, tmp_path):
        """Test ensuring directory creation."""
        new_dir = tmp_path / "new" / "nested" / "dir"
        result = ensure_safe_directory(new_dir)

        assert result.exists()
        assert result.is_dir()

    def test_ensure_safe_directory_existing(self, tmp_path):
        """Test ensuring existing directory."""
        result = ensure_safe_directory(tmp_path)
        assert result == tmp_path.resolve()

    def test_generate_safe_filename_format(self):
        """Test generated filename format."""
        filename = generate_safe_filename(prefix="test", extension=".png")

        assert filename.startswith("test_")
        assert filename.endswith(".png")
        assert len(filename) > len("test_.png")

    def test_generate_safe_filename_unique(self):
        """Test generated filenames are unique."""
        filename1 = generate_safe_filename()
        filename2 = generate_safe_filename()
        assert filename1 != filename2


class TestAsyncUtils:
    """Tests for async utilities."""

    def test_run_async_from_sync(self):
        """Test running async from sync context."""

        async def async_function():
            return "test"

        result = _run_async(async_function())
        assert result == "test"

    def test_run_async_with_no_loop(self):
        """Test running async when no loop is running."""

        async def async_function():
            await asyncio.sleep(0.01)
            return "test"

        result = _run_async(async_function())
        assert result == "test"


class TestSugarLayerAPI:
    """Tests for sugar layer API with validation fixes."""

    @pytest.fixture(autouse=True)
    def reset_client(self):
        """Reset lazy client before each test."""
        _LazyClient.reset()
        yield
        _LazyClient.reset()

    def test_image_save_with_validation(self, tmp_path):
        """Test image save with validation."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient

        mock_client = Mock()
        mock_image_gen = Mock()

        async def mock_save(prompt, filename, **kwargs):
            from blossom_ai.core.errors import ValidationError
            if not filename or not isinstance(filename, str):
                raise TypeError("Filename must be string or Path")
            if isinstance(filename, str) and not filename.strip():
                raise ValueError("Filename cannot be empty")
            return Path(filename).absolute()

        mock_image_gen.save = mock_save
        mock_client.image = mock_image_gen

        _LazyClient._instance = mock_client

        with pytest.raises(ValueError, match="Filename cannot be empty"):
            ai.image.save("prompt", "")

        with pytest.raises(TypeError, match="Filename must be string or Path"):
            ai.image.save("prompt", 123)

    def test_text_generate_validation(self):
        """Test text generation with validation."""
        from blossom_ai.utils.sugar_layer.simple import _LazyClient
        mock_client = Mock()
        mock_text_gen = Mock()

        async def mock_generate(prompt, **kwargs):
            from blossom_ai.core.errors import ValidationError, handle_validation_error
            if not prompt or not isinstance(prompt, str):
                raise handle_validation_error(
                    param_name="prompt",
                    param_value=str(prompt)[:50],
                    reason="must be a non-empty string"
                )
            prompt_stripped = prompt.strip()
            if not prompt_stripped:
                raise ValueError("Prompt cannot be empty")
            return "Generated text"

        mock_text_gen.generate = mock_generate
        mock_client.text = mock_text_gen

        _LazyClient._instance = mock_client

        from blossom_ai.core.errors import ValidationError
        with pytest.raises(ValidationError, match="Prompt cannot be empty|must be a non-empty string"):
            ai.text.generate("")

        with pytest.raises(ValueError, match="Prompt cannot be empty"):
            ai.text.generate("   ")

    def test_chat_validation(self):
        """Test chat validation."""
        with pytest.raises(ValueError, match="Messages cannot be empty"):
            ai.text.chat([])

        with pytest.raises(TypeError, match="Messages must be a list"):
            ai.text.chat("not a list")

    def test_double_close_client(self):
        """Test that closing already closed client doesn't error."""
        client = _LazyClient.get()
        _run_async(client.close())

        _run_async(client.close())

        client.__exit__(None, None, None)


class TestCacheIntegration:
    """Integration tests for cache with fixed directory creation."""

    @pytest.fixture
    def cache_manager(self, tmp_path):
        """Cache manager with test config."""
        from blossom_ai.utils.cache import CacheManager, CacheConfig, CacheBackend

        config = CacheConfig(
            backend=CacheBackend.HYBRID,
            ttl=60,
            max_memory_size=5,
            max_disk_size=20,
        )

        logger = Mock()
        logger.debug = Mock()
        logger.info = Mock()

        return CacheManager(config, logger)

    def test_disk_cache_directory_creation(self, cache_manager):
        """Test that disk cache directories are created properly."""
        assert hasattr(cache_manager, "_cache_dir")
        assert cache_manager._cache_dir.exists()

        for subdir in ["text", "images", "metadata"]:
            assert (cache_manager._cache_dir / subdir).exists()

    @pytest.mark.asyncio
    async def test_cache_set_get_lifecycle(self, cache_manager):
        """Test complete cache set/get lifecycle."""
        key = "test_key"
        value = b"test_image_data"

        result = cache_manager.set(key, value)
        assert result is True

        cached = cache_manager.get(key)
        assert cached == value

        stats = cache_manager.get_stats()
        assert stats.hits == 1
        assert stats.misses == 0

        cached2 = cache_manager.get(key)
        assert cached2 == value

        stats2 = cache_manager.get_stats()
        assert stats2.hits == 2

        await cache_manager.aclear()