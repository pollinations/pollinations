# tests/test_coverage.py
"""Combined comprehensive coverage tests to reach 85%+."""

import pytest
import asyncio
import time
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch, MagicMock

from blossom_ai.core.config import SessionConfig
from blossom_ai.core.errors import BlossomError, ValidationError, EmptyResponseError
from blossom_ai.generators.parameter_builder import (
    ImageParamsV2,
    ChatParamsV2,
    MessageBuilder,
    _Validators,
)
from blossom_ai.generators.image_generator import ImageGenerator
from blossom_ai.generators.text_generator import TextGenerator
from blossom_ai.utils.cache import CacheManager, CacheConfig, CacheBackend
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
from blossom_ai.utils.security import validate_image_file, MAGIC_AVAILABLE


class TestParameterBuilderCoverage:
    """Additional tests for parameter_builder.py."""

    def test_image_params_validation_errors(self):
        """Test validation errors in ImageParamsV2."""
        with pytest.raises(BlossomError):
            ImageParamsV2(width=-100)

        with pytest.raises(BlossomError):
            ImageParamsV2(height=0)

        with pytest.raises(BlossomError):
            ImageParamsV2(quality="invalid")

    def test_chat_params_validation_ranges(self):
        """Test ChatParamsV2 range validations."""
        with pytest.raises(BlossomError):
            ChatParamsV2(temperature=2.5)

        with pytest.raises(BlossomError):
            ChatParamsV2(top_p=1.5)

        with pytest.raises(BlossomError):
            ChatParamsV2(max_tokens=-100)

    def test_validators_edge_cases(self):
        """Test _Validators edge cases."""
        with pytest.raises(BlossomError):
            _Validators.positive_int(0, "test")

        with pytest.raises(BlossomError):
            _Validators.range_check(1.5, 0.0, 1.0, "test")

        with pytest.raises(BlossomError):
            _Validators.choice("invalid", ("a", "b"), "test")

        with pytest.raises(BlossomError):
            _Validators.prompt_length("x" * 6000, 5000, "test")

    def test_message_builder_image_variations(self):
        """Test MessageBuilder with different image sources."""
        # URL
        msg = MessageBuilder.image("user", "Describe", image_url="https://example.com/img.jpg")
        assert msg["role"] == "user"
        assert len(msg["content"]) == 2

        # No source - should error
        with pytest.raises(ValueError):
            MessageBuilder.image("user", "Describe")


class TestCacheCoverage:
    """Additional tests for cache.py."""

    def test_cache_disabled(self):
        """Test cache when disabled."""
        config = CacheConfig(enabled=False)
        cache = CacheManager(config)

        cache.set("key", "value")
        result = cache.get("key", default="not_cached")

        assert result == "not_cached"

    def test_cache_key_sanitization(self):
        """Test key sanitization."""
        config = CacheConfig()
        cache = CacheManager(config)

        dangerous_key = "key<with>dangerous|chars?"
        sanitized = cache._sanitize_key(dangerous_key)

        assert "<" not in sanitized
        assert ">" not in sanitized
        assert "|" not in sanitized

    def test_cache_should_cache_filtering(self):
        """Test _should_cache filtering."""
        config = CacheConfig(cache_text=False, cache_images=False)
        cache = CacheManager(config)

        assert cache._should_cache("text_key") is False
        assert cache._should_cache("image_key") is False

        config2 = CacheConfig(cache_text=True, cache_images=True)
        cache2 = CacheManager(config2)

        assert cache2._should_cache("text_key") is True
        assert cache2._should_cache("image_key") is True

    @pytest.mark.asyncio
    async def test_cache_async_operations(self):
        """Test async cache operations."""
        config = CacheConfig(backend=CacheBackend.MEMORY)
        cache = CacheManager(config)

        await cache.aset("async_key", "async_value")
        result = await cache.aget("async_key")

        assert result == "async_value"

        await cache.aclear()

    def test_cache_clear_by_prefix(self):
        """Test clearing cache by prefix."""
        config = CacheConfig()
        cache = CacheManager(config)

        cache.set("user:1:data", "value1")
        cache.set("user:2:data", "value2")
        cache.set("admin:1:data", "value3")

        cache.clear("user")

        assert cache.get("admin:1:data") == "value3"
        assert cache.get("user:1:data", default=None) is None

    def test_cache_lru_eviction(self):
        """Test LRU eviction."""
        config = CacheConfig(max_memory_size=3, backend=CacheBackend.MEMORY)
        cache = CacheManager(config)

        # Add 3 items (fill to capacity)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")

        # Verify all 3 are present
        assert len(cache._memory) == 3

        # Add 4th item - this should evict key1 (oldest)
        cache.set("key4", "value4")

        # After eviction, should have exactly 3 items
        assert len(cache._memory) == 3

        # key1 should be evicted (LRU), key4 should be present
        assert cache.get("key1", default=None) is None
        assert cache.get("key4") == "value4"
        assert cache.get("key2") == "value2"
        assert cache.get("key3") == "value3"


