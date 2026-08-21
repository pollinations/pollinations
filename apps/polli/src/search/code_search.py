"""Semantic code search over Cloudflare Vectorize.

The index is populated by CI in pollinations/pollinations on push to main — Polli never
writes to it. Each match's metadata carries the chunk's own text, so a query is a single
round trip: embed the query, ask Vectorize, return the matches.
"""

from __future__ import annotations

import logging

import aiohttp

from ..core.config import config
from ..utils.cache import TTLCache

logger = logging.getLogger(__name__)

_session: aiohttp.ClientSession | None = None
_search_cache = TTLCache(maxsize=256, ttl=config.code_search.cache_ttl_seconds)


async def _get_session() -> aiohttp.ClientSession:
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=config.code_search.timeout_seconds, connect=5)
        )
    return _session


async def _embed_query(query: str) -> list[float]:
    session = await _get_session()
    payload = {
        "model": config.code_search.embed_model,
        "input": query,
        "dimensions": config.code_search.embed_dimensions,
    }
    headers = {
        "Authorization": f"Bearer {config.ai.token}",
        "Content-Type": "application/json",
    }
    async with session.post(config.ai.embeddings_url, json=payload, headers=headers) as resp:
        if resp.status != 200:
            body = await resp.text()
            raise RuntimeError(f"Embedding request failed: HTTP {resp.status} {body[:200]}")
        data = await resp.json()
    return data["data"][0]["embedding"]


async def _query_vectorize(embedding: list[float], top_k: int) -> list[dict]:
    session = await _get_session()
    payload = {
        "vector": embedding,
        "topK": top_k,
        "returnValues": False,
        "returnMetadata": "all",
    }
    headers = {
        "Authorization": f"Bearer {config.code_search.cloudflare_api_token}",
        "Content-Type": "application/json",
    }
    async with session.post(config.code_search.query_url, json=payload, headers=headers) as resp:
        if resp.status != 200:
            body = await resp.text()
            raise RuntimeError(f"Vectorize query failed: HTTP {resp.status} {body[:200]}")
        data = await resp.json()
    if not data.get("success"):
        raise RuntimeError(f"Vectorize query failed: {data.get('errors')}")
    return data["result"]["matches"]


async def search_code(query: str, top_k: int | None = None) -> list[dict]:
    """Return the code chunks most semantically similar to `query`."""
    top_k = min(top_k or config.code_search.default_top_k, config.code_search.max_top_k)

    cache_key = f"{query}:{top_k}"
    cached = _search_cache.get(cache_key)
    if cached is not None:
        return cached

    matches = await _query_vectorize(await _embed_query(query), top_k)

    results = []
    for match in matches:
        metadata = match.get("metadata") or {}
        content = metadata.get("content")
        # The indexer stores content="" for the rare chunk too large for Vectorize's
        # 10KiB metadata cap — nothing useful to show for those.
        if not content:
            continue
        results.append(
            {
                "file_path": metadata["file_path"],
                "start_line": metadata["start_line"],
                "end_line": metadata["end_line"],
                "content": content,
                "language": metadata.get("language"),
                "app": metadata.get("app"),
                "similarity": round(match["score"], 3),
            }
        )

    _search_cache.set(cache_key, results)
    return results


async def close() -> None:
    global _session
    if _session and not _session.closed:
        await _session.close()
    _session = None
