# blossom_ai/utils/rate_limiter.py

"""
Token Bucket Rate Limiter with LRU eviction and TTL cleanup.
"""

import asyncio
import time
import contextvars
from typing import Dict, Optional, Union, Any
from dataclasses import dataclass, field
from collections import OrderedDict

from blossom_ai.core.interfaces import RateLimiterInterface


@dataclass
class TokenBucket:
    """Token bucket for rate limiting with refill mechanism."""
    capacity: int
    refill_rate: float
    tokens: float = field(init=False)
    last_update: float = field(init=False)
    _lock: asyncio.Lock = field(init=False)

    def __post_init__(self) -> None:
        self.tokens = self.capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def _refill(self) -> None:
        """Refill tokens based on elapsed time."""
        now = time.monotonic()
        elapsed = now - self.last_update
        self.last_update = now
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)

    async def try_acquire(self, tokens: int = 1) -> bool:
        """Try to acquire tokens without waiting."""
        async with self._lock:
            await self._refill()
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            return False

    async def time_until_available(self, tokens: int = 1) -> float:
        """Calculate time until tokens are available."""
        async with self._lock:
            await self._refill()
            if self.tokens >= tokens:
                return 0.0
            needed = tokens - self.tokens
            return needed / self.refill_rate


@dataclass
class TokenBucketWithMeta(TokenBucket):
    """Token bucket with metadata for LRU tracking."""
    last_used: float = field(default_factory=time.monotonic)
    created_at: float = field(default_factory=time.monotonic)


@dataclass
class BucketStats:
    """Statistics for a single bucket."""
    tokens: float
    capacity: int
    refill_rate: float
    last_used: float
    created_at: float
    is_expired: bool


