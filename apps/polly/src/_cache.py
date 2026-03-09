"""Fast caches via cachebox (Rust)."""

from __future__ import annotations

from typing import Any

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
