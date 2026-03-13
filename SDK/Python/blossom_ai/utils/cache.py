# blossom_ai/utils/cache.py

"""
Blossom AI – Caching Module
Security-hardened version: fixes race conditions, TTL handling, and resource leaks.
Now uses JSON instead of pickle for disk storage.
"""

import hashlib
import json
import re
import threading
import time
import asyncio
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Union
from collections import OrderedDict

from blossom_ai.core.interfaces import LoggerProtocol, ConfigProtocol
from blossom_ai.utils.security import sanitize_filename

__all__ = [
    "CacheBackend",
    "CacheConfig",
    "CacheEntry",
    "CacheStats",
    "CacheManager",
    "get_default_cache",
]


class CacheBackend(Enum):
    """Cache storage backends."""
    MEMORY = "memory"
    DISK = "disk"
    HYBRID = "hybrid"


@dataclass(frozen=True, slots=True)
class CacheConfig:
    """Immutable cache configuration."""
    enabled: bool = True
    backend: CacheBackend = CacheBackend.HYBRID
    ttl: int = 3600  # 1 hour
    max_memory_size: int = 100  # Max entries in memory
    max_disk_size: int = 1000  # Max entries on disk
    compress: bool = True
    cache_text: bool = True
    cache_images: bool = False  # Images are large, disabled by default
    sanitize_secrets: bool = True  # Sanitize API keys and secrets from cache keys


@dataclass(slots=True)
class CacheEntry:
    """Single cache entry with LRU tracking."""
    key: str
    value: Any
    timestamp: float
    size: int = 0
    hits: int = 0

    def is_expired(self, ttl: int) -> bool:
        """Check if entry is expired using monotonic time."""
        return (time.monotonic() - self.timestamp) > ttl

    def touch(self) -> None:
        """Update timestamp and hit count."""
        self.hits += 1
        self.timestamp = time.monotonic()


@dataclass
class CacheStats:
    """Thread-safe cache statistics."""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def hit_rate(self) -> float:
        """Calculate hit rate percentage."""
        with self._lock:
            total = self.hits + self.misses
            return (self.hits / total * 100) if total > 0 else 0.0

    def increment_hits(self) -> None:
        """Thread-safe increment hits."""
        with self._lock:
            self.hits += 1

    def increment_misses(self) -> None:
        """Thread-safe increment misses."""
        with self._lock:
            self.misses += 1

    def increment_evictions(self) -> None:
        """Thread-safe increment evictions."""
        with self._lock:
            self.evictions += 1