class TokenBucketRateLimiter(RateLimiterInterface):

    DEFAULT_REQUESTS_PER_MINUTE = 60
    DEFAULT_BURST_CAPACITY = 60
    MIN_SLEEP_INTERVAL = 0.01
    MAX_SLEEP_INTERVAL = 1.0
    MAX_BUCKETS = 1000  # Default max buckets, can be overridden
    BUCKET_TTL_SECONDS = 3600  # 1 hour

    def __init__(
            self,
            requests_per_minute: int = DEFAULT_REQUESTS_PER_MINUTE,
            burst_capacity: Optional[int] = None,
            enable_ttl: bool = True,
            max_buckets: int = 1000
    ) -> None:
        """
        Initialize rate limiter.

        Args:
            requests_per_minute: Maximum requests per minute
            burst_capacity: Maximum burst capacity (defaults to requests_per_minute)
            enable_ttl: Enable TTL-based bucket expiration
            max_buckets: Maximum number of buckets to maintain (LRU eviction)
        """
        if requests_per_minute <= 0:
            raise ValueError("requests_per_minute must be positive")

        self.requests_per_minute = requests_per_minute
        self.burst_capacity = burst_capacity or requests_per_minute
        self.refill_rate = requests_per_minute / 60.0
        self.enable_ttl = enable_ttl
        self.MAX_BUCKETS = max_buckets  # Make it configurable

        self._buckets: OrderedDict[str, TokenBucketWithMeta] = OrderedDict()
        self._bucket_lock = asyncio.Lock()

        # Default bucket for key="default"
        self._default_bucket = TokenBucketWithMeta(
            capacity=self.burst_capacity,
            refill_rate=self.refill_rate
        )

        self._cleanup_counter = 0
        self._cleanup_interval = 100  # Cleanup every 100 requests

    async def _cleanup_expired_buckets(self) -> None:
        """
        FIXED: Optimized cleanup - runs periodically instead of every request.

        Changes:
        - Only runs every 100 requests (configurable)
        - Skips if TTL disabled
        - Better performance for high-throughput scenarios
        """
        if not self.enable_ttl:
            return

        self._cleanup_counter += 1
        if self._cleanup_counter < self._cleanup_interval:
            return  # Skip cleanup this time

        self._cleanup_counter = 0  # Reset counter

        now = time.monotonic()
        expired_keys = []

        async with self._bucket_lock:
            for key, bucket in self._buckets.items():
                if now - bucket.created_at > self.BUCKET_TTL_SECONDS:
                    expired_keys.append(key)

            for key in expired_keys:
                if key in self._buckets:
                    del self._buckets[key]

    async def _get_bucket(self, key: str) -> TokenBucketWithMeta:
        # Cleanup runs periodically, not every time
        await self._cleanup_expired_buckets()

        async with self._bucket_lock:
            if key in self._buckets:
                # FIXED: Move to end for LRU (most recently used)
                bucket = self._buckets.pop(key)
                bucket.last_used = time.monotonic()
                self._buckets[key] = bucket  # Re-insert at end
                return bucket

            # Enforce MAX_BUCKETS limit with LRU eviction
            if len(self._buckets) >= self.MAX_BUCKETS:
                # Remove oldest (first item in OrderedDict)
                oldest_key = next(iter(self._buckets))
                del self._buckets[oldest_key]

            # Create new bucket
            bucket = TokenBucketWithMeta(
                capacity=self.burst_capacity,
                refill_rate=self.refill_rate
            )
            self._buckets[key] = bucket
            return bucket

    async def acquire(self, key: str = "default") -> bool:
        """
        Try to acquire a token without waiting.

        Returns:
            True if token acquired, False otherwise
        """
        if key == "default":
            return await self._default_bucket.try_acquire()

        bucket = await self._get_bucket(key)
        return await bucket.try_acquire()

    async def acquire_with_wait(
            self,
            key: str = "default",
            timeout: Optional[float] = None
    ) -> bool:
        """
        Acquire a token, waiting if necessary.

        Args:
            key: Bucket identifier
            timeout: Maximum time to wait in seconds

        Returns:
            True if token acquired, False if timed out
        """
        if key == "default":
            bucket = self._default_bucket
        else:
            bucket = await self._get_bucket(key)

        start_time = time.monotonic()
        attempt = 0

        while True:
            if await bucket.try_acquire():
                return True

            # Check timeout
            if timeout is not None:
                elapsed = time.monotonic() - start_time
                if elapsed >= timeout:
                    return False

            # Calculate wait time with exponential backoff
            wait_time = await bucket.time_until_available()
            backoff_factor = 1.5 ** min(attempt, 5)
            sleep_duration = min(wait_time * backoff_factor, self.MAX_SLEEP_INTERVAL)
            sleep_duration = max(sleep_duration, self.MIN_SLEEP_INTERVAL)

            await asyncio.sleep(sleep_duration)
            attempt += 1

    async def release(self, key: str = "default") -> None:
        """Release is a no-op for token bucket (tokens refill automatically)."""
        pass

    async def get_bucket_stats(self, key: str = "default") -> Optional[BucketStats]:
        """Get statistics for a specific bucket."""
        if key == "default":
            bucket = self._default_bucket
        else:
            async with self._bucket_lock:
                bucket = self._buckets.get(key)

        if not bucket:
            return None

        return BucketStats(
            tokens=bucket.tokens,
            capacity=bucket.capacity,
            refill_rate=bucket.refill_rate,
            last_used=bucket.last_used,
            created_at=bucket.created_at,
            is_expired=self.enable_ttl and (time.monotonic() - bucket.created_at) > self.BUCKET_TTL_SECONDS
        )

    def get_stats(self) -> Dict[str, Union[int, Dict[str, Any]]]:
        """
        Get rate limiter statistics.

        Returns:
            Dictionary with statistics for default bucket and all tracked buckets
        """
        total_buckets = len(self._buckets)

        stats = {
            "default": {
                "tokens": self._default_bucket.tokens,
                "capacity": self._default_bucket.capacity,
                "refill_rate": self._default_bucket.refill_rate,
            },
            "total_buckets": total_buckets,
            "ttl_enabled": self.enable_ttl,
            "max_buckets": self.MAX_BUCKETS,
        }

        # Only include individual bucket stats if there aren't too many
        if total_buckets <= 50:
            for key, bucket in self._buckets.items():
                stats[f"bucket_{key}"] = {
                    "tokens": bucket.tokens,
                    "capacity": bucket.capacity,
                    "last_used_age_seconds": time.monotonic() - bucket.last_used,
                    "created_age_seconds": time.monotonic() - bucket.created_at,
                }

        return stats

    async def close(self) -> None:
        async with self._bucket_lock:
            self._buckets.clear()
            self._default_bucket.tokens = self._default_bucket.capacity
            self._cleanup_counter = 0


# Context-local rate limiter (thread- and asyncio-safe)
_default_limiter: contextvars.ContextVar[Optional[TokenBucketRateLimiter]] = contextvars.ContextVar(
    "default_limiter",
    default=None
)


def get_rate_limiter(requests_per_minute: int = 60, enable_ttl: bool = True) -> TokenBucketRateLimiter:
    """
    Get context-local rate limiter instance.

    Args:
        requests_per_minute: Maximum requests per minute
        enable_ttl: Enable TTL-based bucket expiration

    Returns:
        Rate limiter instance for current context
    """
    limiter = _default_limiter.get()
    if limiter is None:
        limiter = TokenBucketRateLimiter(requests_per_minute, enable_ttl=enable_ttl)
        _default_limiter.set(limiter)
    return limiter


async def cleanup_default_limiter() -> None:
    """Cleanup the context-local rate limiter instance."""
    limiter = _default_limiter.get()
    if limiter is not None:
        await limiter.close()
        _default_limiter.set(None)