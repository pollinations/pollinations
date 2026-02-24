import asyncio
import hashlib
import logging
import os
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import tiktoken

from .embeddings_utils import validate_and_get_openai_client

logger = logging.getLogger(__name__)

_enc = tiktoken.get_encoding("cl100k_base")
MAX_TOKENS_PER_INPUT = 8000

_model = None
_chroma_client = None
_collection = None

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DOC_EMBEDDINGS_DIR = DATA_DIR / "doc_embeddings"
DOC_CACHE_DIR = DATA_DIR / "doc_cache"

DEFAULT_DOC_SITES = [
    "https://enter.pollinations.ai/api/docs/open-api/generate-schema",
]

MAX_PAGES_PER_SITE = 500
MAX_CRAWL_DEPTH = 10
REQUEST_TIMEOUT = 30

MAX_CHUNK_SIZE = 1000
MIN_CHUNK_SIZE = 100

_update_lock = asyncio.Lock()


def _get_model():
    global _model
    if _model is None:
        api_key = os.getenv("OPENAI_EMBEDDINGS_API")
        _model = validate_and_get_openai_client(api_key, service_name="doc_embeddings")
        logger.info("OpenAI embeddings client initialized for documentation")
    return _model


def _get_collection():
    global _chroma_client, _collection
    if _collection is None:
        import chromadb

        DOC_EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(DOC_EMBEDDINGS_DIR))
        _collection = _chroma_client.get_or_create_collection(name="doc_embeddings", metadata={"hnsw:space": "cosine"})
        logger.info(f"ChromaDB doc collection loaded with {_collection.count()} embeddings")
    return _collection


def _content_hash(content: str) -> str:
    return hashlib.md5(content.encode()).hexdigest()


def _clean_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def _is_same_domain(url: str, base_url: str) -> bool:
    url_domain = urlparse(url).netloc
    base_domain = urlparse(base_url).netloc
    return url_domain == base_domain


def _should_skip_url(url: str) -> bool:
    skip_patterns = [
        r"/login",
        r"/logout",
        r"/signin",
        r"/signup",
        r"/register",
        r"/auth",
        r"/admin",
        r"/api/",
        r"\.(pdf|zip|tar|gz|jpg|jpeg|png|gif|svg|mp4|webm)$",
        r"/download",
        r"/print",
    ]

    url_lower = url.lower()
    for pattern in skip_patterns:
        if re.search(pattern, url_lower):
            return True

    return False


def _chunk_content(content: str, url: str, page_title: str, max_chunk_size: int = MAX_CHUNK_SIZE) -> list[dict]:
    if not content or len(content) < MIN_CHUNK_SIZE:
        return []

    chunks = []

    header_pattern = r"^(#{1,6})\s+(.+)$"
    lines = content.split("\n")

    current_chunk = []
    current_section = page_title

    for _i, line in enumerate(lines):
        header_match = re.match(header_pattern, line.strip())

        if header_match and current_chunk:
            chunk_text = "\n".join(current_chunk).strip()

            if len(chunk_text) >= MIN_CHUNK_SIZE:
                if len(chunk_text) > max_chunk_size:
                    sub_chunks = _split_large_chunk(chunk_text, max_chunk_size)
                    for sub_chunk in sub_chunks:
                        chunks.append(
                            {
                                "content": sub_chunk,
                                "url": url,
                                "page_title": page_title,
                                "section": current_section,
                            }
                        )
                else:
                    chunks.append(
                        {
                            "content": chunk_text,
                            "url": url,
                            "page_title": page_title,
                            "section": current_section,
                        }
                    )

            current_chunk = [line]
            current_section = header_match.group(2).strip()

        else:
            current_chunk.append(line)

    if current_chunk:
        chunk_text = "\n".join(current_chunk).strip()
        if len(chunk_text) >= MIN_CHUNK_SIZE:
            if len(chunk_text) > max_chunk_size:
                sub_chunks = _split_large_chunk(chunk_text, max_chunk_size)
                for sub_chunk in sub_chunks:
                    chunks.append(
                        {
                            "content": sub_chunk,
                            "url": url,
                            "page_title": page_title,
                            "section": current_section,
                        }
                    )
            else:
                chunks.append(
                    {
                        "content": chunk_text,
                        "url": url,
                        "page_title": page_title,
                        "section": current_section,
                    }
                )

    if not chunks:
        content_clean = content.strip()
        if len(content_clean) >= MIN_CHUNK_SIZE:
            if len(content_clean) > max_chunk_size:
                sub_chunks = _split_large_chunk(content_clean, max_chunk_size)
                for sub_chunk in sub_chunks:
                    chunks.append(
                        {
                            "content": sub_chunk,
                            "url": url,
                            "page_title": page_title,
                            "section": page_title,
                        }
                    )
            else:
                chunks.append(
                    {
                        "content": content_clean,
                        "url": url,
                        "page_title": page_title,
                        "section": page_title,
                    }
                )

    # Split any chunk exceeding token limit using tiktoken
    final_chunks = []
    for chunk in chunks:
        tokens = _enc.encode(chunk["content"])
        if len(tokens) <= MAX_TOKENS_PER_INPUT:
            final_chunks.append(chunk)
        else:
            parts = list(range(0, len(tokens), MAX_TOKENS_PER_INPUT))
            for part_idx, pos in enumerate(parts):
                sub_tokens = tokens[pos : pos + MAX_TOKENS_PER_INPUT]
                final_chunks.append(
                    {
                        "content": _enc.decode(sub_tokens),
                        "url": chunk["url"],
                        "page_title": chunk["page_title"],
                        "section": chunk["section"],
                        "part": part_idx,
                    }
                )

    return final_chunks