class CacheManager:


    def __init__(
            self,
            config: CacheConfig,
            logger: Optional[LoggerProtocol] = None,
            config_obj: Optional[ConfigProtocol] = None
    ) -> None:
        self.config = config
        self.logger = logger
        self.config_obj = config_obj

        # Memory cache: {sanitized_key: CacheEntry}
        self._memory: OrderedDict[str, CacheEntry] = OrderedDict()

        self._memory_lock = threading.RLock()  # RLock allows reentrant calls
        self._disk_lock = threading.RLock()
        self._stats_lock = threading.Lock()

        # Statistics
        self.stats = CacheStats()

        self._async_locks: Dict[int, asyncio.Lock] = {}
        self._locks_lock = threading.Lock()

        # Background cleanup task
        self._cleanup_task: Optional[asyncio.Task] = None
        self._cleanup_running = False

        # Disk cache setup
        if self.config.backend in (CacheBackend.DISK, CacheBackend.HYBRID):
            self._setup_disk_cache()

    def _setup_disk_cache(self) -> None:
        """Initialize disk cache directory with security checks."""
        cache_base = Path.home() / ".blossom_cache"

        # Create unique cache dir per API key for isolation
        if self.config_obj and hasattr(self.config_obj, 'api_key') and self.config_obj.api_key:
            key_fragment = hashlib.sha256(
                self.config_obj.api_key.encode()
            ).hexdigest()[:8]
            cache_base = cache_base / key_fragment

        cache_base.mkdir(parents=True, exist_ok=True)

        # Create subdirectories
        for subdir in ["text", "images", "metadata"]:
            (cache_base / subdir).mkdir(parents=True, exist_ok=True)

        self._cache_dir = cache_base
        self._log("info", "Disk cache initialized", path=str(cache_base))

    def _get_async_lock(self) -> asyncio.Lock:
        try:
            loop = asyncio.get_running_loop()
            loop_id = id(loop)
        except RuntimeError:
            # No event loop - return dummy lock for sync operations
            class DummyAsyncLock:
                async def __aenter__(self): return self
                async def __aexit__(self, *args): pass
            return DummyAsyncLock()

        # Check if lock exists for this loop
        if loop_id not in self._async_locks:
            with self._locks_lock:
                # Double-check after acquiring thread lock
                if loop_id not in self._async_locks:
                    self._async_locks[loop_id] = asyncio.Lock()

        return self._async_locks[loop_id]

    def _sanitize_key(self, key: str) -> str:
        """Sanitize cache key to prevent injection attacks."""
        sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', key)
        return sanitized[:100]

    def _get_cache_path(self, key: str, prefix: str) -> Path:
        """Get safe file path for disk cache entry."""
        sanitized = self._sanitize_key(key)
        subdir = "text" if prefix.startswith("text") else "images"
        hash_prefix = hashlib.sha256(sanitized.encode()).hexdigest()[:2]
        subdir_path = self._cache_dir / subdir / hash_prefix
        subdir_path.mkdir(parents=True, exist_ok=True)
        filename = sanitize_filename(f"{sanitized}.cache")
        return subdir_path / filename

    def _should_cache(self, prefix: str) -> bool:
        """Check if this request type should be cached."""
        if not self.config.enabled:
            return False
        if prefix.startswith("text") and not self.config.cache_text:
            return False
        if prefix.startswith("image") and not self.config.cache_images:
            return False
        return True

    def _estimate_size(self, value: Any) -> int:
        """Estimate byte size of cached value."""
        try:
            if isinstance(value, (str, bytes)):
                return len(value)
            return len(json.dumps(value, default=str).encode())
        except Exception:
            return 0

    def _log(self, level: str, msg: str, **kwargs: Any) -> None:
        """
        Internal logging with sanitization of sensitive data.

        Filters out 'key' and 'api_key' from logs to prevent sensitive data leakage.
        """
        if self.logger:
            sanitized = {k: v for k, v in kwargs.items() if k not in ("key", "api_key")}
            getattr(self.logger, level)(msg, **sanitized)

    def _evict_if_needed(self) -> None:
        # Must be called with _memory_lock held
        if len(self._memory) <= self.config.max_memory_size:
            return

        try:
            num_to_remove = len(self._memory) - self.config.max_memory_size
            oldest_keys = list(self._memory.keys())[:num_to_remove]

            for key in oldest_keys:
                del self._memory[key]
                self.stats.increment_evictions()
                self._log("debug", "Evicted from memory cache", key=key[:20])
        except Exception as e:
            self._log("error", "Error during cache eviction", error=str(e))

    def _get_and_validate_entry(self, key: str) -> Optional[CacheEntry]:
        # Must be called with _memory_lock held
        entry = self._memory.get(key)
        if entry is None:
            return None

        if entry.is_expired(self.config.ttl):
            del self._memory[key]
            self.stats.increment_evictions()
            self._log("debug", "Expired entry removed", key=key[:20])
            return None

        return entry

    # === Sync Methods (JSON-based) ===

    def get(self, key: str, default: Any = None) -> Any:
        """Thread-safe get from cache."""
        if not self.config.enabled:
            return default

        key = self._sanitize_key(key)

        # Try memory first
        with self._memory_lock:
            entry = self._get_and_validate_entry(key)
            if entry is not None:
                entry.touch()
                self.stats.increment_hits()
                self._log("debug", "Cache hit (memory)", key=key[:20])
                return entry.value

        # Try disk
        if self.config.backend in (CacheBackend.DISK, CacheBackend.HYBRID):
            with self._disk_lock:
                disk_value = self._read_from_disk_sync(key)
                if disk_value is not None:
                    self.stats.increment_hits()
                    self._log("debug", "Cache hit (disk)", key=key[:20])

                    # Promote to memory
                    if self.config.backend == CacheBackend.HYBRID:
                        entry = CacheEntry(
                            key=key,
                            value=disk_value,
                            timestamp=time.monotonic(),
                            size=self._estimate_size(disk_value)
                        )
                        with self._memory_lock:
                            self._memory[key] = entry
                            self._memory.move_to_end(key)  # MRU
                            self._evict_if_needed()

                    return disk_value

        self.stats.increment_misses()
        self._log("debug", "Cache miss", key=key[:20])
        return default

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Thread-safe set to cache."""
        if not self.config.enabled:
            return False

        key = self._sanitize_key(key)
        ttl = ttl or self.config.ttl

        entry = CacheEntry(
            key=key,
            value=value,
            timestamp=time.monotonic(),
            size=self._estimate_size(value)
        )

        # Memory
        if self.config.backend in (CacheBackend.MEMORY, CacheBackend.HYBRID):
            with self._memory_lock:
                self._memory[key] = entry
                self._memory.move_to_end(key)  # MRU
                self._evict_if_needed()

        # Disk
        if self.config.backend in (CacheBackend.DISK, CacheBackend.HYBRID):
            with self._disk_lock:
                self._write_to_disk_sync(key, value, entry)

        self._log("debug", "Cache set", key=key[:20], size=entry.size)
        return True

    def clear(self, prefix: Optional[str] = None) -> None:
        """Clear cache entries."""
        if prefix is None:
            # Clear everything
            with self._memory_lock:
                self._memory.clear()

            if hasattr(self, "_cache_dir"):
                with self._disk_lock:
                    for subdir in ["text", "images"]:
                        for f in (self._cache_dir / subdir).glob("**/*.cache"):
                            f.unlink(missing_ok=True)

            self._log("info", "Cache cleared completely")
        else:
            # Clear by prefix
            sanitized_prefix = self._sanitize_key(prefix)

            with self._memory_lock:
                keys_to_delete = [k for k in self._memory.keys()
                                  if k.startswith(sanitized_prefix)]
                for k in keys_to_delete:
                    del self._memory[k]

            if hasattr(self, "_cache_dir"):
                with self._disk_lock:
                    for subdir in ["text", "images"]:
                        pattern = f"{sanitized_prefix}*.cache"
                        for cache_file in (self._cache_dir / subdir).glob(f"**/{pattern}"):
                            cache_file.unlink(missing_ok=True)

            self._log("info", "Cache cleared by prefix", prefix=prefix[:20])

    def get_stats(self) -> CacheStats:
        """Get thread-safe stats copy."""
        with self._stats_lock:
            return CacheStats(
                hits=self.stats.hits,
                misses=self.stats.misses,
                evictions=self.stats.evictions
            )

    # === Async Methods ===

    async def aget(self, key: str, default: Any = None) -> Any:
        """Async get from cache."""
        if not self.config.enabled:
            return default

        key = self._sanitize_key(key)
        async_lock = self._get_async_lock()

        # Memory path
        if self.config.backend in (CacheBackend.MEMORY, CacheBackend.HYBRID):
            async with async_lock:
                with self._memory_lock:
                    entry = self._get_and_validate_entry(key)
                    if entry is not None:
                        entry.touch()
                        self.stats.increment_hits()
                        self._log("debug", "Cache hit (memory)", key=key[:20])
                        return entry.value

        # Disk path
        if self.config.backend in (CacheBackend.DISK, CacheBackend.HYBRID):
            disk_value = await self._read_from_disk_async(key)
            if disk_value is not None:
                self.stats.increment_hits()
                self._log("debug", "Cache hit (disk)", key=key[:20])

                # Promote to memory
                if self.config.backend == CacheBackend.HYBRID:
                    entry = CacheEntry(
                        key=key,
                        value=disk_value,
                        timestamp=time.monotonic(),
                        size=self._estimate_size(disk_value)
                    )
                    async with async_lock:
                        with self._memory_lock:
                            self._memory[key] = entry
                            self._memory.move_to_end(key)
                            self._evict_if_needed()

                return disk_value

        self.stats.increment_misses()
        self._log("debug", "Cache miss", key=key[:20])
        return default

    async def aset(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Async set to cache."""
        if not self.config.enabled:
            return False

        key = self._sanitize_key(key)
        ttl = ttl or self.config.ttl
        async_lock = self._get_async_lock()

        entry = CacheEntry(
            key=key,
            value=value,
            timestamp=time.monotonic(),
            size=self._estimate_size(value)
        )

        # Memory path
        if self.config.backend in (CacheBackend.MEMORY, CacheBackend.HYBRID):
            async with async_lock:
                with self._memory_lock:
                    self._memory[key] = entry
                    self._memory.move_to_end(key)
                    self._evict_if_needed()

        # Disk path
        if self.config.backend in (CacheBackend.DISK, CacheBackend.HYBRID):
            await self._write_to_disk_async(key, value, entry)

        self._log("debug", "Cache set", key=key[:20], size=entry.size)
        return True

    async def aclear(self, prefix: Optional[str] = None) -> None:
        """Async clear cache."""
        async_lock = self._get_async_lock()

        if prefix is None:
            async with async_lock:
                with self._memory_lock:
                    self._memory.clear()

            if hasattr(self, "_cache_dir"):
                with self._disk_lock:
                    for subdir in ["text", "images"]:
                        for f in (self._cache_dir / subdir).glob("**/*.cache"):
                            f.unlink(missing_ok=True)

            self._log("info", "Cache cleared completely")
        else:
            sanitized_prefix = self._sanitize_key(prefix)

            async with async_lock:
                with self._memory_lock:
                    keys_to_delete = [k for k in self._memory.keys()
                                      if k.startswith(sanitized_prefix)]
                    for k in keys_to_delete:
                        del self._memory[k]

            if hasattr(self, "_cache_dir"):
                with self._disk_lock:
                    for subdir in ["text", "images"]:
                        pattern = f"{sanitized_prefix}*.cache"
                        for cache_file in (self._cache_dir / subdir).glob(f"**/{pattern}"):
                            cache_file.unlink(missing_ok=True)

            self._log("info", "Cache cleared by prefix", prefix=prefix[:20])

    # === Disk Operations (JSON-based, secure) ===

    def _read_from_disk_sync(self, key: str) -> Any:
        if not hasattr(self, "_cache_dir"):
            return None

        for subdir in ["text", "images"]:
            cache_file = self._cache_dir / subdir / f"{key}.cache"
            if cache_file.exists():
                try:
                    with open(cache_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    # Check TTL
                    if time.monotonic() - data["timestamp"] > self.config.ttl:
                        cache_file.unlink()
                        return None

                    return data["value"]
                except (json.JSONDecodeError, KeyError, UnicodeDecodeError) as e:
                    self._log("warning", f"Failed to read cache file: {e}", key=key[:20])
                    cache_file.unlink(missing_ok=True)

        return None

    def _write_to_disk_sync(self, key: str, value: Any, entry: CacheEntry) -> None:
        if not hasattr(self, "_cache_dir"):
            return

        # Only cache JSON-serializable types (security)
        if not self._is_json_serializable(value):
            self._log("warning", "Cannot cache non-JSON-serializable value to disk",
                     type=type(value).__name__)
            return

        subdir = "text"  # Default subdir
        cache_file = self._cache_dir / subdir / f"{key}.cache"

        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            data = {"value": value, "timestamp": entry.timestamp}

            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        except Exception as e:
            self._log("error", f"Failed to write cache file: {e}", key=key[:20])
            cache_file.unlink(missing_ok=True)

    def _is_json_serializable(self, value: Any) -> bool:
        if isinstance(value, (str, int, float, bool, type(None))):
            return True

        if isinstance(value, (list, tuple)):
            return all(self._is_json_serializable(item) for item in value)

        if isinstance(value, dict):
            return all(
                isinstance(k, str) and self._is_json_serializable(v)
                for k, v in value.items()
            )

        # Bytes can be base64 encoded, but we'll skip for now
        if isinstance(value, bytes):
            return False

        return False

    async def _read_from_disk_async(self, key: str) -> Any:
        """Read from disk asynchronously."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._read_from_disk_sync, key)

    async def _write_to_disk_async(self, key: str, value: Any, entry: CacheEntry) -> None:
        """Write to disk asynchronously."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._write_to_disk_sync, key, value, entry)

    # === Cleanup Method ===

    async def aclose(self) -> None:
        # Stop cleanup task
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_running = False
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        # Clear memory
        with self._memory_lock:
            self._memory.clear()

        # Clear async locks
        with self._locks_lock:
            self._async_locks.clear()

        if hasattr(self, "_cache_dir"):
            self._log("info", "Cache resources released")

    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from function arguments."""
        # Prepare key data for hashing
        key_data = {"args": args, "kwargs": sorted(kwargs.items())}

        if self.config.sanitize_secrets:
            # Sanitize sensitive information from kwargs
            sanitized_kwargs = {}
            sensitive_keys = {'api_key', 'api_secret', 'token', 'auth', 'key', 'secret'}

            for k, v in key_data["kwargs"]:
                if isinstance(k, str) and k.lower() in sensitive_keys:
                    # Hash the sensitive value to avoid storing it in plain text
                    sanitized_kwargs[k] = f"HASHED_{hashlib.sha256(str(v).encode()).hexdigest()[:8]}"
                else:
                    sanitized_kwargs[k] = v

            key_data["kwargs"] = list(sanitized_kwargs.items())

        try:
            key_str = json.dumps(key_data, sort_keys=True, default=str)
        except (TypeError, ValueError):
            key_str = f"{prefix}:{str(args)}:{str(kwargs)}"

        return hashlib.sha256(key_str.encode()).hexdigest()[:16]

    # === Decorator Support ===

    def cached(self, prefix: str, ttl: Optional[int] = None) -> Callable:
        """Decorator for caching function results."""

        def decorator(func: Callable) -> Callable:
            import inspect

            if inspect.iscoroutinefunction(func):
                @wraps(func)
                async def async_wrapper(*args, **kwargs):
                    if not self.config.enabled:
                        return await func(*args, **kwargs)

                    cache_key = f"{prefix}:{self._generate_key(prefix, *args, **kwargs)}"
                    cached = await self.aget(cache_key)

                    if cached is not None:
                        return cached

                    result = await func(*args, **kwargs)
                    await self.aset(cache_key, result, ttl=ttl)
                    return result

                return async_wrapper
            else:
                @wraps(func)
                def sync_wrapper(*args, **kwargs):
                    if not self.config.enabled:
                        return func(*args, **kwargs)

                    cache_key = f"{prefix}:{self._generate_key(prefix, *args, **kwargs)}"
                    cached = self.get(cache_key)

                    if cached is not None:
                        return cached

                    result = func(*args, **kwargs)
                    self.set(cache_key, result, ttl=ttl)
                    return result

                return sync_wrapper

        return decorator


# === Convenience Functions ===

def get_default_cache(config: ConfigProtocol, logger: LoggerProtocol) -> CacheManager:
    """
    Factory for default cache instance with configuration validation.

    Args:
        config: Configuration object with cache settings
        logger: Logger instance for cache operations

    Returns:
        CacheManager: Configured cache instance

    Raises:
        ValueError: If cache configuration is invalid
        Exception: If cache initialization fails
    """
    try:
        cache_cfg = CacheConfig(
            enabled=getattr(config, "cache_enabled", True),
            backend=CacheBackend(getattr(config, "cache_backend", "hybrid")),
            ttl=int(getattr(config, "cache_ttl", 3600)),
            max_memory_size=int(getattr(config, "cache_max_memory", 100)),
            max_disk_size=int(getattr(config, "cache_max_disk", 1000)),
            cache_text=getattr(config, "cache_text", True),
            cache_images=getattr(config, "cache_images", False),
            sanitize_secrets=getattr(config, "cache_sanitize_secrets", True),
        )
        return CacheManager(cache_cfg, logger, config)
    except (ValueError, TypeError) as e:
        logger.error("Invalid cache configuration", error=str(e), exc_info=True)
        raise ValueError(f"Invalid cache configuration: {e}") from e