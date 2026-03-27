# Polly Persistent Memory Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Polly global knowledge accumulation — learning solutions, patterns, decisions, and knowledge from all Discord conversations via a dual SQLite+ChromaDB memory store with NVIDIA NIM embeddings and reranking.

**Architecture:** Post-conversation LLM extraction → dual store (SQLite for structured records, ChromaDB for semantic search with NIM 2048-dim embeddings) → per-message adaptive retrieval (NIM embed → ChromaDB top 20 → NIM rerank → weighted top 5 injection). Retrieval runs in parallel with Discord history fetch for zero added latency.

**Tech Stack:** Python 3.11+, aiosqlite, chromadb, aiohttp (NIM API calls), NVIDIA NIM (`llama-nemotron-embed-vl-1b-v2` embedder, `llama-nemotron-rerank-1b-v2` reranker)

---

## Chunk 1: NIM Client + Memory Store

### Task 1: NVIDIA NIM Client (`src/services/nvidia_nim.py`)

**Files:**
- Create: `apps/polly/src/services/nvidia_nim.py`

- [ ] **Step 1: Write the NIM client module**

```python
"""NVIDIA NIM client for embeddings and reranking."""

from __future__ import annotations

import logging
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

NIM_EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings"
NIM_EMBED_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2"
NIM_RERANK_URL = "https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking"
NIM_RERANK_MODEL = "nvidia/llama-nemotron-rerank-1b-v2"


class NIMClient:
    """Async client for NVIDIA NIM embedding and reranking APIs."""

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30, connect=5),
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
        return self._session

    async def embed(
        self,
        texts: list[str],
        input_type: str = "passage",
    ) -> list[list[float]]:
        """Embed texts using NIM. input_type: 'passage' for indexing, 'query' for search."""
        session = await self._get_session()
        # NIM max 50 per batch
        all_embeddings = []
        for i in range(0, len(texts), 50):
            batch = texts[i : i + 50]
            payload = {
                "model": NIM_EMBED_MODEL,
                "input": batch,
                "input_type": input_type,
                "encoding_format": "float",
                "truncate": "END",
            }
            async with session.post(NIM_EMBED_URL, json=payload) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error(f"NIM embed error {resp.status}: {body}")
                    raise RuntimeError(f"NIM embed failed: {resp.status}")
                data = await resp.json()
            # Sort by index to preserve order
            sorted_data = sorted(data["data"], key=lambda x: x["index"])
            all_embeddings.extend([item["embedding"] for item in sorted_data])
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query text."""
        result = await self.embed([text], input_type="query")
        return result[0]

    async def rerank(
        self,
        query: str,
        passages: list[str],
    ) -> list[dict[str, Any]]:
        """Rerank passages against query. Returns [{index, logit}, ...] sorted by logit desc."""
        if not passages:
            return []
        session = await self._get_session()
        payload = {
            "model": NIM_RERANK_MODEL,
            "query": {"text": query},
            "passages": [{"text": p} for p in passages],
        }
        async with session.post(NIM_RERANK_URL, json=payload) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.error(f"NIM rerank error {resp.status}: {body}")
                raise RuntimeError(f"NIM rerank failed: {resp.status}")
            data = await resp.json()
        rankings = data.get("rankings", [])
        return sorted(rankings, key=lambda x: x["logit"], reverse=True)

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
```

- [ ] **Step 2: Verify module imports cleanly**

Run: `cd /c/Users/mdakh/OneDrive/Documents/pollinations/apps/polly && python -c "from src.services.nvidia_nim import NIMClient; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/polly/src/services/nvidia_nim.py
git commit -m "feat(polly): add NVIDIA NIM client for embeddings and reranking"
```

---

### Task 2: Memory Store (`src/services/memory.py`)

**Files:**
- Create: `apps/polly/src/services/memory.py`

- [ ] **Step 1: Write the MemoryStore class — SQLite init and CRUD**