def _split_large_chunk(text: str, max_size: int) -> list[str]:
    paragraphs = text.split("\n\n")
    chunks = []
    current = []
    current_size = 0

    for para in paragraphs:
        para_size = len(para)

        if current_size + para_size > max_size and current:
            chunks.append("\n\n".join(current))
            current = [para]
            current_size = para_size
        else:
            current.append(para)
            current_size += para_size

    if current:
        chunks.append("\n\n".join(current))

    return chunks


async def _scrape_page(url: str) -> dict | None:
    try:
        from .web_scraper import scrape_url

        logger.debug(f"Scraping: {url}")

        result = await scrape_url(
            url,
            output_format="markdown",
            include_links=True,
            stealth_mode=True,
            magic_mode=True,
            remove_overlays=True,
            timeout=REQUEST_TIMEOUT,
        )

        if not result.get("success"):
            logger.warning(f"Failed to scrape {url}: {result.get('error')}")
            return None

        return {
            "url": url,
            "title": result.get("title") or "",
            "content": result.get("markdown") or result.get("content", ""),
            "links": result.get("links", []),
        }

    except Exception as e:
        logger.warning(f"Error scraping {url}: {e}")
        return None


async def _crawl_site(base_url: str, max_pages: int = MAX_PAGES_PER_SITE) -> list[dict]:
    visited = set()
    to_visit = [base_url]
    pages = []

    logger.info(f"Starting crawl of {base_url}")

    while to_visit and len(visited) < max_pages:
        batch_size = min(5, len(to_visit))
        batch = to_visit[:batch_size]
        to_visit = to_visit[batch_size:]

        tasks = [_scrape_page(url) for url in batch if url not in visited]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for url, result in zip(batch, results):
            visited.add(url)

            if isinstance(result, Exception):
                logger.warning(f"Exception crawling {url}: {result}")
                continue

            if result is None:
                continue

            pages.append(result)

            if result.get("links"):
                for link_data in result["links"]:
                    # Handle both string links and dict links
                    if isinstance(link_data, dict):
                        link_url = link_data.get("href", "")
                    elif isinstance(link_data, str):
                        link_url = link_data
                    else:
                        continue

                    if link_url.startswith("/"):
                        link_url = urljoin(base_url, link_url)

                    link_url = _clean_url(link_url)

                    if (
                        link_url
                        and link_url not in visited
                        and link_url not in to_visit
                        and _is_same_domain(link_url, base_url)
                        and not _should_skip_url(link_url)
                    ):
                        to_visit.append(link_url)

        logger.info(f"Crawled {len(visited)} pages from {base_url}...")

    logger.info(f"Crawl complete: {len(pages)} pages from {base_url}")
    return pages