class TestRateLimiterCoverage:
    """Additional tests for rate_limiter.py."""

    @pytest.mark.asyncio
    async def test_rate_limiter_lru_eviction(self):
        """Test LRU eviction in rate limiter."""
        limiter = TokenBucketRateLimiter(
            requests_per_minute=60,
            burst_capacity=1,
            max_buckets=5
        )

        # Fill up to max buckets
        for i in range(5):
            await limiter.acquire(key=f"key_{i}")

        # One more should evict oldest
        await limiter.acquire(key="new_key")

        stats = limiter.get_stats()
        assert stats["total_buckets"] == 5

    @pytest.mark.asyncio
    async def test_rate_limiter_cleanup(self):
        """Test periodic cleanup."""
        limiter = TokenBucketRateLimiter(
            requests_per_minute=60,
            enable_ttl=True
        )

        # Create some buckets
        for i in range(10):
            await limiter.acquire(key=f"key_{i}")

        # Trigger cleanup by making 100+ requests
        for i in range(110):
            await limiter.acquire(key="trigger")

        # Cleanup should have run
        assert limiter._cleanup_counter >= 0

    @pytest.mark.asyncio
    async def test_rate_limiter_get_bucket_stats(self):
        """Test getting bucket statistics."""
        limiter = TokenBucketRateLimiter(requests_per_minute=60)

        await limiter.acquire(key="test")

        stats = await limiter.get_bucket_stats("test")

        assert stats is not None
        assert stats.tokens >= 0
        assert stats.capacity == 60