```python
"""Persistent memory store — dual SQLite + ChromaDB with NIM embeddings."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import aiosqlite

from .._json import dumps as _json_dumps
from .._json import loads as _json_loads
from .._uuid import uuid7

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "data" / "memories.db"


class MemoryStore:
    """Global memory store for Polly — learns from all conversations."""

    def __init__(self, nim_client, chroma_collection):
        self._nim = nim_client
        self._chroma = chroma_collection
        self._db: aiosqlite.Connection | None = None

    async def initialize(self):
        """Create SQLite tables and indexes."""
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(DB_PATH)
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA synchronous=NORMAL")
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                type TEXT NOT NULL,
                importance INTEGER NOT NULL,
                tags TEXT,
                entities TEXT,
                source_thread_id INTEGER,
                source_channel_id INTEGER,
                participants TEXT,
                created_at REAL NOT NULL,
                last_accessed REAL,
                access_count INTEGER DEFAULT 0
            )
        """)
        await self._db.execute("CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)")
        await self._db.execute("CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance)")
        await self._db.execute("CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at)")
        await self._db.commit()
        logger.info("Memory store initialized")

    async def store(self, memories: list[dict]) -> int:
        """Store extracted memories in both SQLite and ChromaDB.

        Each memory dict: {text, type, importance, tags, entities}
        Plus optional: source_thread_id, source_channel_id, participants
        """
        if not memories:
            return 0

        stored = 0
        ids = []
        texts = []
        metadatas = []

        for mem in memories:
            if mem.get("importance", 0) < 3:
                continue  # Skip low-importance memories

            mem_id = str(uuid7())
            now = time.time()

            await self._db.execute(
                """INSERT INTO memories (id, text, type, importance, tags, entities,
                   source_thread_id, source_channel_id, participants, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    mem_id,
                    mem["text"],
                    mem["type"],
                    mem["importance"],
                    _json_dumps(mem.get("tags", [])),
                    _json_dumps(mem.get("entities", [])),
                    mem.get("source_thread_id"),
                    mem.get("source_channel_id"),
                    _json_dumps(mem.get("participants", [])),
                    now,
                ),
            )

            ids.append(mem_id)
            texts.append(mem["text"])
            metadatas.append({
                "type": mem["type"],
                "importance": mem["importance"],
                "created_at": now,
            })
            stored += 1

        await self._db.commit()

        # Embed and store in ChromaDB
        if texts:
            embeddings = await self._nim.embed(texts, input_type="passage")
            self._chroma.add(
                ids=ids,
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas,
            )

        logger.info(f"Stored {stored} memories (filtered {len(memories) - stored} low-importance)")
        return stored

    async def retrieve(
        self,
        query: str,
        n_candidates: int = 20,
        n_results: int = 5,
    ) -> list[dict]:
        """Retrieve relevant memories: embed → ChromaDB → rerank → weighted score → top N.

        Returns list of {id, text, type, importance, score} dicts.
        """
        # Embed query
        query_embedding = await self._nim.embed_query(query)

        # Get candidates from ChromaDB
        results = self._chroma.query(
            query_embeddings=[query_embedding],
            n_results=min(n_candidates, self._chroma.count() or 1),
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"] or not results["documents"][0]:
            return []

        docs = results["documents"][0]
        metas = results["metadatas"][0]
        ids = results["ids"][0]

        # Rerank with NIM
        rankings = await self._nim.rerank(query, docs)

        # Compute weighted scores
        now = time.time()
        max_age = 30 * 24 * 3600  # 30 days for recency normalization
        scored = []
        for rank in rankings:
            idx = rank["index"]
            logit = rank["logit"]
            meta = metas[idx]
            importance = meta.get("importance", 5)
            created_at = meta.get("created_at", now)
            age = now - created_at
            recency = max(0, 1 - (age / max_age))  # 1.0 = just now, 0.0 = 30+ days old

            # Weighted score: rerank * 0.6 + importance * 0.3 + recency * 0.1
            score = (logit * 0.6) + ((importance / 10) * 0.3) + (recency * 0.1)

            scored.append({
                "id": ids[idx],
                "text": docs[idx],
                "type": meta.get("type", "knowledge"),
                "importance": importance,
                "score": round(score, 3),
            })

        # Sort by score desc, take top N
        scored.sort(key=lambda x: x["score"], reverse=True)
        top = scored[:n_results]

        # Update access stats in SQLite
        if top:
            for mem in top:
                await self._db.execute(
                    "UPDATE memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?",
                    (now, mem["id"]),
                )
            await self._db.commit()

        return top

    def format_for_prompt(self, memories: list[dict]) -> str:
        """Format retrieved memories as a system message block."""
        if not memories:
            return ""
        lines = ["You know this from past conversations:"]
        for mem in memories:
            lines.append(f"- [{mem['type']}] {mem['text']} (importance: {mem['importance']})")
        return (
            "═══════════════════════════════════════════════════════════════\n"
            "## RELEVANT MEMORY (from past conversations)\n"
            "═══════════════════════════════════════════════════════════════\n"
            + "\n".join(lines)
            + "\n═══════════════════════════════════════════════════════════════"
        )

    async def count(self) -> int:
        """Return total number of stored memories."""
        if not self._db:
            return 0
        async with self._db.execute("SELECT COUNT(*) FROM memories") as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0

    async def close(self):
        if self._db:
            await self._db.close()
            self._db = None
```

