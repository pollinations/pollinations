"""Documentation embeddings service for semantic search across documentation sites.

Uses OpenAI text-embedding-3-small + ChromaDB for documentation search.
Crawls and indexes: enter.pollinations.ai, kpi.myceli.ai, gsoc.pollinations.ai
"""

import asyncio
import hashlib
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

# Lazy imports - only load heavy dependencies when needed
_openai_client = None
_chroma_client = None
_collection = None

# OpenAI embedding config
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536  # Default for text-embedding-3-small

# Data directories
DATA_DIR = Path(__file__).parent.parent.parent / "data"
DOC_EMBEDDINGS_DIR = DATA_DIR / "doc_embeddings"
DOC_CACHE_DIR = DATA_DIR / "doc_cache"

# Configuration
DEFAULT_DOC_SITES = [
    "https://enter.pollinations.ai",
    "https://kpi.myceli.ai",
    "https://gsoc.pollinations.ai",
]

# Crawl settings
MAX_PAGES_PER_SITE = 500
MAX_CRAWL_DEPTH = 10
REQUEST_TIMEOUT = 30

# Chunk settings
MAX_CHUNK_SIZE = 1000  # characters
MIN_CHUNK_SIZE = 100

# Update lock
_update_lock = asyncio.Lock()


def _get_openai_client():
    """Lazy load the OpenAI client."""
    global _openai_client
    if _openai_client is None:
        from openai import AsyncOpenAI
        import os

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required for embeddings")

        _openai_client = AsyncOpenAI(api_key=api_key)
        logger.info("OpenAI embeddings client initialized for documentation")
    return _openai_client


async def _generate_embedding(text: str) -> list[float]:
    """Generate embedding using OpenAI API."""
    client = _get_openai_client()

    response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
        dimensions=EMBEDDING_DIMENSIONS
    )

    return response.data[0].embedding


