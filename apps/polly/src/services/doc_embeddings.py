import asyncio
import hashlib
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

_model = None
_chroma_client = None
_collection = None

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DOC_EMBEDDINGS_DIR = DATA_DIR / "doc_embeddings"
DOC_CACHE_DIR = DATA_DIR / "doc_cache"

DEFAULT_DOC_SITES = [
    "https://enter.pollinations.ai",
    "https://kpi.myceli.ai",
    "https://gsoc.pollinations.ai",
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
        import os
        from openai import OpenAI

        api_key = os.getenv("OPENAI_EMBEDDINGS_API")
        if not api_key:
            logger.error("OPENAI_EMBEDDINGS_API environment variable not set")
            raise ValueError("OPENAI_EMBEDDINGS_API is required")
        
        # Validate API key format
        if not api_key.startswith("sk-"):
            logger.error(
                "⚠️ OPENAI_EMBEDDINGS_API is invalid!\n"
                "  Expected: OpenAI API key starting with 'sk-'\n"
                f"  Got: {api_key[:20]}...\n"
                "  \n"
                "  Get a valid OpenAI API key from: https://platform.openai.com/api-keys\n"
                "  Make sure your key has Embedding API access enabled."
            )
            raise ValueError("Invalid OPENAI_EMBEDDINGS_API - must be a valid OpenAI API key starting with 'sk-'")
        
        _model = OpenAI(api_key=api_key)
        logger.info("OpenAI embeddings client initialized for documentation")
    return _model


def _get_collection():
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


def _chunk_content(
    content: str, url: str, page_title: str, max_chunk_size: int = MAX_CHUNK_SIZE
) -> list[dict]:
    if not content or len(content) < MIN_CHUNK_SIZE:
        return []

    chunks = []

    header_pattern = r"^(#{1,6})\s+(.+)$"
    lines = content.split("\n")

    current_chunk = []
    current_section = page_title
    chunk_start_line = 0

    for i, line in enumerate(lines):
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
            chunk_start_line = i

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

    return chunks


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


async def _scrape_page(url: str) -> Optional[dict]:
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
    all_embeddings = []
    all_documents = []
    all_metadatas = []
    ids_to_delete = []
    pages_skipped = 0
    pages_processed = 0

    for page_idx, page in enumerate(pages, 1):
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
            chunk_id = f"{url}#chunk-{idx}"

            try:
                embedding_response = await asyncio.to_thread(
                    lambda: model.embeddings.create(
                        model="text-embedding-3-small",
                        input=chunk["content"],
                        dimensions=1536
                    )
                )
                embedding = embedding_response.data[0].embedding

                all_ids.append(chunk_id)
                all_embeddings.append(embedding)
                all_documents.append(chunk["content"])
                all_metadatas.append(
                    {
                        "url": chunk["url"],
                        "page_title": chunk["page_title"],
                        "section": chunk["section"],
                        "site": urlparse(base_url).netloc,
                        "page_hash": content_hash,
                        "last_updated": datetime.utcnow().isoformat(),
                    }
                )

                embedded_count += 1

            except Exception as e:
                error_msg = str(e)
                if "401" in error_msg or "permission" in error_msg.lower() or "scope" in error_msg.lower():
                    logger.error(
                        "❌ OpenAI API Error - Authentication Failed!\n"
                        f"  Error: {error_msg}\n"
                        "  \n"
                        "  This likely means:\n"
                        "  1. Your OPENAI_EMBEDDINGS_API key is invalid or expired\n"
                        "  2. Your key doesn't have Embedding API access\n"
                        "  3. You're using the wrong API key (not OpenAI)\n"
                        "  \n"
                        "  Fix:\n"
                        "  1. Get a valid key from: https://platform.openai.com/api-keys\n"
                        "  2. Make sure it has Embedding model access (text-embedding-3-small)\n"
                        "  3. Update OPENAI_EMBEDDINGS_API in your .env file\n"
                        "  4. Restart the bot"
                    )
                    raise
                else:
                    logger.warning(f"Failed to embed chunk from {url}: {e}")
                    continue
        
        pages_processed += 1
        progress_pct = (pages_processed / total_pages) * 100
        chunks_in_queue = len(all_ids)
        
        # Log progress every 10% or every 10 pages
        if pages_processed % max(1, total_pages // 10) == 0 or pages_processed == total_pages:
            logger.info(f"📊 Doc embedding progress: {pages_processed}/{total_pages} pages ({progress_pct:.1f}%), {chunks_in_queue} chunks queued for embedding")

    # Delete old chunks from pages that were modified
    if ids_to_delete:
        collection.delete(ids=ids_to_delete)
        logger.info(f"Deleted {len(ids_to_delete)} old chunks from changed pages")

    # Upsert new chunks
    if all_ids:
        collection.upsert(
            ids=all_ids,
            embeddings=all_embeddings,
            documents=all_documents,
            metadatas=all_metadatas,
        )
        unique_urls = len(set(m["url"] for m in all_metadatas))
        logger.info(f"Embedded {embedded_count} chunks from {unique_urls} pages (TTL: skipped {pages_skipped} unchanged pages)")

    return embedded_count


async def search_docs(query: str, top_k: int = 5) -> list[dict]:
    model = _get_model()
    collection = _get_collection()

    if collection.count() == 0:
        return []

    embedding_response = await asyncio.to_thread(
        lambda: model.embeddings.create(
            model="text-embedding-3-small",
            input=query
        )
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
                "url": metadata["url"],
                "page_title": metadata["page_title"],
                "section": metadata.get("section", ""),
                "site": metadata.get("site", ""),
                "content": doc,
                "similarity": round(1 - distance, 3),
            }
        )

    return formatted


async def update_all_sites(sites: Optional[list[str]] = None):
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

        logger.info(f"Documentation update complete: {total_chunks} total chunks embedded")


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
        await update_all_sites(sites)
    else:
        logger.info(f"Found {collection.count()} existing doc embeddings from previous session")
        logger.info("📌 TTL: On restart, doc embeddings persist in ChromaDB with page-level hash tracking")


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