- [ ] **Step 2: Verify module imports cleanly**

Run: `cd /c/Users/mdakh/OneDrive/Documents/pollinations/apps/polly && python -c "from src.services.memory import MemoryStore; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/polly/src/services/memory.py
git commit -m "feat(polly): add dual SQLite+ChromaDB memory store with NIM retrieval"
```

---

## Chunk 2: Memory Extraction + Config

### Task 3: Extraction Prompt + Tool Definition (`src/constants.py`)

**Files:**
- Modify: `apps/polly/src/constants.py`

- [ ] **Step 1: Add the memory extraction prompt constant**

Add after the existing prompt constants in `constants.py`:

```python
MEMORY_EXTRACTION_PROMPT = """Analyze this conversation and extract valuable knowledge worth remembering long-term.

For each piece of knowledge, provide:
- text: A concise, self-contained statement (understandable without the conversation)
- type: One of: solution, pattern, decision, knowledge, preference
- importance: 1-10 (10 = critical, 1 = trivial)
- tags: Relevant topic tags
- entities: Specific names, URLs, tools mentioned

Types guide:
- solution: A problem and how it was resolved
- pattern: A recurring theme, common question, or user behavior
- decision: An architectural or policy choice the team made
- knowledge: A factual insight about the platform, tools, or community
- preference: A workflow or configuration preference expressed

Rules:
- Only extract knowledge valuable to FUTURE conversations (skip greetings, small talk)
- Each memory must be self-contained — readable without the original conversation
- Do NOT include private info, API keys, tokens, or personal details
- Importance guide: 8-10 = affects many users/critical info, 5-7 = useful reference, 3-4 = minor insight

Respond with JSON only:
{"memories": [{"text": "...", "type": "...", "importance": N, "tags": [...], "entities": [...]}]}

If nothing worth remembering, respond: {"memories": []}"""
```

- [ ] **Step 2: Add the `recall_memory` tool definition**

Add to the tool definitions list (alongside existing tools like `web_scrape`, `discord_search`):

```python
{
    "type": "function",
    "function": {
        "name": "recall_memory",
        "description": "Search your long-term memory for past conversations, solutions, patterns, and decisions. Use when the current question might benefit from knowledge you've accumulated over time.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for in memory",
                },
                "type_filter": {
                    "type": "string",
                    "enum": ["solution", "pattern", "decision", "knowledge", "preference"],
                    "description": "Optional: filter by memory type",
                },
            },
            "required": ["query"],
        },
    },
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/polly/src/constants.py
git commit -m "feat(polly): add memory extraction prompt and recall_memory tool definition"
```

