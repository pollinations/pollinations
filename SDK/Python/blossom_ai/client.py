"""
Main Blossom AI client with simplified developer-facing API.
"""

from __future__ import annotations
import asyncio
import time
from pathlib import Path
from typing import Optional, Dict, Any, Union
from blossom_ai._version import __version__
from blossom_ai.core.config import SessionConfig, ENDPOINTS
from blossom_ai.core.interfaces import (
    ConfigProtocol,
    HttpClientProtocol,
    LoggerProtocol,
    RateLimiterInterface,
    CacheBackendProtocol,
)
from blossom_ai.utils.http_client import HttpxClient
from blossom_ai.utils.logging import StructuredLogger
from blossom_ai.utils.rate_limiter import TokenBucketRateLimiter
from blossom_ai.utils.security import ensure_safe_directory, sanitize_filename

__all__ = ["BlossomClient"]


class BlossomClient:
    """
    Unified Blossom AI client with integrated caching, rate limiting, and security.

    Usage (sync):
        >>> with BlossomClient() as client:
        ...     text = client.text.generate_sync("Write a poem about cats")
        ...     client.image("A cat in space", save_as="cat.png")

    Usage (async):
        >>> async with BlossomClient() as client:
        ...     text = await client.text.generate("Write a poem")
        ...     image = await client.image.generate("A cat in space")

    Dependency Injection:
        >>> custom_cache = CacheManager(config, logger)
        >>> client = BlossomClient(config=config, cache=custom_cache)
    """

    def __init__(
        self,
        config: Optional[ConfigProtocol] = None,
        http_client: Optional[HttpClientProtocol] = None,
        logger: Optional[LoggerProtocol] = None,
        rate_limiter: Optional[RateLimiterInterface] = None,
        cache: Optional[CacheBackendProtocol] = None,
    ) -> None:
        """
        Initialise the client with dependency injection support.

        Args:
            config: Optional configuration. If omitted, built from env vars.
            http_client: Optional HTTP client for testing.
            logger: Optional logger instance.
            rate_limiter: Optional rate limiter.
            cache: Optional cache backend. Auto-created if config.cache_enabled=True.
        """
        # Load environment variables if config is not provided
        if config is None:
            from dotenv import load_dotenv
            load_dotenv(Path(__file__).resolve().parent.parent / ".env")

        self.config: ConfigProtocol = config or SessionConfig.from_env()
        self.logger: LoggerProtocol = logger or StructuredLogger("blossom_client")

        # HTTP client
        self.http_client: HttpClientProtocol = http_client or HttpxClient(
            self.config, self.logger
        )

        # Rate limiter - ensure we get a reasonable default value
        if rate_limiter:
            self.rate_limiter: RateLimiterInterface = rate_limiter
        else:
            # Get rate limit with fallback to 60 if not set
            rate_limit = getattr(self.config, 'rate_limit_per_minute', 60)
            if not isinstance(rate_limit, int) or rate_limit <= 0:
                rate_limit = 60  # Default fallback
            self.rate_limiter: RateLimiterInterface = TokenBucketRateLimiter(rate_limit)

        # Cache
        self.cache: Optional[CacheBackendProtocol] = cache
        if self.cache is None and self.config.cache_enabled:
            from blossom_ai.utils.cache import get_default_cache
            try:
                self.cache = get_default_cache(self.config, self.logger)
                self.logger.info("Cache initialized", backend=self.config.cache_backend)
            except Exception as e:
                self.logger.warning("Failed to initialize cache", error=str(e))
                self.cache = None

        # Generators will be initialized lazily
        self._text = None
        self._image = None

        self._closed = False
        self._initialized_logger()

    @property
    def text(self) -> 'TextGenerator':
        """Lazy initialization of text generator."""
        if self._text is None:
            from blossom_ai.generators.text_generator import TextGenerator
            self._text = TextGenerator(
                self.config,
                self.http_client,
                self.logger,
                self.rate_limiter,
                cache=self.cache,
            )
        return self._text

    @property
    def image(self) -> 'ImageGenerator':
        """Lazy initialization of image generator."""
        if self._image is None:
            from blossom_ai.generators.image_generator import ImageGenerator
            self._image = ImageGenerator(
                self.config,
                self.http_client,
                self.logger,
                self.rate_limiter,
                cache=self.cache,
            )
        return self._image

    def _initialized_logger(self) -> None:
        """Initialize logger after all properties are set."""
        base_url = getattr(self.config, 'base_url', None) or getattr(ENDPOINTS, 'BASE', 'N/A')
        self.logger.info(
            "BlossomClient initialized",
            base_url=base_url,
            rate_limit=self.rate_limiter.requests_per_minute if hasattr(self.rate_limiter, 'requests_per_minute') else getattr(self.config, 'rate_limit_per_minute', 'unknown'),
            cache_enabled=self.config.cache_enabled,
            version=__version__,
        )

    async def close(self) -> None:
        """Close all underlying resources: HTTP client, cache, rate limiter."""
        if self._closed:
            return

        try:
            await self.http_client.close()

            # Close rate limiter if it has a close method
            if self.rate_limiter and hasattr(self.rate_limiter, 'close'):
                await self.rate_limiter.close()

            if self.cache and hasattr(self.cache, 'aclose'):
                await self.cache.aclose()

            self._closed = True
            self.logger.info("BlossomClient closed successfully")
        except Exception as e:
            self.logger.error("Error during client shutdown", error=str(e), exc_info=True)

    async def __aenter__(self) -> BlossomClient:
        """Async context entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context exit with graceful shutdown."""
        await self.close()

    def __enter__(self) -> BlossomClient:
        """Sync context entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Sync context exit with guaranteed cleanup."""
        if self._closed:
            return

        from blossom_ai.utils.async_utils import _run_async
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            _run_async(self.close())
        else:
            _run_async(self.close())

    def get_stats(self) -> Dict[str, Any]:
        """Get client statistics including cache and rate limiter."""
        stats = {
            "rate_limiter": self.rate_limiter.get_stats() if hasattr(self.rate_limiter, 'get_stats') else None,
            "cache": None,
        }

        # Check if cache has get_stats method
        if self.cache and hasattr(self.cache, 'get_stats'):
            try:
                cache_stats = self.cache.get_stats()
                # Validate cache stats object structure
                if hasattr(cache_stats, 'hit_rate') and hasattr(cache_stats, 'hits') and hasattr(cache_stats, 'misses'):
                    stats["cache"] = {
                        "hit_rate": float(getattr(cache_stats, 'hit_rate', 0.0)),
                        "hits": int(getattr(cache_stats, 'hits', 0)),
                        "misses": int(getattr(cache_stats, 'misses', 0)),
                        "evictions": int(getattr(cache_stats, 'evictions', 0)),
                    }
                else:
                    self.logger.warning("Cache stats object has unexpected structure", cache_stats_type=type(cache_stats))
            except Exception as e:
                self.logger.warning("Failed to get cache stats", error=str(e), exc_info=True)

        return stats