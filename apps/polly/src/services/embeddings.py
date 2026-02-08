"""OpenAI embeddings service for semantic code search.

Uses OpenAI text-embedding-3-small + ChromaDB for code search.
Only active when LOCAL_EMBEDDINGS_ENABLED=true in .env
"""

import asyncio
import hashlib
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional

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
REPO_DIR = DATA_DIR / "repo"
EMBEDDINGS_DIR = DATA_DIR / "embeddings"

# File extensions to embed
CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".kt",
    ".scala",
    ".vue",
    ".svelte",
    ".html",
    ".css",
    ".scss",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".md",
    ".mdx",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".dockerfile",
    ".tf",
}

# Directories to skip
SKIP_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    "bin",
    "obj",
    ".idea",
    ".vscode",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
}

# Max file size to embed (500KB)
MAX_FILE_SIZE = 500 * 1024

# Debounce settings
UPDATE_DEBOUNCE_SECONDS = 30
_pending_update_task: Optional[asyncio.Task] = None
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
        logger.info("OpenAI embeddings client initialized")
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
    """Lazy load ChromaDB collection."""
    global _chroma_client, _collection
    if _collection is None:
        import chromadb

        EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(EMBEDDINGS_DIR))
        _collection = _chroma_client.get_or_create_collection(
            name="code_embeddings", metadata={"hnsw:space": "cosine"}
        )
        logger.info(f"ChromaDB collection loaded with {_collection.count()} embeddings")
    return _collection


def _chunk_code(content: str, file_path: str, max_lines: int = 100) -> list[dict]:
    """
    Split code into chunks for embedding.

    Small files (<100 lines): embed whole file
    Large files: split by function/class boundaries or fixed chunks
    """
    lines = content.split("\n")

    # Small file - embed whole thing
    if len(lines) <= max_lines:
        return [
            {
                "content": content,
                "file_path": file_path,
                "start_line": 1,
                "end_line": len(lines),
            }
        ]

    chunks = []
    current_chunk = []
    chunk_start = 1

    for i, line in enumerate(lines, 1):
        current_chunk.append(line)

        # Check for natural break points (function/class definitions)
        is_break = len(current_chunk) >= max_lines or (
            len(current_chunk) >= 20 and _is_definition_start(line)
        )

        if is_break and current_chunk:
            chunks.append(
                {
                    "content": "\n".join(current_chunk),
                    "file_path": file_path,
                    "start_line": chunk_start,
                    "end_line": i,
                }
            )
            current_chunk = []
            chunk_start = i + 1

    # Don't forget the last chunk
    if current_chunk:
        chunks.append(
            {
                "content": "\n".join(current_chunk),
                "file_path": file_path,
                "start_line": chunk_start,
                "end_line": len(lines),
            }
        )

    return chunks


def _is_definition_start(line: str) -> bool:
    """Check if line starts a function/class definition."""
    stripped = line.strip()
    return (
        stripped.startswith("def ")
        or stripped.startswith("class ")
        or stripped.startswith("async def ")
        or stripped.startswith("function ")
        or stripped.startswith("const ")
        or stripped.startswith("export ")
        or stripped.startswith("pub fn ")
        or stripped.startswith("fn ")
        or stripped.startswith("func ")
    )


def _file_hash(content: str) -> str:
    """Generate hash of file content for change detection."""
    return hashlib.md5(content.encode()).hexdigest()


