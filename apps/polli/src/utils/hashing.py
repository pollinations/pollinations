"""Fast hashing via xxhash (C)."""

from __future__ import annotations

import xxhash


def content_hash(data: str | bytes) -> str:
    if isinstance(data, str):
        data = data.encode()
    return xxhash.xxh3_64_hexdigest(data)