---

### Task 4: Config Updates (`src/config.py` + `config.json`)

**Files:**
- Modify: `apps/polly/src/config.py`
- Modify: `apps/polly/config.json`

- [ ] **Step 1: Add memory config to `Config` class**

In `config.py`, add inside `__init__` after the FEATURES CONFIG section:

```python
        # =================================================================
        # MEMORY CONFIG
        # =================================================================
        memory_cfg = cfg.get("memory", {})
        self.memory_enabled = memory_cfg.get("enabled", True)
        self.memory_min_messages = memory_cfg.get("min_messages", 3)  # Min messages before extracting

        # Secret from .env
        self.nvidia_nim_api_key = os.getenv("NVIDIA_NIM_API_KEY", "")
```

Add to `validate()` method, after existing logging:

```python
        logger.info(f"Memory: {'enabled' if self.memory_enabled else 'disabled'}")
```

- [ ] **Step 2: Add memory section to `config.json`**

Add `"memory"` key to `config.json`:

```json
{
  "memory": {
    "enabled": true,
    "min_messages": 3
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/polly/src/config.py apps/polly/config.json
git commit -m "feat(polly): add memory configuration (NIM API key, feature flag)"
```

---

## Chunk 3: Integration into Bot

### Task 5: Memory Extraction on Thread End (`src/bot.py`)

**Files:**
- Modify: `apps/polly/src/bot.py`

- [ ] **Step 1: Add memory extraction function**

Add a new async function in `bot.py` (after the imports/globals section, near other helper functions):

```python
async def extract_and_store_memories(
    thread: discord.Thread,
    session: ConversationSession,
):
    """Extract memories from a finished conversation and store them. Fire-and-forget."""
    try:
        if not config.memory_enabled or not memory_store:
            return
        # Skip short conversations (not enough to learn from)
        if session.user_message_count() < config.memory_min_messages:
            logger.debug(f"Skipping memory extraction for thread {thread.id}: too few messages ({session.user_message_count()})")
            return

        # Fetch full thread history
        history = await fetch_thread_history(thread, limit=50)
        if not history:
            return

        # Format conversation as text for the LLM
        convo_text = "\n".join(
            f"{'[bot]' if m.get('role') == 'assistant' else m.get('content', '').split(']:')[0] + ']' if ']:' in m.get('content', '') else '[user]'}: "
            + (m.get("content", "").split("]: ", 1)[1] if "]: " in m.get("content", "") else m.get("content", ""))
            for m in history
            if m.get("role") != "system"
        )

        if not convo_text.strip():
            return

        from .constants import MEMORY_EXTRACTION_PROMPT

        # Use Polly's own LLM to extract memories
        response = await pollinations_client.generate_text(
            system_prompt=MEMORY_EXTRACTION_PROMPT,
            user_message=convo_text,
        )

        if not response:
            return

        # Parse JSON response
        from ._json import loads as _json_loads
        try:
            data = _json_loads(response)
        except ValueError:
            # Try to extract JSON from markdown code block
            import re
            json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)
            if json_match:
                data = _json_loads(json_match.group(1))
            else:
                logger.warning(f"Memory extraction returned non-JSON: {response[:200]}")
                return

        memories = data.get("memories", [])
        if not memories:
            logger.debug(f"No memories extracted from thread {thread.id}")
            return

        # Add source metadata
        participants = session.get_all_participants_names()
        for mem in memories:
            mem["source_thread_id"] = thread.id
            mem["source_channel_id"] = thread.parent_id if thread.parent_id else None
            mem["participants"] = participants

        stored = await memory_store.store(memories)
        logger.info(f"Extracted and stored {stored} memories from thread {thread.id}")

    except Exception as e:
        logger.warning(f"Memory extraction failed for thread {thread.id}: {e}")
```