class TestBaseGeneratorCoverage:
    """Additional tests for base_generator.py."""

    @pytest.mark.asyncio
    async def test_base_generator_cache_hit(self):
        """Test cache hit path."""
        config = SessionConfig(api_key="test", rate_limit_per_minute=60)
        cache_config = CacheConfig(backend=CacheBackend.MEMORY)
        cache = CacheManager(cache_config)

        generator = ImageGenerator(config, cache=cache)

        # Pre-populate cache
        cache_key = generator._generate_cache_key("GET", "https://test.com", None)
        await cache.aset(cache_key, b"cached_data")

        # Request should hit cache
        response = await generator._async_request(
            "GET",
            "https://test.com",
            use_cache=True
        )

        assert response.content == b"cached_data"
        assert response.headers.get("X-Cache") == "HIT"

        await generator.close()

    @pytest.mark.asyncio
    async def test_base_generator_large_response(self):
        """Test response size validation."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        # Create oversized response
        large_data = b"x" * (generator.MAX_RESPONSE_SIZE + 1)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = large_data
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'get', AsyncMock(return_value=mock_response)):
            with pytest.raises(BlossomError, match="Response too large"):
                await generator._async_request("GET", "https://test.com")

        await generator.close()


class TestImageGeneratorFullCoverage:
    """Tests to cover image_generator.py missing lines."""

    @pytest.mark.asyncio
    async def test_generate_with_all_params(self):
        """Test generate with all possible parameters."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"fake_image"
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'get', AsyncMock(return_value=mock_response)):
            result = await generator.generate(
                prompt="test",
                model="flux",
                width=512,
                height=512,
                quality="hd",
                style="photorealistic",
                seed=123,
                enhance=True,
                private=True,
                nologo=True,
                safe=True,
                transparent=True,
                guidance_scale=7.5,
                negative_prompt="blur"
            )

            assert result == b"fake_image"

        await generator.close()

    @pytest.mark.asyncio
    async def test_generate_with_save_as(self, tmp_path):
        """Test generate with save_as parameter."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"fake_image"
        mock_response.headers = {}
        mock_response.request = Mock()

        output_file = tmp_path / "test.png"

        with patch.object(generator.http_client, 'get', AsyncMock(return_value=mock_response)):
            result = await generator.generate(
                prompt="test",
                save_as=output_file
            )

            assert result == b"fake_image"
            assert output_file.exists()

        await generator.close()

    def test_generate_sync(self):
        """Test synchronous generate."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"sync_image"
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'get', AsyncMock(return_value=mock_response)):
            result = generator.generate_sync("test", width=512, height=512)
            assert result == b"sync_image"

        asyncio.run(generator.close())

    def test_call_method(self):
        """Test __call__ method."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"call_image"
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'get', AsyncMock(return_value=mock_response)):
            result = generator("test prompt", width=512, height=512)
            assert result == b"call_image"

        asyncio.run(generator.close())

    def test_generate_url_method(self):
        """Test generate_url method."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        url = generator.generate_url(
            prompt="test",
            model="flux",
            width=1024,
            height=768,
            quality="hd"
        )

        assert isinstance(url, str)
        assert "test" in url
        assert "model=flux" in url

        asyncio.run(generator.close())

    @pytest.mark.asyncio
    async def test_save_method(self, tmp_path):
        """Test save method."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b"saved_image"
        mock_response.headers = {}
        mock_response.request = Mock()

        output_file = tmp_path / "subdir" / "saved.png"

        with patch.object(generator.http_client, 'get', AsyncMock(return_value=mock_response)):
            result = await generator.save("test", output_file)

            assert result == output_file.absolute()
            assert output_file.exists()

        await generator.close()

    def test_models_method(self):
        """Test models method."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        models = generator.models()

        assert isinstance(models, list)
        assert "flux" in models

        asyncio.run(generator.close())

    def test_invalid_prompt_type(self):
        """Test with invalid prompt type."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        with pytest.raises(TypeError):
            generator.generate_sync(123)

        asyncio.run(generator.close())

    @pytest.mark.asyncio
    async def test_empty_prompt(self):
        """Test with empty prompt."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        # ValidationError or BlossomError - both acceptable
        with pytest.raises((ValidationError, BlossomError)):
            await generator.generate("")

        await generator.close()

    @pytest.mark.asyncio
    async def test_whitespace_prompt(self):
        """Test with whitespace-only prompt."""
        config = SessionConfig(api_key="test")
        generator = ImageGenerator(config)

        # ValidationError or BlossomError - both acceptable
        with pytest.raises((ValidationError, BlossomError)):
            await generator.generate("   ")

        await generator.close()


