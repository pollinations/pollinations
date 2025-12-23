"""Tests for cache module."""

import asyncio
import time
from pathlib import Path
from unittest.mock import Mock, MagicMock, AsyncMock, patch
import pytest

from blossom_ai.utils.cache import (
    CacheManager,
    CacheConfig,
    CacheBackend,
    CacheEntry,
    CacheStats,
    get_default_cache,
)
from blossom_ai.core.config import SessionConfig


class TestCacheConfig:
    """Tests for CacheConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = CacheConfig()
        assert config.enabled is True
        assert config.backend == CacheBackend.HYBRID
        assert config.ttl == 3600
        assert config.max_memory_size == 100
        assert config.max_disk_size == 1000
        assert config.compress is True
        assert config.cache_text is True
        assert config.cache_images is False

    def test_custom_config(self):
        """Test custom configuration values."""
        config = CacheConfig(
            enabled=False,
            backend=CacheBackend.MEMORY,
            ttl=7200,
            max_memory_size=200,
            max_disk_size=500,
            compress=False,
            cache_text=False,
            cache_images=True,
        )
        assert config.enabled is False
        assert config.backend == CacheBackend.MEMORY
        assert config.ttl == 7200
        assert config.max_memory_size == 200
        assert config.max_disk_size == 500
        assert config.compress is False
        assert config.cache_text is False
        assert config.cache_images is True


class TestCacheEntry:
    """Tests for CacheEntry."""

    def test_cache_entry_creation(self):
        """Test CacheEntry creation."""
        entry = CacheEntry(key="test", value="data", timestamp=time.monotonic())
        assert entry.key == "test"
        assert entry.value == "data"
        assert entry.hits == 0
        assert entry.size == 0

    def test_is_expired(self):
        """Test TTL expiration check."""
        entry = CacheEntry(key="test", value="data", timestamp=time.monotonic())
        assert entry.is_expired(ttl=60) is False

        # Simulate expired entry
        entry.timestamp = time.monotonic() - 120
        assert entry.is_expired(ttl=60) is True

    def test_touch(self):
        """Test touch method updates hits and timestamp."""
        entry = CacheEntry(key="test", value="data", timestamp=100.0)
        entry.touch()
        assert entry.hits == 1
        # Can't reliably test timestamp value, but it should be updated
        assert entry.timestamp > 100.0


class TestCacheStats:
    """Tests for CacheStats."""

    def test_hit_rate_zero(self):
        """Test hit rate with no operations."""
        stats = CacheStats()
        assert stats.hit_rate == 0.0

    def test_hit_rate_calculation(self):
        """Test hit rate calculation."""
        stats = CacheStats(hits=75, misses=25)
        assert stats.hit_rate == 75.0

    def test_hit_rate_100_percent(self):
        """Test 100% hit rate."""
        stats = CacheStats(hits=100, misses=0)
        assert stats.hit_rate == 100.0

    def test_hit_rate_0_percent(self):
        """Test 0% hit rate."""
        stats = CacheStats(hits=0, misses=50)
        assert stats.hit_rate == 0.0


class TestCacheManager:
    """Tests for CacheManager."""

    @pytest.fixture
    def memory_config(self):
        """Memory-only cache config."""
        return CacheConfig(
            backend=CacheBackend.MEMORY,
            max_memory_size=10,
            ttl=60,
        )

    @pytest.fixture
    def hybrid_config(self):
        """Hybrid cache config for disk testing."""
        return CacheConfig(
            backend=CacheBackend.HYBRID,
            max_memory_size=5,
            max_disk_size=20,
            ttl=60,
        )

    @pytest.fixture
    def mock_logger(self):
        """Mock logger."""
        logger = MagicMock()
        logger.debug = Mock()
        logger.info = Mock()
        logger.warning = Mock()
        logger.error = Mock()
        return logger

    @pytest.fixture
    def mock_session_config(self):
        """Mock session config."""
        config = MagicMock(spec=SessionConfig)
        config.api_key = "test-key-12345"
        config.cache_enabled = True
        config.cache_backend = "hybrid"
        config.cache_ttl = 3600
        config.cache_max_memory = 100
        return config

    def test_init_memory_backend(self, memory_config, mock_logger):
        """Test initialization with memory backend."""
        manager = CacheManager(memory_config, mock_logger)
        assert manager.config == memory_config
        assert manager.logger == mock_logger
        assert len(manager._memory) == 0
        assert manager.stats.hits == 0
        assert manager.stats.misses == 0

    def test_init_hybrid_backend(self, hybrid_config, mock_logger, mock_session_config):
        """Test initialization with hybrid backend."""
        manager = CacheManager(hybrid_config, mock_logger, mock_session_config)
        assert manager.config.backend == CacheBackend.HYBRID
        assert hasattr(manager, "_cache_dir")
        assert "blossom_cache" in str(manager._cache_dir)

    def test_sanitize_key(self, memory_config):
        """Test key sanitization."""
        manager = CacheManager(memory_config)
        # Dangerous characters should be replaced
        sanitized = manager._sanitize_key("key<with>dangerous|chars?")
        assert "<" not in sanitized
        assert ">" not in sanitized
        assert "|" not in sanitized
        assert "?" not in sanitized
        # Length limit
        long_key = "a" * 200
        sanitized = manager._sanitize_key(long_key)
        assert len(sanitized) <= 100

    def test_memory_get_miss(self, memory_config):
        """Test memory cache miss."""
        manager = CacheManager(memory_config)
        result = manager.get("nonexistent_key", default="default_value")
        assert result == "default_value"
        assert manager.stats.misses == 1

    def test_memory_get_hit(self, memory_config):
        """Test memory cache hit."""
        manager = CacheManager(memory_config)
        manager.set("test_key", "test_value")
        result = manager.get("test_key")
        assert result == "test_value"
        assert manager.stats.hits == 1
        assert manager.stats.misses == 0

    def test_memory_lru_eviction(self, memory_config):
        """Test LRU eviction in memory cache."""
        manager = CacheManager(memory_config)

        # Fill cache to capacity
        for i in range(10):
            manager.set(f"key_{i}", f"value_{i}")

        assert len(manager._memory) == 10

        # Add one more, should evict oldest
        manager.set("key_10", "value_10")
        assert len(manager._memory) == 10

        # Check that oldest key was evicted
        assert manager.get("key_0", default=None) is None
        assert manager.get("key_10") == "value_10"
        assert manager.stats.evictions > 0

    def test_ttl_expiration(self, memory_config):
        """Test TTL expiration."""
        config = CacheConfig(ttl=0.1)  # Very short TTL
        manager = CacheManager(config)
        manager.set("test_key", "test_value")

        # Should be present immediately
        assert manager.get("test_key") == "test_value"

        # Wait for expiration
        time.sleep(0.2)

        # Should be expired now
        result = manager.get("test_key", default="expired")
        assert result == "expired"
        assert manager.stats.misses == 1  # Fixed: Only one miss

    @pytest.mark.asyncio
    async def test_async_get_miss(self, memory_config):
        """Test async cache miss."""
        manager = CacheManager(memory_config)
        result = await manager.aget("async_key", default="async_default")
        assert result == "async_default"
        assert manager.stats.misses == 1

    @pytest.mark.asyncio
    async def test_async_get_hit(self, memory_config):
        """Test async cache hit."""
        manager = CacheManager(memory_config)
        manager.set("async_key", "async_value")
        result = await manager.aget("async_key")
        assert result == "async_value"
        assert manager.stats.hits == 1

    @pytest.mark.asyncio
    async def test_async_set_and_get(self, memory_config):
        """Test async set and get operations."""
        manager = CacheManager(memory_config)
        await manager.aset("async_test", "async_value")
        result = await manager.aget("async_test")
        assert result == "async_value"

    def test_clear_all(self, memory_config):
        """Test clearing all cache entries."""
        manager = CacheManager(memory_config)
        for i in range(5):
            manager.set(f"key_{i}", f"value_{i}")

        assert len(manager._memory) == 5
        manager.clear()
        assert len(manager._memory) == 0

    def test_clear_by_prefix(self, memory_config):
        """Test clearing cache by prefix."""
        manager = CacheManager(memory_config)
        manager.set("user:1:data", "value1")
        manager.set("user:2:data", "value2")
        manager.set("admin:1:data", "value3")
        manager.clear("user")

        assert manager.get("admin:1:data") == "value3"
        assert manager.get("user:1:data", default=None) is None
        assert manager.get("user:2:data", default=None) is None

    def test_get_stats(self, memory_config):
        """Test statistics retrieval."""
        manager = CacheManager(memory_config)
        manager.set("key1", "value1")
        manager.set("key2", "value2")
        manager.get("key1")
        manager.get("nonexistent")

        stats = manager.get_stats()
        assert stats.hits == 1
        assert stats.misses == 1
        assert stats.evictions == 0
        assert stats.hit_rate == 50.0

    @pytest.mark.asyncio
    async def test_async_clear(self, memory_config):
        """Test async clear operations."""
        manager = CacheManager(memory_config)
        await manager.aset("async_key", "async_value")

        await manager.aclear()
        result = await manager.aget("async_key", default=None)
        assert result is None

    def test_disabled_cache(self):
        """Test operations with disabled cache."""
        config = CacheConfig(enabled=False)
        manager = CacheManager(config)

        manager.set("test", "value")
        result = manager.get("test", default="not_cached")

        assert result == "not_cached"
        assert len(manager._memory) == 0

    @pytest.mark.asyncio
    async def test_thread_safety_basic(self, memory_config):
        """Basic thread safety test with concurrent async operations."""
        memory_config = CacheConfig(
            backend=CacheBackend.MEMORY,
            max_memory_size=50,
            ttl=60,
        )

        manager = CacheManager(memory_config)

        async def set_value(i):
            await manager.aset(f"key_{i}", f"value_{i}")

        async def get_value(i):
            return await manager.aget(f"key_{i}", default="miss")

        await asyncio.gather(*[set_value(i) for i in range(20)])
        await asyncio.sleep(0.1)

        results = []
        for i in range(20):
            results.append(await get_value(i))

        miss_count = results.count("miss")
        assert miss_count == 0, f"Expected 0 misses, got {miss_count}"

    def test_should_cache_filtering(self, memory_config):
        """Test cache filtering by content type."""
        config = CacheConfig(cache_text=False, cache_images=False)
        manager = CacheManager(config)

        assert manager._should_cache("text_key") is False
        assert manager._should_cache("image_key") is False

        config = CacheConfig(cache_text=True, cache_images=True)
        manager = CacheManager(config)

        assert manager._should_cache("text_key") is True
        assert manager._should_cache("image_key") is True


class TestCachedDecorator:
    """Tests for @cached decorator."""

    @pytest.fixture
    def cache_manager(self):
        """Cache manager for decorator tests."""
        config = CacheConfig(backend=CacheBackend.MEMORY, ttl=60)
        return CacheManager(config)

    def test_sync_decorator(self, cache_manager):
        """Test synchronous cached decorator."""
        call_count = 0

        @cache_manager.cached("test_prefix")
        def expensive_function(x):
            nonlocal call_count
            call_count += 1
            return x * 2

        # First call
        result1 = expensive_function(5)
        assert result1 == 10
        assert call_count == 1

        # Second call should use cache
        result2 = expensive_function(5)
        assert result2 == 10
        assert call_count == 1

        # Different argument should trigger new call
        result3 = expensive_function(10)
        assert result3 == 20
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_async_decorator(self, cache_manager):
        """Test asynchronous cached decorator."""
        call_count = 0

        @cache_manager.cached("async_prefix")
        async def async_expensive_function(x):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.01)
            return x * 3

        # First call
        result1 = await async_expensive_function(5)
        assert result1 == 15
        assert call_count == 1

        # Second call should use cache
        result2 = await async_expensive_function(5)
        assert result2 == 15
        assert call_count == 1

    def test_decorator_disabled_cache(self):
        """Test decorator behavior when cache is disabled."""
        config = CacheConfig(enabled=False)
        cache_manager = CacheManager(config)

        call_count = 0

        @cache_manager.cached("disabled_test")
        def function(x):
            nonlocal call_count
            call_count += 1
            return x

        # Should call function every time
        function(1)
        function(1)
        assert call_count == 2

    def test_decorator_with_kwargs(self, cache_manager):
        """Test decorator with keyword arguments."""
        call_count = 0

        @cache_manager.cached("kwargs_test")
        def function(a, b=2):
            nonlocal call_count
            call_count += 1
            return a + b

        # Same result should use cache
        result1 = function(3, b=2)
        result2 = function(3, b=2)
        assert result1 == result2 == 5
        assert call_count == 1


class TestGetDefaultCache:
    """Tests for get_default_cache factory."""

    def test_factory_with_session_config(self):
        """Test factory function with SessionConfig."""
        config = SessionConfig(
            cache_enabled=True,
            cache_backend="disk",
            cache_ttl=7200,
            cache_max_memory=50,
        )

        logger = MagicMock()
        cache_manager = get_default_cache(config, logger)

        assert isinstance(cache_manager, CacheManager)
        assert cache_manager.config.enabled is True
        assert cache_manager.config.backend == CacheBackend.DISK
        assert cache_manager.config.ttl == 7200
        assert cache_manager.config.max_memory_size == 50


class TestCacheIntegrationWithClient:
    """Integration tests for cache with BlossomClient."""

    @pytest.mark.asyncio
    async def test_client_cache_hit(self, test_config, mock_logger, async_mock_http_client, mock_rate_limiter):
        """Test that client properly uses cache for repeated requests."""
        from blossom_ai.client import BlossomClient

        # Create cache manager
        cache_config = CacheConfig(ttl=3600, backend=CacheBackend.MEMORY)
        cache = CacheManager(cache_config, mock_logger)

        # Create proper mock response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"fake_image_data"
        mock_response.headers = {}  # CRITICAL: Add headers
        mock_response.raise_for_status = Mock()

        async_mock_http_client.get = AsyncMock(return_value=mock_response)

        # Create client with cache
        client = BlossomClient(
            config=test_config,
            logger=mock_logger,
            http_client=async_mock_http_client,
            rate_limiter=mock_rate_limiter,
            cache=cache,
        )

        # First request
        result1 = await client.image.generate("A cat", width=512, height=512)

        # Second identical request should hit cache
        result2 = await client.image.generate("A cat", width=512, height=512)

        assert result1 == result2 == b"fake_image_data"
        # HTTP client should only be called ONCE
        async_mock_http_client.get.assert_called_once()

        await client.close()

    @pytest.mark.asyncio
    async def test_client_cache_integration_disabled(self, test_config, mock_logger, async_mock_http_client,
                                                     mock_rate_limiter):
        """Test client behavior when cache is disabled."""
        from blossom_ai.client import BlossomClient

        # Create cache manager with disabled cache
        cache_config = CacheConfig(enabled=False)
        cache = CacheManager(cache_config, mock_logger)

        client = BlossomClient(
            config=test_config,
            logger=mock_logger,
            http_client=async_mock_http_client,
            rate_limiter=mock_rate_limiter,
            cache=cache,
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"fake_image_data"
        mock_response.headers = {}  # CRITICAL: Add headers
        mock_response.raise_for_status = Mock()

        async_mock_http_client.get = AsyncMock(return_value=mock_response)

        # Multiple requests should all hit the API
        await client.image.generate("Test prompt", width=512, height=512)
        await client.image.generate("Test prompt", width=512, height=512)

        # Should be called twice because cache is disabled
        assert async_mock_http_client.get.call_count == 2

        await client.close()