async def _generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts in a batch (more efficient)."""
    client = _get_openai_client()

    # OpenAI allows up to 2048 texts per batch for embeddings
    response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
        dimensions=EMBEDDING_DIMENSIONS
    )

    return [item.embedding for item in response.data]


def _get_collection():
    """Lazy load ChromaDB collection for documentation."""
    global _chroma_client, _collection
    if _collection is None:
        import chromadb

        DOC_EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(DOC_EMBEDDINGS_DIR))
        _collection = _chroma_client.get_or_create_collection(
            name="doc_embeddings", metadata={"hnsw:space": "cosine"}
        )
        logger.info(
            f"ChromaDB doc collection loaded with {_collection.count()} embeddings"
        )
    return _collection


def _content_hash(content: str) -> str:
    """Generate hash of content for change detection."""
    return hashlib.md5(content.encode()).hexdigest()


def _clean_url(url: str) -> str:
    """Clean URL by removing fragments and normalizing."""
    parsed = urlparse(url)
    # Remove fragment (#), keep query params
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def _is_same_domain(url: str, base_url: str) -> bool:
    """Check if URL belongs to same domain as base."""
    url_domain = urlparse(url).netloc
    base_domain = urlparse(base_url).netloc
    return url_domain == base_domain


def _should_skip_url(url: str) -> bool:
    """Check if URL should be skipped during crawling."""
    # Skip common non-content patterns
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


def _chunk_content(
    content: str, url: str, page_title: str, max_chunk_size: int = MAX_CHUNK_SIZE
) -> list[dict]:
    """
    Split web content into semantic chunks for embedding.

    Strategy:
    1. Split by markdown headers (##, ###, etc.)
    2. If section too large, split by paragraphs
    3. Keep chunks reasonable size
    4. Include context: page title, section heading, URL
    """
    if not content or len(content) < MIN_CHUNK_SIZE:
        return []

    chunks = []

    # Split by headers first
    header_pattern = r"^(#{1,6})\s+(.+)$"
    lines = content.split("\n")

    current_chunk = []
    current_section = page_title
    chunk_start_line = 0

    for i, line in enumerate(lines):
        header_match = re.match(header_pattern, line.strip())

        # Found a header - finalize previous chunk
        if header_match and current_chunk:
            chunk_text = "\n".join(current_chunk).strip()

            if len(chunk_text) >= MIN_CHUNK_SIZE:
                # Split large chunks by paragraphs
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

            # Start new chunk with new section
            current_chunk = [line]
            current_section = header_match.group(2).strip()
            chunk_start_line = i

        else:
            current_chunk.append(line)

    # Don't forget the last chunk
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

    # If no headers found, treat whole content as one chunk (or split if too large)
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

    return chunks


def _split_large_chunk(text: str, max_size: int) -> list[str]:
    """Split a large text chunk into smaller pieces by paragraphs."""
    paragraphs = text.split("\n\n")
    chunks = []
    current = []
    current_size = 0

    for para in paragraphs:
        para_size = len(para)

        if current_size + para_size > max_size and current:
            # Finalize current chunk
            chunks.append("\n\n".join(current))
            current = [para]
            current_size = para_size
        else:
            current.append(para)
            current_size += para_size

    # Don't forget last chunk
    if current:
        chunks.append("\n\n".join(current))

    return chunks


async def _scrape_page(url: str) -> Optional[dict]:
    """Scrape a single page and return content."""
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
            "title": result.get("title", ""),
            "content": result.get("content", ""),
            "links": result.get("links", []),
        }

    except Exception as e:
        logger.warning(f"Error scraping {url}: {e}")
        return None


async def _crawl_site(base_url: str, max_pages: int = MAX_PAGES_PER_SITE) -> list[dict]:
    """
    Recursively crawl a site starting from base_url.

    Returns list of page data dicts.
    """
    visited = set()
    to_visit = [base_url]
    pages = []

    logger.info(f"Starting crawl of {base_url}")

    while to_visit and len(visited) < max_pages:
        # Process in batches for efficiency
        batch_size = min(5, len(to_visit))
        batch = to_visit[:batch_size]
        to_visit = to_visit[batch_size:]

        # Scrape batch concurrently
        tasks = [_scrape_page(url) for url in batch if url not in visited]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for url, result in zip(batch, results):
            visited.add(url)

            # Handle exceptions
            if isinstance(result, Exception):
                logger.warning(f"Exception crawling {url}: {result}")
                continue

            if result is None:
                continue

            pages.append(result)

            # Extract and queue internal links
            if result.get("links"):
                for link_data in result["links"]:
                    link_url = link_data.get("href", "")

                    # Make absolute
                    if link_url.startswith("/"):
                        link_url = urljoin(base_url, link_url)

                    # Clean URL
                    link_url = _clean_url(link_url)

                    # Check if should crawl
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
    """
    Crawl and embed all pages from a documentation site.

    Args:
        base_url: Base URL to crawl from
        force_full: If True, re-embed everything. Otherwise incremental.

    Returns:
        Number of chunks embedded
    """
    collection = _get_collection()

    # Crawl the site
    pages = await _crawl_site(base_url)

    if not pages:
        logger.warning(f"No pages found for {base_url}")
        return 0

    # Track embeddings
    embedded_count = 0
    batch_size = 100  # Process 100 chunks at a time for efficiency
    batch_ids = []
    batch_texts = []
    batch_documents = []
    batch_metadatas = []

    for page in pages:
        url = page["url"]
        title = page["title"]
        content = page["content"]

        if not content:
            continue

        # Chunk the content
        chunks = _chunk_content(content, url, title)

        for idx, chunk in enumerate(chunks):
            chunk_id = f"{url}#chunk-{idx}"
            content_hash = _content_hash(chunk["content"])

            # Check if already embedded (skip if same hash)
            if not force_full:
                existing = collection.get(ids=[chunk_id])
                if existing["ids"] and existing["metadatas"]:
                    if existing["metadatas"][0].get("hash") == content_hash:
                        continue

            # Add to batch
            batch_ids.append(chunk_id)
            batch_texts.append(chunk["content"])
            batch_documents.append(chunk["content"])
            batch_metadatas.append(
                {
                    "url": chunk["url"],
                    "page_title": chunk["page_title"],
                    "section": chunk["section"],
                    "site": urlparse(base_url).netloc,
                    "hash": content_hash,
                    "last_updated": datetime.utcnow().isoformat(),
                }
            )

            # Process batch when full
            if len(batch_texts) >= batch_size:
                try:
                    embeddings = await _generate_embeddings_batch(batch_texts)
                    collection.upsert(
                        ids=batch_ids,
                        embeddings=embeddings,
                        documents=batch_documents,
                        metadatas=batch_metadatas,
                    )
                    embedded_count += len(batch_ids)
                    logger.info(f"Embedded batch of {len(batch_ids)} doc chunks")
                except Exception as e:
                    logger.warning(f"Failed to embed batch: {e}")

                # Clear batch
                batch_ids = []
                batch_texts = []
                batch_documents = []
                batch_metadatas = []

    # Process remaining batch
    if batch_ids:
        try:
            embeddings = await _generate_embeddings_batch(batch_texts)
            collection.upsert(
                ids=batch_ids,
                embeddings=embeddings,
                documents=batch_documents,
                metadatas=batch_metadatas,
            )
            embedded_count += len(batch_ids)
            logger.info(f"Embedded final batch of {len(batch_ids)} doc chunks")
        except Exception as e:
            logger.warning(f"Failed to embed final batch: {e}")

    logger.info(f"Total embedded: {embedded_count} chunks from {base_url}")
    return embedded_count


async def search_docs(query: str, top_k: int = 5) -> list[dict]:
    """
    Search documentation using semantic similarity.

    Args:
        query: Natural language query
        top_k: Number of results to return

    Returns:
        List of matching documentation chunks with URLs
    """
    collection = _get_collection()

    if collection.count() == 0:
        return []

    # Generate query embedding
    query_embedding = await _generate_embedding(query)

    # Search
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    # Format results
    formatted = []
    for i, doc in enumerate(results["documents"][0]):
        metadata = results["metadatas"][0][i]
        distance = results["distances"][0][i]

        formatted.append(
            {
                "url": metadata["url"],
                "page_title": metadata["page_title"],
                "section": metadata.get("section", ""),
                "site": metadata.get("site", ""),
                "content": doc,
                "similarity": round(1 - distance, 3),  # Convert distance to similarity
            }
        )

    return formatted


async def update_all_sites(sites: Optional[list[str]] = None):
    """Update embeddings for all configured documentation sites."""
    if sites is None:
        from ..config import config

        sites = config.doc_sites if hasattr(config, "doc_sites") else DEFAULT_DOC_SITES

    async with _update_lock:
        logger.info(f"Updating {len(sites)} documentation sites...")

        total_chunks = 0
        for site in sites:
            try:
                count = await embed_site(site, force_full=False)
                total_chunks += count
                logger.info(f"Updated {site}: {count} new/changed chunks")
            except Exception as e:
                logger.error(f"Failed to update {site}: {e}", exc_info=True)

        logger.info(f"Documentation update complete: {total_chunks} total chunks embedded")


async def initialize():
    """
    Initialize documentation embeddings on startup.

    Crawls and embeds all configured sites if not already done.
    """
    from ..config import config

    if not config.doc_embeddings_enabled:
        logger.info("Documentation embeddings disabled")
        return

    sites = config.doc_sites if hasattr(config, "doc_sites") else DEFAULT_DOC_SITES
    logger.info(f"Initializing documentation embeddings for {len(sites)} sites...")

    # Check if we need initial embedding
    collection = _get_collection()
    if collection.count() == 0:
        logger.info("No existing doc embeddings found, running full crawl...")
        await update_all_sites(sites)
    else:
        logger.info(f"Found {collection.count()} existing doc embeddings")


def get_doc_stats() -> dict:
    """Get documentation embedding stats."""
    collection = _get_collection()
    return {
        "total_chunks": collection.count(),
        "embeddings_dir": str(DOC_EMBEDDINGS_DIR),
        "cache_dir": str(DOC_CACHE_DIR),
    }


async def close():
    """Clean up resources on shutdown."""
    global _openai_client, _chroma_client, _collection

    # Close OpenAI client
    if _openai_client:
        await _openai_client.close()

    # Clear references (ChromaDB handles its own cleanup)
    _openai_client = None
    _collection = None
    _chroma_client = None
    logger.info("Documentation embeddings service closed")