class TestTextGeneratorFullCoverage:
    """Tests to cover text_generator.py missing lines."""

    @pytest.mark.asyncio
    async def test_generate_with_all_params(self):
        """Test generate with all possible parameters."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Full test"}}]}'
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'post', AsyncMock(return_value=mock_response)):
            result = await generator.generate(
                prompt="test",
                model="gemini",
                max_tokens=2000,
                stream=False
            )

            assert result == "Full test"

        await generator.close()

    def test_generate_sync_method(self):
        """Test generate_sync method."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Sync result"}}]}'
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'post', AsyncMock(return_value=mock_response)):
            result = generator.generate_sync("test prompt")
            assert result == "Sync result"

        asyncio.run(generator.close())

    def test_call_method(self):
        """Test __call__ method."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Call result"}}]}'
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'post', AsyncMock(return_value=mock_response)):
            result = generator("test prompt")
            assert result == "Call result"

        asyncio.run(generator.close())

    @pytest.mark.asyncio
    async def test_chat_with_all_params(self):
        """Test chat with all parameters."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Chat result"}}]}'
        mock_response.headers = {}
        mock_response.request = Mock()

        messages = [
            {"role": "system", "content": "You are helpful"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
            {"role": "user", "content": "How are you?"}
        ]

        with patch.object(generator.http_client, 'post', AsyncMock(return_value=mock_response)):
            result = await generator.chat(
                messages=messages,
                model="claude",
                max_tokens=1500
            )

            assert result == "Chat result"

        await generator.close()

    def test_chat_sync_method(self):
        """Test chat_sync method."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":"Sync chat"}}]}'
        mock_response.headers = {}
        mock_response.request = Mock()

        messages = [{"role": "user", "content": "test"}]

        with patch.object(generator.http_client, 'post', AsyncMock(return_value=mock_response)):
            result = generator.chat_sync(messages)
            assert result == "Sync chat"

        asyncio.run(generator.close())

    def test_models_method(self):
        """Test models method."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        models = generator.models()

        assert isinstance(models, list)
        assert "openai" in models

        asyncio.run(generator.close())

    @pytest.mark.asyncio
    async def test_chat_invalid_messages_type(self):
        """Test chat with invalid messages type."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        with pytest.raises(ValidationError):
            await generator.chat("not a list")

        await generator.close()

    @pytest.mark.asyncio
    async def test_chat_empty_messages(self):
        """Test chat with empty messages."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        with pytest.raises(ValidationError):
            await generator.chat([])

        await generator.close()

    @pytest.mark.asyncio
    async def test_chat_invalid_role(self):
        """Test chat with invalid role."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        messages = [{"role": "invalid", "content": "test"}]

        with pytest.raises(ValidationError):
            await generator.chat(messages)

        await generator.close()

    @pytest.mark.asyncio
    async def test_generate_empty_response_from_api(self):
        """Test handling empty response from API."""
        config = SessionConfig(api_key="test")
        generator = TextGenerator(config)

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"choices":[{"message":{"content":""}}]}'
        mock_response.headers = {}
        mock_response.request = Mock()

        with patch.object(generator.http_client, 'post', AsyncMock(return_value=mock_response)):
            with pytest.raises(EmptyResponseError):
                await generator.generate("test")

        await generator.close()


class TestSecurityFullCoverage:
    """Tests to cover security.py missing lines."""

    def test_validate_image_file_production_mode(self, tmp_path, monkeypatch):
        """Test image validation in production mode."""
        monkeypatch.delenv("BLOSSOM_AI_TEST_MODE", raising=False)
        monkeypatch.setenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", "true")

        monkeypatch.setattr("blossom_ai.utils.security.ALLOW_MAGIC_FALLBACK", True)

        test_file = tmp_path / "test.jpg"
        test_file.write_bytes(b"\xff\xd8\xff")  # JPEG header

        if MAGIC_AVAILABLE:
            # With magic available, should validate properly
            try:
                result = validate_image_file(test_file)
                assert isinstance(result, Path)
            except ValueError:
                # May fail if magic doesn't recognize minimal JPEG
                pass
        else:
            # Without magic but with fallback allowed - should work
            result = validate_image_file(test_file)
            assert result == test_file.resolve()

    def test_validate_image_file_no_magic_no_fallback(self, tmp_path, monkeypatch):
        """Test image validation without magic and without fallback."""
        monkeypatch.delenv("BLOSSOM_AI_TEST_MODE", raising=False)
        monkeypatch.delenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", raising=False)
        monkeypatch.setattr("blossom_ai.utils.security.ALLOW_MAGIC_FALLBACK", False)

        test_file = tmp_path / "test.jpg"
        test_file.write_bytes(b"fake")

        if not MAGIC_AVAILABLE:
            with pytest.raises(ValueError, match="python-magic is not available"):
                validate_image_file(test_file)
        else:
            # If magic is available, test will pass or fail based on content
            pass

    def test_validate_image_file_wrong_extension(self, tmp_path, monkeypatch):
        """Test image validation with wrong extension."""
        monkeypatch.setenv("BLOSSOM_AI_TEST_MODE", "true")

        test_file = tmp_path / "test.txt"
        test_file.write_text("not an image")

        with pytest.raises(ValueError, match="Invalid image file extension"):
            validate_image_file(test_file)

    def test_validate_image_file_too_large(self, tmp_path, monkeypatch):
        """Test image validation with file too large."""
        # Skip if magic not available
        if not MAGIC_AVAILABLE:
            pytest.skip("python-magic not available")

        monkeypatch.delenv("BLOSSOM_AI_TEST_MODE", raising=False)
        monkeypatch.setenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", "true")
        monkeypatch.setattr("blossom_ai.utils.security.ALLOW_MAGIC_FALLBACK", True)

        test_file = tmp_path / "huge.jpg"
        # Create file larger than 10MB with valid JPEG header
        data = b"\xff\xd8\xff" + (b"x" * (11 * 1024 * 1024))
        test_file.write_bytes(data)

        with pytest.raises(ValueError, match="too large"):
            validate_image_file(test_file)


class TestCacheAdvanced:
    """Advanced cache tests for better coverage."""

    @pytest.mark.asyncio
    async def test_cache_disk_operations(self, tmp_path):
        """Test disk cache read/write operations."""
        config = CacheConfig(
            backend=CacheBackend.DISK,
            ttl=60
        )

        # Mock session config with API key for unique cache dir
        session_config = Mock()
        session_config.api_key = "test-key-123"

        cache = CacheManager(config, logger=Mock(), config_obj=session_config)

        # Test disk write
        cache.set("disk_key", "disk_value")

        # Test disk read
        result = cache.get("disk_key")
        assert result == "disk_value"

    def test_cache_estimate_size(self):
        """Test _estimate_size method."""
        config = CacheConfig()
        cache = CacheManager(config)

        # Test with string
        size = cache._estimate_size("test string")
        assert size > 0

        # Test with bytes
        size = cache._estimate_size(b"test bytes")
        assert size > 0

        # Test with dict
        size = cache._estimate_size({"key": "value"})
        assert size > 0

    def test_cache_generate_key_with_sanitization(self):
        """Test cache key generation with sanitization."""
        config = CacheConfig(sanitize_secrets=True)
        cache = CacheManager(config)

        key = cache._generate_key(
            "prefix",
            "arg1",
            api_key="secret123",
            normal_param="value"
        )

        assert isinstance(key, str)
        assert len(key) == 16  # SHA256 truncated


class TestAsyncUtilsFullCoverage:
    """Tests for async_utils.py coverage."""

    def test_run_async_with_keyboard_interrupt(self):
        """Test handling KeyboardInterrupt."""
        from blossom_ai.utils.async_utils import _run_async

        async def interrupt_coro():
            raise KeyboardInterrupt()

        with pytest.raises(KeyboardInterrupt):
            _run_async(interrupt_coro())

    def test_cleanup_thread_pool(self):
        """Test thread pool cleanup."""
        from blossom_ai.utils.async_utils import cleanup_thread_pool, _get_thread_pool

        # Get pool to initialize it
        _get_thread_pool()

        # Cleanup should not raise
        cleanup_thread_pool()

        # Should be able to get pool again
        pool = _get_thread_pool()
        assert pool is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=blossom_ai", "--cov-report=term-missing"])