- [ ] **Step 2: Hook extraction into session cleanup and archive**

In the `SessionManager.cleanup_expired()` method (in `manager.py`), we need to fire extraction before deleting expired sessions. However, since `SessionManager` doesn't have access to Discord threads, the cleaner approach is to hook into `bot.py`.

Modify the `cleanup_sessions` task loop in the `PollyBot` class:

```python
    @tasks.loop(minutes=1)
    async def cleanup_sessions(self):
        """Periodically clean up expired sessions and extract memories."""
        # Find expired sessions BEFORE cleanup
        if config.memory_enabled and memory_store:
            expired_sessions = [
                (thread_id, session)
                for thread_id, session in session_manager._sessions.items()
                if session.is_expired(SESSION_TIMEOUT)
            ]
            for thread_id, session in expired_sessions:
                # Try to get the thread for history fetching
                try:
                    thread = self.get_channel(thread_id)
                    if thread and isinstance(thread, discord.Thread):
                        asyncio.create_task(extract_and_store_memories(thread, session))
                except Exception as e:
                    logger.debug(f"Could not extract memories for expired thread {thread_id}: {e}")

        cleaned = session_manager.cleanup_expired()
        if cleaned > 0:
            logger.debug(f"Cleaned {cleaned} expired sessions")
```

Also hook into `archive_thread`:

```python
async def archive_thread(channel: discord.Thread | discord.TextChannel):
    """Archive thread if applicable, extracting memories first."""
    if isinstance(channel, discord.Thread):
        # Extract memories before archiving
        if config.memory_enabled and memory_store:
            session = session_manager.get_session(channel.id)
            if session:
                asyncio.create_task(extract_and_store_memories(channel, session))
        try:
            await channel.edit(archived=True)
        except discord.HTTPException as e:
            logger.warning(f"Failed to archive thread {channel.id}: {e}")
```

- [ ] **Step 3: Commit**

```bash
git add apps/polly/src/bot.py
git commit -m "feat(polly): extract memories on thread archive and session expiry"
```

---

### Task 6: Memory Retrieval in Parallel + Injection (`src/bot.py` + `src/services/pollinations.py`)

**Files:**
- Modify: `apps/polly/src/bot.py`
- Modify: `apps/polly/src/services/pollinations.py`

- [ ] **Step 1: Add memory retrieval helper**

Add to `bot.py`:

```python
async def retrieve_memory_context(message_text: str) -> str:
    """Retrieve relevant memories for a message. Returns formatted prompt block or empty string."""
    if not config.memory_enabled or not memory_store:
        return ""
    # Skip trivial messages
    if len(message_text.split()) < 5:
        return ""
    try:
        memories = await memory_store.retrieve(message_text)
        return memory_store.format_for_prompt(memories)
    except Exception as e:
        logger.warning(f"Memory retrieval failed: {e}")
        return ""
```

- [ ] **Step 2: Modify `handle_thread_message` to fetch memories in parallel**

Change `handle_thread_message` in `bot.py`:

```python
async def handle_thread_message(message: discord.Message, session: ConversationSession):
    """Handle a message in an existing thread."""
    if not isinstance(message.channel, discord.Thread):
        logger.warning(f"handle_thread_message called with non-thread channel: {type(message.channel)}")
        return

    channel = message.channel
    image_urls, video_urls, file_urls = extract_media_urls(message)

    session_manager.add_to_session(
        session=session,
        role="user",
        content=message.content,
        author=str(message.author),
        author_id=message.author.id,
        image_urls=image_urls + video_urls,
    )

    async with channel.typing():
        # Fetch thread history and retrieve memories IN PARALLEL
        thread_history_task = fetch_thread_history(channel)
        memory_task = retrieve_memory_context(message.content)
        thread_history, memory_context = await asyncio.gather(
            thread_history_task, memory_task
        )

        await process_message(
            channel=channel,
            user=message.author,
            text=message.content,
            image_urls=image_urls,
            session=session,
            thread_history=thread_history,
            reply_to=message,
            source_message=message,
            video_urls=video_urls,
            file_urls=file_urls,
            memory_context=memory_context,
        )
```