async def clone_or_pull_repo(repo: str) -> bool:
    """
    Clone repo if not exists, or pull latest changes.

    Returns True if there were changes, False otherwise.
    """
    REPO_DIR.mkdir(parents=True, exist_ok=True)
    repo_path = REPO_DIR / repo.replace("/", "_")

    try:
        if repo_path.exists():
            # Check if there are changes
            result = await asyncio.to_thread(
                subprocess.run,
                ["git", "-C", str(repo_path), "fetch", "origin", "main"],
                capture_output=True,
                text=True,
            )

            # Compare local vs remote
            local = await asyncio.to_thread(
                subprocess.run,
                ["git", "-C", str(repo_path), "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
            )
            remote = await asyncio.to_thread(
                subprocess.run,
                ["git", "-C", str(repo_path), "rev-parse", "origin/main"],
                capture_output=True,
                text=True,
            )

            if local.stdout.strip() == remote.stdout.strip():
                logger.debug("Repo already up to date")
                return False

            # Pull changes
            logger.info(f"Pulling latest changes for {repo}...")
            await asyncio.to_thread(
                subprocess.run,
                ["git", "-C", str(repo_path), "pull", "origin", "main"],
                capture_output=True,
                text=True,
            )
            return True
        else:
            # Fresh clone
            logger.info(f"Cloning {repo}...")
            await asyncio.to_thread(
                subprocess.run,
                [
                    "git",
                    "clone",
                    "--depth=1",
                    f"https://github.com/{repo}.git",
                    str(repo_path),
                ],
                capture_output=True,
                text=True,
            )
            return True

    except Exception as e:
        logger.error(f"Git operation failed: {e}")
        return False


async def get_changed_files(repo: str) -> list[str]:
    """Get list of changed files from last pull."""
    repo_path = REPO_DIR / repo.replace("/", "_")

    try:
        result = await asyncio.to_thread(
            subprocess.run,
            ["git", "-C", str(repo_path), "diff", "--name-only", "HEAD~1", "HEAD"],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            return [f for f in result.stdout.strip().split("\n") if f]
    except Exception as e:
        logger.error(f"Failed to get changed files: {e}")

    return []


def _collect_code_files(repo_path: Path) -> list[Path]:
    """Collect all code files from repo."""
    files = []

    for root, dirs, filenames in os.walk(repo_path):
        # Skip unwanted directories
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

        for filename in filenames:
            file_path = Path(root) / filename

            # Check extension
            if file_path.suffix.lower() not in CODE_EXTENSIONS:
                continue

            # Check file size
            try:
                if file_path.stat().st_size > MAX_FILE_SIZE:
                    continue
            except OSError:
                continue

            files.append(file_path)

    return files


async def embed_repository(repo: str, force_full: bool = False) -> int:
    """
    Embed all code files in repository.

    Args:
        repo: Repository in format "owner/repo"
        force_full: If True, re-embed everything. Otherwise incremental.

    Returns:
        Number of chunks embedded
    """
    repo_path = REPO_DIR / repo.replace("/", "_")

    if not repo_path.exists():
        logger.error(f"Repo not found at {repo_path}")
        return 0

    collection = _get_collection()

    # Get all code files
    files = _collect_code_files(repo_path)
    logger.info(f"Found {len(files)} code files to process")

    # Track what we've embedded
    embedded_count = 0
    batch_size = 100  # Process 100 chunks at a time for efficiency
    batch_ids = []
    batch_texts = []
    batch_documents = []
    batch_metadatas = []

    for file_path in files:
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            rel_path = str(file_path.relative_to(repo_path))

            # Chunk the file
            chunks = _chunk_code(content, rel_path)

            for chunk in chunks:
                chunk_id = f"{rel_path}:{chunk['start_line']}-{chunk['end_line']}"
                content_hash = _file_hash(chunk["content"])

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
                        "file_path": rel_path,
                        "start_line": chunk["start_line"],
                        "end_line": chunk["end_line"],
                        "hash": content_hash,
                    }
                )

                # Process batch when full
                if len(batch_texts) >= batch_size:
                    embeddings = await _generate_embeddings_batch(batch_texts)
                    collection.upsert(
                        ids=batch_ids,
                        embeddings=embeddings,
                        documents=batch_documents,
                        metadatas=batch_metadatas,
                    )
                    embedded_count += len(batch_ids)
                    logger.info(f"Embedded batch of {len(batch_ids)} chunks")

                    # Clear batch
                    batch_ids = []
                    batch_texts = []
                    batch_documents = []
                    batch_metadatas = []

        except Exception as e:
            logger.warning(f"Failed to process {file_path}: {e}")
            continue

    # Process remaining batch
    if batch_ids:
        embeddings = await _generate_embeddings_batch(batch_texts)
        collection.upsert(
            ids=batch_ids,
            embeddings=embeddings,
            documents=batch_documents,
            metadatas=batch_metadatas,
        )
        embedded_count += len(batch_ids)
        logger.info(f"Embedded final batch of {len(batch_ids)} chunks")

    logger.info(f"Total embedded: {embedded_count} chunks")
    return embedded_count