async def embed_site(base_url: str, force_full: bool = False) -> int:
    model = _get_model()
    collection = _get_collection()

    pages = await _crawl_site(base_url)

    if not pages:
        logger.warning(f"No pages found for {base_url}")
        return 0

    total_pages = len(pages)
    logger.info(f"Starting to embed {total_pages} pages from {base_url}")

    embedded_count = 0
    all_ids = []
    all_documents = []
    all_metadatas = []
    ids_to_delete = []
    pages_skipped = 0
    pages_processed = 0

    for _page_idx, page in enumerate(pages, 1):
        url = page["url"]
        title = page["title"]
        content = page["content"]

        if not content:
            continue

        content_hash = _content_hash(content)

        # Check if page has changed (page-level TTL)
        if not force_full and collection.count() > 0:
            existing = collection.get(where={"url": url})

            if existing["ids"] and existing["metadatas"]:
                # Check if content hash matches any existing chunk from this page
                existing_page_hash = existing["metadatas"][0].get("page_hash")

                if existing_page_hash == content_hash:
                    logger.debug(f"TTL: Skipping {url} (unchanged, hash={content_hash[:8]})...")
                    pages_skipped += 1
                    continue
                else:
                    # Page changed, delete old chunks for this page
                    ids_to_delete.extend(existing["ids"])
                    logger.debug(f"TTL: Page {url} changed, deleting {len(existing['ids'])} old chunks")

        chunks = _chunk_content(content, url, title)

        for idx, chunk in enumerate(chunks):
            part = chunk.get("part")
            chunk_id = f"{url}#chunk-{idx}" + (f"p{part}" if part is not None else "")

            all_ids.append(chunk_id)
            all_documents.append(chunk["content"])
            all_metadatas.append(
                {
                    "url": chunk["url"],
                    "page_title": chunk["page_title"] or "",
                    "section": chunk["section"] or "",
                    "site": urlparse(base_url).netloc,
                    "page_hash": content_hash,
                    "last_updated": datetime.utcnow().isoformat(),
                }
            )

        pages_processed += 1
        progress_pct = (pages_processed / total_pages) * 100
        chunks_in_queue = len(all_ids)

        # Log progress every 10% or every 10 pages
        if pages_processed % max(1, total_pages // 10) == 0 or pages_processed == total_pages:
            logger.info(
                f"📊 Doc embedding progress: {pages_processed}/{total_pages} pages ({progress_pct:.1f}%), {chunks_in_queue} chunks queued for embedding"
            )

    # Delete old chunks from pages that were modified
    if ids_to_delete:
        collection.delete(ids=ids_to_delete)
        logger.info(f"Deleted {len(ids_to_delete)} old chunks from changed pages")

    # Batch embed with token-aware sizing, upsert each batch immediately
    MAX_BATCH_TOKENS = 250_000
    if all_ids:
        try:
            batch_start = 0
            batch_num = 0
            while batch_start < len(all_documents):
                batch_docs = []
                batch_ids = []
                batch_metadatas = []
                batch_tokens = 0
                i = batch_start
                while i < len(all_documents):
                    doc_tokens = len(_enc.encode(all_documents[i]))
                    if batch_tokens + doc_tokens > MAX_BATCH_TOKENS and batch_docs:
                        break
                    batch_docs.append(all_documents[i])
                    batch_ids.append(all_ids[i])
                    batch_metadatas.append(all_metadatas[i])
                    batch_tokens += doc_tokens
                    i += 1
                embedding_response = await asyncio.to_thread(
                    lambda docs=batch_docs: model.embeddings.create(
                        model="text-embedding-3-small", input=docs, dimensions=1536
                    )
                )
                batch_embeddings = [item.embedding for item in embedding_response.data]
                collection.upsert(
                    ids=batch_ids,
                    embeddings=batch_embeddings,
                    documents=batch_docs,
                    metadatas=batch_metadatas,
                )
                embedded_count += len(batch_ids)
                batch_num += 1
                logger.info(
                    f"Embedded+saved doc batch {batch_num} ({len(batch_docs)} chunks, ~{batch_tokens} tokens, {i}/{len(all_documents)} total)"
                )
                batch_start = i
        except Exception as e:
            logger.error(f"Failed to embed doc chunks: {e}")
            raise

    return embedded_count


# TTL cache for doc search results (avoids redundant OpenAI API calls)
_search_cache: dict[str, tuple[float, list[dict]]] = {}
_SEARCH_CACHE_TTL = 300  # 5 minutes
_SEARCH_CACHE_MAX = 256


def _cache_get(key: str) -> list[dict] | None:
    if key in _search_cache:
        ts, val = _search_cache[key]
        if time.time() - ts < _SEARCH_CACHE_TTL:
            return val
        del _search_cache[key]
    return None


def _cache_set(key: str, val: list[dict]):
    if len(_search_cache) >= _SEARCH_CACHE_MAX:
        oldest = min(_search_cache, key=lambda k: _search_cache[k][0])
        del _search_cache[oldest]
    _search_cache[key] = (time.time(), val)


async def search_docs(query: str, top_k: int = 5) -> list[dict]:
    cache_key = f"{query}:{top_k}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    model = _get_model()
    collection = _get_collection()

    if collection.count() == 0:
        return []

    embedding_response = await asyncio.to_thread(
        lambda: model.embeddings.create(model="text-embedding-3-small", input=query)
    )
    query_embedding = embedding_response.data[0].embedding

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    formatted = []
    for i, doc in enumerate(results["documents"][0]):
        metadata = results["metadatas"][0][i]
        distance = results["distances"][0][i]

        formatted.append(
            {
                "url": metadata.get("url", ""),
                "page_title": metadata.get("page_title", ""),
                "section": metadata.get("section", ""),
                "site": metadata.get("site", ""),
                "content": doc,
                "similarity": round(1 - distance, 3),
            }
        )

    _cache_set(cache_key, formatted)
    return formatted


async def update_all_sites(sites: list[str] | None = None):
    if sites is None:
        from ..config import config

        sites = config.doc_sites if hasattr(config, "doc_sites") else DEFAULT_DOC_SITES

    async with _update_lock:
        logger.info(f"Updating {len(sites)} documentation sites with TTL incremental updates...")

        total_chunks = 0
        for site in sites:
            try:
                count = await embed_site(site, force_full=False)
                total_chunks += count
                if count > 0:
                    logger.info(f"Updated {site}: {count} new/changed chunks")
                else:
                    logger.debug(f"No changes detected for {site}")
            except Exception as e:
                logger.error(f"Failed to update {site}: {e}", exc_info=True)

        collection = _get_collection()
        logger.info(
            f"✅ Doc embeddings update complete — {collection.count()} total chunks ready ({total_chunks} new/changed)"
        )


async def initialize():
    from ..config import config

    if not config.doc_embeddings_enabled:
        logger.info("Documentation embeddings disabled")
        return

    sites = config.doc_sites if hasattr(config, "doc_sites") else DEFAULT_DOC_SITES
    logger.info(f"Initializing documentation embeddings for {len(sites)} sites...")

    collection = _get_collection()
    if collection.count() == 0:
        logger.info("No existing doc embeddings found, running full crawl (first initialization)...")
    else:
        logger.info(f"Found {collection.count()} existing doc embeddings, checking for updates...")

    await update_all_sites(sites)

    logger.info("✅ Doc embeddings initialization complete — %d chunks ready", collection.count())


def get_doc_stats() -> dict:
    collection = _get_collection()
    return {
        "total_chunks": collection.count(),
        "embeddings_dir": str(DOC_EMBEDDINGS_DIR),
        "cache_dir": str(DOC_CACHE_DIR),
    }


async def close():
    global _model, _chroma_client, _collection

    _model = None
    _collection = None
    _chroma_client = None
    logger.info("Documentation embeddings service closed")
