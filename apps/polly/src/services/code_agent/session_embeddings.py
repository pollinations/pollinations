"""
Session-scoped embeddings for sandbox code changes.

Creates an isolated embedding index per sandbox session that:
1. Tracks files edited by the code agent in real-time
2. Allows semantic search over session changes
3. Gets destroyed when sandbox ends
4. Can be combined with global repo embeddings for full search
"""

import asyncio
import hashlib
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Lazy imports for heavy dependencies
_model = None


def _get_model():
    """Lazy load the embedding model (shared with global embeddings)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model for session...")
        _model = SentenceTransformer(
            "jinaai/jina-embeddings-v2-base-code", trust_remote_code=True
        )
    return _model


def _chunk_code(content: str, file_path: str, max_lines: int = 100) -> list[dict]:
    """
    Split code into chunks for embedding.

    Same logic as global embeddings for consistency.
    """
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


@dataclass
class EmbeddedChunk:
    """A single embedded code chunk."""

    id: str
    file_path: str
    start_line: int
    end_line: int
    content: str
    embedding: list[float]
    content_hash: str


@dataclass
class SessionEmbeddings:
    """
    Session-scoped embedding index for a sandbox.

    Stores embeddings in-memory (no persistence needed since sandbox is temporary).
    Automatically updates when files are written.
    """

    sandbox_id: str
    chunks: dict[str, EmbeddedChunk] = field(default_factory=dict)
    files_indexed: set[str] = field(default_factory=set)
    _initialized: bool = False

    async def initialize(self):
        """Initialize the session embeddings (load model if needed)."""
        if not self._initialized:
            # Pre-load model in background
            await asyncio.to_thread(_get_model)
            self._initialized = True
            logger.info(f"Session embeddings initialized for sandbox {self.sandbox_id}")

    async def index_file(self, file_path: str, content: str) -> int:
        """
        Index or re-index a file.

        Called automatically when files are written to sandbox.

        Args:
            file_path: Relative path of the file
            content: File content

        Returns:
            Number of chunks indexed
        """
        if not content.strip():
            return 0

        model = _get_model()

        # Remove old chunks for this file
        old_chunk_ids = [
            chunk_id
            for chunk_id, chunk in self.chunks.items()
            if chunk.file_path == file_path
        ]
        for chunk_id in old_chunk_ids:
            del self.chunks[chunk_id]

        # Chunk the file
        chunks = _chunk_code(content, file_path)

        # Generate embeddings
        indexed_count = 0
        for chunk in chunks:
            chunk_id = f"{file_path}:{chunk['start_line']}-{chunk['end_line']}"
            content_hash = hashlib.md5(chunk["content"].encode()).hexdigest()

            # Generate embedding
            embedding = await asyncio.to_thread(model.encode, chunk["content"])

            self.chunks[chunk_id] = EmbeddedChunk(
                id=chunk_id,
                file_path=file_path,
                start_line=chunk["start_line"],
                end_line=chunk["end_line"],
                content=chunk["content"],
                embedding=embedding.tolist(),
                content_hash=content_hash,
            )
            indexed_count += 1

        self.files_indexed.add(file_path)
        logger.debug(
            f"Indexed {indexed_count} chunks from {file_path} in session {self.sandbox_id}"
        )

        return indexed_count

    async def remove_file(self, file_path: str):
        """Remove a file from the index."""
        old_chunk_ids = [
            chunk_id
            for chunk_id, chunk in self.chunks.items()
            if chunk.file_path == file_path
        ]
        for chunk_id in old_chunk_ids:
            del self.chunks[chunk_id]

        self.files_indexed.discard(file_path)
        logger.debug(f"Removed {file_path} from session {self.sandbox_id}")

    async def search(self, query: str, top_k: int = 5) -> list[dict]:
        """
        Search session embeddings using semantic similarity.

        Args:
            query: Natural language query or code snippet
            top_k: Number of results to return

        Returns:
            List of matching code chunks with similarity scores
        """
        if not self.chunks:
            return []

        model = _get_model()

        # Generate query embedding
        query_embedding = await asyncio.to_thread(model.encode, query)

        # Calculate cosine similarity with all chunks
        import numpy as np

        query_vec = np.array(query_embedding)

        results = []
        for chunk in self.chunks.values():
            chunk_vec = np.array(chunk.embedding)

            # Cosine similarity
            similarity = np.dot(query_vec, chunk_vec) / (
                np.linalg.norm(query_vec) * np.linalg.norm(chunk_vec)
            )

            results.append(
                {
                    "file_path": chunk.file_path,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "content": chunk.content,
                    "similarity": round(float(similarity), 3),
                    "source": "session",
                }
            )

        # Sort by similarity and return top_k
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]

    def get_stats(self) -> dict:
        """Get session embedding stats."""
        return {
            "sandbox_id": self.sandbox_id,
            "total_chunks": len(self.chunks),
            "files_indexed": len(self.files_indexed),
            "file_list": list(self.files_indexed),
        }

    def clear(self):
        """Clear all embeddings (called on sandbox destruction)."""
        self.chunks.clear()
        self.files_indexed.clear()
        logger.info(f"Session embeddings cleared for sandbox {self.sandbox_id}")


class SessionEmbeddingsManager:
    """
    Manages session embeddings across all sandboxes.

    Each sandbox gets its own isolated embedding index.
    """

    def __init__(self):
        self.sessions: dict[str, SessionEmbeddings] = {}

    async def create_session(self, sandbox_id: str) -> SessionEmbeddings:
        """Create a new session embedding index for a sandbox."""
        session = SessionEmbeddings(sandbox_id=sandbox_id)
        await session.initialize()
        self.sessions[sandbox_id] = session
        logger.info(f"Created session embeddings for sandbox {sandbox_id}")
        return session

    def get_session(self, sandbox_id: str) -> Optional[SessionEmbeddings]:
        """Get session embeddings for a sandbox."""
        return self.sessions.get(sandbox_id)

    async def destroy_session(self, sandbox_id: str):
        """Destroy session embeddings when sandbox is destroyed."""
        session = self.sessions.pop(sandbox_id, None)
        if session:
            session.clear()
            logger.info(f"Destroyed session embeddings for sandbox {sandbox_id}")

    async def index_file(self, sandbox_id: str, file_path: str, content: str) -> int:
        """Index a file in the sandbox's session embeddings."""
        session = self.sessions.get(sandbox_id)
        if not session:
            # Auto-create session if needed
            session = await self.create_session(sandbox_id)

        return await session.index_file(file_path, content)

    async def search_session(
        self, sandbox_id: str, query: str, top_k: int = 5
    ) -> list[dict]:
        """Search only session embeddings."""
        session = self.sessions.get(sandbox_id)
        if not session:
            return []

        return await session.search(query, top_k)

    async def search_combined(
        self,
        sandbox_id: str,
        query: str,
        top_k: int = 10,
        session_weight: float = 1.2,
    ) -> list[dict]:
        """
        Search both session and global embeddings, combining results.

        Session results get a slight boost since they're more relevant
        to the current task context.

        Args:
            sandbox_id: Sandbox ID
            query: Search query
            top_k: Total results to return
            session_weight: Multiplier for session result scores (default 1.2 = 20% boost)

        Returns:
            Combined results from both sources, deduplicated by file path
        """
        from ..embeddings import search_code as global_search

        results = []
        seen_files = set()

        # Search session embeddings first (with boosted scores)
        session_results = await self.search_session(sandbox_id, query, top_k=top_k)
        for r in session_results:
            r["similarity"] = min(
                1.0, r["similarity"] * session_weight
            )  # Boost but cap at 1.0
            results.append(r)
            seen_files.add(r["file_path"])

        # Search global embeddings
        try:
            global_results = await global_search(query, top_k=top_k)
            for r in global_results:
                # Skip if we already have this file from session (session is more current)
                if r["file_path"] not in seen_files:
                    r["source"] = "global"
                    results.append(r)
                    seen_files.add(r["file_path"])
        except Exception as e:
            logger.warning(f"Global search failed: {e}")

        # Sort combined results by similarity
        results.sort(key=lambda x: x["similarity"], reverse=True)

        return results[:top_k]


# Global manager instance
session_embeddings_manager = SessionEmbeddingsManager()
