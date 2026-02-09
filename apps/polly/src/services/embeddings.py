import asyncio
import hashlib
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_model = None
_chroma_client = None
_collection = None

DATA_DIR = Path(__file__).parent.parent.parent / "data"
REPO_DIR = DATA_DIR / "repo"
EMBEDDINGS_DIR = DATA_DIR / "embeddings"

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

MAX_FILE_SIZE = 500 * 1024

UPDATE_DEBOUNCE_SECONDS = 30
_pending_update_task: Optional[asyncio.Task] = None
_update_lock = asyncio.Lock()

_initialized = asyncio.Event()
_initialization_started = False


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
        logger.info("OpenAI embeddings client initialized")
    return _model


def _get_collection():
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


async def wait_for_initialization(timeout: float = 300.0) -> bool:
    from ..config import config

    if not config.local_embeddings_enabled:
        logger.debug("Local embeddings disabled, skipping wait")
        return True

    try:
        logger.debug(f"Waiting for embeddings initialization (timeout={timeout}s)...")
        await asyncio.wait_for(_initialized.wait(), timeout=timeout)
        logger.debug("Embeddings initialized and ready")
        return True
    except asyncio.TimeoutError:
        logger.warning(f"Embeddings initialization timeout after {timeout}s - proceeding anyway")
        return False


def _chunk_code(content: str, file_path: str, max_lines: int = 100) -> list[dict]:
    lines = content.split("\n")

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
    return hashlib.md5(content.encode()).hexdigest()


async def clone_or_pull_repo(repo: str) -> bool:
    REPO_DIR.mkdir(parents=True, exist_ok=True)
    repo_path = REPO_DIR / repo.replace("/", "_")

    try:
        if repo_path.exists():
            result = await asyncio.to_thread(
                subprocess.run,
                ["git", "-C", str(repo_path), "fetch", "origin", "main"],
                capture_output=True,
                text=True,
            )

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

            logger.info(f"Pulling latest changes for {repo}...")
            await asyncio.to_thread(
                subprocess.run,
                ["git", "-C", str(repo_path), "pull", "origin", "main"],
                capture_output=True,
                text=True,
            )
            return True
        else:
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
    files = []

    for root, dirs, filenames in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

        for filename in filenames:
            file_path = Path(root) / filename

            if file_path.suffix.lower() not in CODE_EXTENSIONS:
                continue

            try:
                if file_path.stat().st_size > MAX_FILE_SIZE:
                    continue
            except OSError:
                continue

            files.append(file_path)

    return files


async def embed_repository(repo: str, force_full: bool = False) -> int:
    repo_path = REPO_DIR / repo.replace("/", "_")

    if not repo_path.exists():
        logger.error(f"Repo not found at {repo_path}")
        return 0

    model = _get_model()
    collection = _get_collection()

    files = _collect_code_files(repo_path)
    total_files = len(files)
    logger.info(f"Found {total_files} code files to process")

    embedded_count = 0
    all_ids = []
    all_embeddings = []
    all_documents = []
    all_metadatas = []
    ids_to_delete = []
    files_skipped = 0
    files_processed = 0

    for file_idx, file_path in enumerate(files, 1):
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            rel_path = str(file_path.relative_to(repo_path))
            file_hash = _file_hash(content)

            # Check if file has changed (file-level TTL)
            if not force_full and collection.count() > 0:
                existing = collection.get(where={"file_path": rel_path})
                
                if existing["ids"] and existing["metadatas"]:
                    # Check if file hash matches any existing chunk from this file
                    existing_file_hash = existing["metadatas"][0].get("file_hash")
                    
                    if existing_file_hash == file_hash:
                        logger.debug(f"TTL: Skipping {rel_path} (unchanged, hash={file_hash[:8]})...")
                        files_skipped += 1
                        continue
                    else:
                        # File changed, delete old chunks for this file
                        ids_to_delete.extend(existing["ids"])
                        logger.debug(f"TTL: File {rel_path} changed, deleting {len(existing['ids'])} old chunks")

            chunks = _chunk_code(content, rel_path)

            for chunk in chunks:
                chunk_id = f"{rel_path}:{chunk['start_line']}-{chunk['end_line']}"
                content_hash = _file_hash(chunk["content"])

                try:
                    embedding_response = await asyncio.to_thread(
                        lambda: model.embeddings.create(
                            model="text-embedding-3-small",
                            input=chunk["content"]
                        )
                    )
                    embedding = embedding_response.data[0].embedding
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
                        logger.warning(f"Failed to embed chunk from {rel_path}: {e}")
                        continue

                all_ids.append(chunk_id)
                all_embeddings.append(embedding)
                all_documents.append(chunk["content"])
                all_metadatas.append(
                    {
                        "file_path": rel_path,
                        "start_line": chunk["start_line"],
                        "end_line": chunk["end_line"],
                        "hash": content_hash,
                        "file_hash": file_hash,
                    }
                )

                embedded_count += 1

        except Exception as e:
            logger.warning(f"Failed to process {file_path}: {e}")
            continue
        
        files_processed += 1
        progress_pct = (files_processed / total_files) * 100
        chunks_in_queue = len(all_ids)
        
        # Log progress every 10% or every 10 files
        if files_processed % max(1, total_files // 10) == 0 or files_processed == total_files:
            logger.info(f"📊 Code embedding progress: {files_processed}/{total_files} files ({progress_pct:.1f}%), {chunks_in_queue} chunks queued for embedding")

    # Delete old chunks from files that were modified
    if ids_to_delete:
        collection.delete(ids=ids_to_delete)
        logger.info(f"Deleted {len(ids_to_delete)} old chunks from {len(set(m['file_path'] for m in [collection.get(ids=[id_])['metadatas'][0] if collection.get(ids=[id_])['ids'] else {} for id_ in ids_to_delete]))} changed files")

    # Upsert new chunks
    if all_ids:
        collection.upsert(
            ids=all_ids,
            embeddings=all_embeddings,
            documents=all_documents,
            metadatas=all_metadatas,
        )
        unique_files = len(set(m["file_path"] for m in all_metadatas))
        logger.info(f"Embedded {embedded_count} chunks from {unique_files} files (TTL: skipped {files_skipped} unchanged files)")

    return embedded_count


async def search_code(query: str, top_k: int = 5) -> list[dict]:
    await wait_for_initialization()
    
    model = _get_model()
    collection = _get_collection()

    if collection.count() == 0:
        return []

    embedding_response = await asyncio.to_thread(
        lambda: model.embeddings.create(
            model="text-embedding-3-small",
            input=query,
            dimensions=1536
        )
    )
    query_embedding = embedding_response.data[0].embedding

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

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
                "similarity": round(1 - distance, 3),
            }
        )

    return formatted


