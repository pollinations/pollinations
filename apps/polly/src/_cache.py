"""Fast caches: cachebox (Rust) → pure-Python dict fallback."""

from __future__ import annotations

import time
from typing import Any

try:
    from cachebox import LRUCache as _CbLRU
    from cachebox import TTLCache as _CbTTL

    class TTLCache:
        """TTL cache backed by cachebox (Rust)."""

        def __init__(self, maxsize: int = 256, ttl: int = 300):
            self._c = _CbTTL(maxsize=maxsize, ttl=ttl)

        def get(self, key: str) -> Any | None:
            try:
                return self._c[key]
            except KeyError:
                return None

        def set(self, key: str, value: Any):
            self._c[key] = value

        def invalidate(self, key: str | None = None):
            if key:
                self._c.pop(key, None)
            else:
                self._c.clear()

    class LRUCache:
        """LRU cache backed by cachebox (Rust)."""

        def __init__(self, maxsize: int = 256):
            self._c = _CbLRU(maxsize=maxsize)

        def get(self, key: str) -> Any | None:
            try:
                return self._c[key]
            except KeyError:
                return None

        def set(self, key: str, value: Any):
            self._c[key] = value

        def __contains__(self, key: str) -> bool:
            return key in self._c

        def __delitem__(self, key: str):
            del self._c[key]

        def __len__(self) -> int:
            return len(self._c)

except ImportError:

    class TTLCache:  # type: ignore[no-redef]
        """TTL cache with pure-Python dict fallback."""

        def __init__(self, maxsize: int = 256, ttl: int = 300):
            self._cache: dict[str, tuple[float, Any]] = {}
            self._maxsize = maxsize
            self._ttl = ttl

        def get(self, key: str) -> Any | None:
            if key in self._cache:
                ts, val = self._cache[key]
                if time.time() - ts < self._ttl:
                    return val
                del self._cache[key]
            return None

        def set(self, key: str, value: Any):
            if len(self._cache) >= self._maxsize:
                oldest = min(self._cache, key=lambda k: self._cache[k][0])
                del self._cache[oldest]
            self._cache[key] = (time.time(), value)

        def invalidate(self, key: str | None = None):
            if key:
                self._cache.pop(key, None)
            else:
                self._cache.clear()

    class LRUCache:  # type: ignore[no-redef]
        """LRU cache with pure-Python dict fallback."""

        def __init__(self, maxsize: int = 256):
            self._cache: dict[str, Any] = {}
            self._maxsize = maxsize

        def get(self, key: str) -> Any | None:
            if key in self._cache:
                val = self._cache.pop(key)
                self._cache[key] = val  # Move to end (most recent)
                return val
            return None

        def set(self, key: str, value: Any):
            if key in self._cache:
                del self._cache[key]
            elif len(self._cache) >= self._maxsize:
                # Evict oldest (first inserted)
                oldest = next(iter(self._cache))
                del self._cache[oldest]
            self._cache[key] = value

        def __contains__(self, key: str) -> bool:
            return key in self._cache

        def __delitem__(self, key: str):
            del self._cache[key]

        def __len__(self) -> int:
            return len(self._cache)