- [ ] **Step 3: Add `memory_context` param to `process_message` and pass through**

Update `process_message` signature and the `process_with_tools` call:

```python
async def process_message(
    channel: discord.Thread | discord.TextChannel,
    user: discord.User | discord.Member,
    text: str,
    image_urls: list[str],
    session: ConversationSession,
    thread_history: list[dict] | None = None,
    reply_to: discord.Message | None = None,
    source_message: discord.Message | None = None,
    video_urls: list[str] | None = None,
    file_urls: list[str] | None = None,
    memory_context: str = "",  # NEW
):
```

And in the `process_with_tools` call inside `process_message`, add:

```python
        result = await pollinations_client.process_with_tools(
            user_message=text,
            discord_username=str(user),
            thread_history=thread_history,
            image_urls=image_urls,
            video_urls=video_urls or [],
            file_urls=file_urls or [],
            is_admin=user_is_admin,
            tool_context=tool_context,
            memory_context=memory_context,  # NEW
        )
```

- [ ] **Step 4: Inject memory context in `process_with_tools`**

In `pollinations.py`, update `process_with_tools` signature:

```python
    async def process_with_tools(
        self,
        user_message: str,
        discord_username: str,
        thread_history: list[dict] | None = None,
        image_urls: list[str] | None = None,
        video_urls: list[str] | None = None,
        file_urls: list[str] | None = None,
        is_admin: bool = False,
        tool_context: dict | None = None,
        mode: str = "discord",
        api_params: dict | None = None,
        memory_context: str = "",  # NEW
    ) -> dict:
```

Then inject memory context into messages. Add after `messages = [{"role": "system", "content": system_content}]` and BEFORE the thread_history injection:

```python
        # Inject persistent memory context (if any)
        if memory_context:
            messages.append({"role": "system", "content": memory_context})
```

- [ ] **Step 5: Commit**

```bash
git add apps/polly/src/bot.py apps/polly/src/services/pollinations.py
git commit -m "feat(polly): parallel memory retrieval and prompt injection"
```

---

### Task 7: Initialize Memory System + Register Recall Tool (`src/bot.py`)

**Files:**
- Modify: `apps/polly/src/bot.py`

- [ ] **Step 1: Add memory system initialization in `setup_hook`**

Add a global for the memory store near the top of `bot.py` (with other globals):

```python
memory_store: "MemoryStore | None" = None
```

In the `setup_hook` method of `PollyBot`, add after the existing service initializations (after webhook server setup):

```python
        # Initialize persistent memory system
        global memory_store
        if config.memory_enabled and config.nvidia_nim_api_key:
            from .services.nvidia_nim import NIMClient
            from .services.memory import MemoryStore
            import chromadb

            nim_client = NIMClient(api_key=config.nvidia_nim_api_key)

            # Use same ChromaDB instance as code embeddings, different collection
            chroma_path = Path(__file__).parent.parent / "data" / "embeddings"
            chroma_path.mkdir(parents=True, exist_ok=True)
            chroma_client = chromadb.PersistentClient(path=str(chroma_path))
            chroma_collection = chroma_client.get_or_create_collection(
                name="polly_memories",
                metadata={"hnsw:space": "cosine"},
            )

            memory_store = MemoryStore(nim_client=nim_client, chroma_collection=chroma_collection)
            await memory_store.initialize()
            mem_count = await memory_store.count()
            logger.info(f"Persistent memory system initialized ({mem_count} memories)")

            # Register recall_memory tool handler
            async def recall_memory_handler(args: dict, context: dict) -> dict:
                query = args.get("query", "")
                type_filter = args.get("type_filter")
                if not query:
                    return {"error": "query is required"}
                try:
                    memories = await memory_store.retrieve(query, n_candidates=20, n_results=10)
                    if type_filter:
                        memories = [m for m in memories if m["type"] == type_filter]
                    if not memories:
                        return {"result": "No relevant memories found."}
                    lines = []
                    for m in memories:
                        lines.append(f"[{m['type']}] {m['text']} (importance: {m['importance']}, score: {m['score']})")
                    return {"result": "\n".join(lines)}
                except Exception as e:
                    logger.warning(f"recall_memory failed: {e}")
                    return {"error": str(e)}

            pollinations_client.register_tool_handler("recall_memory", recall_memory_handler)
            logger.info("Registered recall_memory tool handler")
        elif config.memory_enabled:
            logger.warning("Memory enabled but NVIDIA_NIM_API_KEY not set — memory system disabled")
```