async def pull_and_update():
    from ..config import config

    async with _update_lock:
        logger.info("Updating repository and embeddings...")

        had_changes = await clone_or_pull_repo(config.embeddings_repo)

        if had_changes:
            logger.info("Repository changes detected, running incremental embedding update...")
            count = await embed_repository(config.embeddings_repo, force_full=False)
            logger.info(f"Update complete. Embedded {count} new/changed chunks.")

            await _sync_sandbox_repo()
        else:
            logger.info("No repository changes detected, skipping embedding update")


async def _sync_sandbox_repo():
    try:
        from .code_agent.sandbox import get_persistent_sandbox

        sandbox = get_persistent_sandbox()

        if await sandbox.is_running():
            logger.info("Syncing sandbox workspace with updated repo...")
            await sandbox.sync_repo(force=True)
            logger.info("Sandbox workspace synced successfully")
        else:
            logger.info("Sandbox not running, skipping sync (will sync on next task)")

    except Exception as e:
        logger.warning(f"Failed to sync sandbox repo: {e}")


async def schedule_update():
    global _pending_update_task

    if _pending_update_task and not _pending_update_task.done():
        _pending_update_task.cancel()
        try:
            await _pending_update_task
        except asyncio.CancelledError:
            pass

    async def _delayed_update():
        await asyncio.sleep(UPDATE_DEBOUNCE_SECONDS)
        await pull_and_update()

    _pending_update_task = asyncio.create_task(_delayed_update())
    logger.debug(f"Update scheduled in {UPDATE_DEBOUNCE_SECONDS}s")


async def initialize():
    from ..config import config
    global _initialization_started

    if not config.local_embeddings_enabled:
        logger.info("Local embeddings disabled")
        _initialized.set()
        return

    if _initialization_started:
        logger.debug("Embeddings initialization already started")
        return
    _initialization_started = True

    try:
        logger.info(f"Initializing embeddings for {config.embeddings_repo}...")

        await clone_or_pull_repo(config.embeddings_repo)

        collection = _get_collection()
        if collection.count() == 0:
            logger.info("No existing embeddings found, running full embed (first initialization)...")
            count = await embed_repository(config.embeddings_repo, force_full=True)
            logger.info(f"Full initialization complete: embedded {count} chunks")
        else:
            logger.info(f"Found {collection.count()} existing embeddings from previous session")
            logger.info("📌 TTL: On restart, embeddings persist in ChromaDB. Only changed portions will be re-embedded on next repo update")
        
        _initialized.set()
        logger.info("Embeddings initialization complete")
    
    except Exception as e:
        logger.error(f"Embeddings initialization failed: {e}", exc_info=True)
        _initialized.set()


def get_stats() -> dict:
    collection = _get_collection()
    return {
        "total_chunks": collection.count(),
        "repo_dir": str(REPO_DIR),
        "embeddings_dir": str(EMBEDDINGS_DIR),
    }


async def close():
    global _model, _chroma_client, _collection, _pending_update_task

    if _pending_update_task and not _pending_update_task.done():
        _pending_update_task.cancel()
        try:
            await _pending_update_task
        except asyncio.CancelledError:
            pass

    _model = None
    _collection = None
    _chroma_client = None
    logger.info("Embeddings service closed")