async def search_code(query: str, top_k: int = 5) -> list[dict]:
    """
    Search code using semantic similarity.

    Args:
        query: Natural language query or code snippet
        top_k: Number of results to return

    Returns:
        List of matching code chunks with file paths and line numbers
    """
    collection = _get_collection()

    if collection.count() == 0:
        return []

    # Generate query embedding
    query_embedding = await _generate_embedding(query)

    # Search
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    # Format results
    formatted = []
    for i, doc in enumerate(results["documents"][0]):
        metadata = results["metadatas"][0][i]
        distance = results["distances"][0][i]

        formatted.append(
            {
                "file_path": metadata["file_path"],
                "start_line": metadata["start_line"],
                "end_line": metadata["end_line"],
                "content": doc,
                "similarity": round(1 - distance, 3),  # Convert distance to similarity
            }
        )

    return formatted


async def pull_and_update():
    """Pull latest changes, update embeddings, and sync sandbox."""
    from ..config import config

    async with _update_lock:
        logger.info("Updating repository and embeddings...")

        had_changes = await clone_or_pull_repo(config.embeddings_repo)

        if had_changes:
            count = await embed_repository(config.embeddings_repo)
            logger.info(f"Update complete. Embedded {count} new/changed chunks.")

            # Also sync the sandbox workspace so it has the latest code
            await _sync_sandbox_repo()
        else:
            logger.info("No changes detected")


async def _sync_sandbox_repo():
    """Sync the sandbox workspace with the updated local repo."""
    try:
        from .code_agent.sandbox import get_persistent_sandbox

        sandbox = get_persistent_sandbox()

        # Check if sandbox is running before syncing
        if await sandbox.is_running():
            logger.info("Syncing sandbox workspace with updated repo...")
            await sandbox.sync_repo(force=True)
            logger.info("Sandbox workspace synced successfully")
        else:
            logger.info("Sandbox not running, skipping sync (will sync on next task)")

    except Exception as e:
        logger.warning(f"Failed to sync sandbox repo: {e}")


async def schedule_update():
    """
    Schedule a debounced update.

    Multiple calls within UPDATE_DEBOUNCE_SECONDS will result in only one update.
    """
    global _pending_update_task

    # Cancel any pending update
    if _pending_update_task and not _pending_update_task.done():
        _pending_update_task.cancel()
        try:
            await _pending_update_task
        except asyncio.CancelledError:
            pass

    # Schedule new update
    async def _delayed_update():
        await asyncio.sleep(UPDATE_DEBOUNCE_SECONDS)
        await pull_and_update()

    _pending_update_task = asyncio.create_task(_delayed_update())
    logger.debug(f"Update scheduled in {UPDATE_DEBOUNCE_SECONDS}s")


async def initialize():
    """
    Initialize embeddings on startup.

    Clones repo if needed and ensures embeddings exist.
    """
    from ..config import config

    if not config.local_embeddings_enabled:
        logger.info("Local embeddings disabled")
        return

    logger.info(f"Initializing embeddings for {config.embeddings_repo}...")

    # Clone/pull repo
    await clone_or_pull_repo(config.embeddings_repo)

    # Check if we need initial embedding
    collection = _get_collection()
    if collection.count() == 0:
        logger.info("No existing embeddings found, running full embed...")
        await embed_repository(config.embeddings_repo, force_full=True)
    else:
        logger.info(f"Found {collection.count()} existing embeddings")


def get_stats() -> dict:
    """Get embedding stats."""
    collection = _get_collection()
    return {
        "total_chunks": collection.count(),
        "repo_dir": str(REPO_DIR),
        "embeddings_dir": str(EMBEDDINGS_DIR),
    }


async def close():
    """Clean up resources on shutdown."""
    global _openai_client, _chroma_client, _collection, _pending_update_task

    # Cancel any pending update
    if _pending_update_task and not _pending_update_task.done():
        _pending_update_task.cancel()
        try:
            await _pending_update_task
        except asyncio.CancelledError:
            pass

    # Close OpenAI client
    if _openai_client:
        await _openai_client.close()

    # Clear references (ChromaDB handles its own cleanup)
    _openai_client = None
    _collection = None
    _chroma_client = None
    logger.info("Embeddings service closed")