- [ ] **Step 2: Add memory cleanup to `close` method**

In the `PollyBot.close()` method, add before `await super().close()`:

```python
        # Clean up memory system
        if memory_store:
            await memory_store.close()
```

- [ ] **Step 3: Commit**

```bash
git add apps/polly/src/bot.py
git commit -m "feat(polly): initialize memory system on startup, register recall_memory tool"
```

---

## Chunk 4: Final Integration + Deploy

### Task 8: Add `NVIDIA_NIM_API_KEY` to VPS Environment

**Files:**
- Modify: VPS `.env` file at `/root/polly/.env`

- [ ] **Step 1: SSH to VPS and add the env var**

```bash
ssh bot "echo 'NVIDIA_NIM_API_KEY=nvapi-...' >> /root/polly/.env"
```

(Get the actual key from the user)

- [ ] **Step 2: Verify**

```bash
ssh bot "grep NVIDIA_NIM_API_KEY /root/polly/.env"
```

---

### Task 9: Test End-to-End Locally (Smoke Test)

- [ ] **Step 1: Verify all imports resolve**

```bash
cd /c/Users/mdakh/OneDrive/Documents/pollinations/apps/polly
python -c "
from src.services.nvidia_nim import NIMClient
from src.services.memory import MemoryStore
from src.constants import MEMORY_EXTRACTION_PROMPT
print('All imports OK')
"
```

- [ ] **Step 2: Run ruff on all changed files**

```bash
cd /c/Users/mdakh/OneDrive/Documents/pollinations/apps/polly
python3 -m ruff check src/services/nvidia_nim.py src/services/memory.py src/bot.py src/config.py src/constants.py --fix
python3 -m ruff format src/services/nvidia_nim.py src/services/memory.py src/bot.py src/config.py src/constants.py
```

- [ ] **Step 3: Final commit with any linting fixes**

```bash
git add -A apps/polly/
git commit -m "style(polly): ruff format on memory system files"
```

---

### Task 10: Create PR + Deploy

- [ ] **Step 1: Create branch and push**

```bash
git checkout -b feat/polly-persistent-memory
git push -u origin feat/polly-persistent-memory
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "feat: polly persistent memory — learns from every conversation" --body "$(cat <<'EOF'
- Adds persistent memory system that extracts knowledge from conversations
- Uses NVIDIA NIM embeddings (2048-dim) + ChromaDB for semantic search
- NIM reranker for adaptive retrieval (top 20 → rerank → weighted top 5)
- Memory retrieval runs in parallel with Discord history fetch (zero added latency)
- Extraction runs async after thread archive/session expiry (fire-and-forget)
- New `recall_memory` tool for explicit memory searches
- Dual storage: SQLite (structured) + ChromaDB (semantic)
EOF
)"
```

- [ ] **Step 3: Merge and verify deployment**

After review, merge PR and verify on VPS:
```bash
ssh bot "cat /root/polly/src/services/memory.py | head -5"
ssh bot "systemctl status polly"
```
