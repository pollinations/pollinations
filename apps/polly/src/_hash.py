"""Fast hashing: xxhash (C) → hashlib.md5 fallback.

WARNING: Switching hash functions invalidates existing embeddings hashes.
A one-time full re-embedding will occur on first run after migration.
"""

from __future__ import annotations

try:
    import xxhash

    def content_hash(data: str | bytes) -> str:
        if isinstance(data, str):
            data = data.encode()
        return xxhash.xxh3_64_hexdigest(data)

except ImportError:
    import hashlib

    def content_hash(data: str | bytes) -> str:  # type: ignore[misc]
        if isinstance(data, str):
            data = data.encode()
        return hashlib.md5(data).hexdigest()
