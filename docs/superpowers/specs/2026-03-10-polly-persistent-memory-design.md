# Polly Persistent Memory — Design Spec

## Goal

Give Polly global knowledge accumulation from all Discord conversations. Polly learns solutions, patterns, decisions, and community knowledge over time — becoming smarter with every interaction.

## Architecture: 3-Phase Memory Pipeline

```
INGEST (async, post-conversation)   STORE (dual)              RETRIEVE (parallel with history fetch)
┌─────────────────────────┐        ┌──────────────┐          ┌─────────────────────────┐
│ Thread archives/expires │        │ SQLite       │          │ Message arrives         │
│ → LLM extracts:        │        │ (structured) │          │   ├─ fetch history       │
│   • solutions           │───────▶│ • id, text   │          │   └─ retrieve memories   │
│   • patterns            │        │ • importance │          │       ├─ NIM embed query  │
│   • decisions           │        │ • type, tags │          │       ├─ ChromaDB top 20  │
│   • knowledge           │        │ • source     │◀────────▶│       ├─ NIM rerank       │
│   • importance 1-10     │        ├──────────────┤          │       └─ weighted top 5   │
│                         │───────▶│ ChromaDB     │          │           ↓               │
│                         │        │ (NIM embeds) │          │   inject into system msg  │
│                         │        │ • 2048-dim   │          │           ↓               │
└─────────────────────────┘        └──────────────┘          │   LLM call               │
                                                             └─────────────────────────┘
```

## Phase 1: Ingest (Post-Conversation Extraction)

**Trigger:** thread archive OR session expiry (5-min timeout)

**Process:**
1. Collect full conversation from thread history
2. Send to LLM with extraction prompt
3. LLM returns structured JSON:
```json
{
  "memories": [
    {
      "text": "To fix CORS issues with gen.pollinations.ai, users need to add the origin header",
      "type": "solution",
      "importance": 7,
      "tags": ["api", "cors", "troubleshooting"],
      "entities": ["gen.pollinations.ai", "CORS"]
    }
  ]
}
```
4. Store each memory in SQLite + embed with NIM + store in ChromaDB
5. Filter out importance < 3 (small talk, greetings)

**Memory types:** `solution`, `pattern`, `decision`, `knowledge`, `preference`

**Runs async** — fire-and-forget after conversation ends. Zero impact on response time.

## Phase 2: Store (Dual SQLite + ChromaDB)

### SQLite Schema (`data/memories.db`)

```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY,           -- UUID
    text TEXT NOT NULL,            -- The extracted memory text
    type TEXT NOT NULL,            -- solution|pattern|decision|knowledge|preference
    importance INTEGER NOT NULL,   -- 1-10 LLM-assigned score
    tags TEXT,                     -- JSON array of tags
    entities TEXT,                 -- JSON array of entities mentioned
    source_thread_id INTEGER,      -- Discord thread ID
    source_channel_id INTEGER,     -- Discord channel ID
    participants TEXT,             -- JSON array of usernames involved
    created_at REAL NOT NULL,      -- Unix timestamp
    last_accessed REAL,            -- Last time retrieved for a response
    access_count INTEGER DEFAULT 0 -- How often this memory was used
);

CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_memories_created ON memories(created_at);
```

### ChromaDB Collection (`polly_memories`)

- **Embedding model:** `nvidia/llama-nemotron-embed-vl-1b-v2` (2048-dim)
- **Endpoint:** `POST https://integrate.api.nvidia.com/v1/embeddings`
- **input_type:** `"passage"` for indexing, `"query"` for searching
- **truncate:** `"END"` to handle long texts gracefully
- **Document ID:** matches SQLite `id`
- **Metadata:** type, importance, created_at (for filtering)

## Phase 3: Retrieve (Parallel with History Fetch)

**Trigger:** every incoming message (runs in parallel with Discord history fetch via `asyncio.gather`)

**Pipeline:**
1. Embed user message with NIM (`input_type: "query"`)
2. Query ChromaDB for top 20 candidates by cosine similarity
3. Rerank with NIM reranker (`nvidia/llama-nemotron-rerank-1b-v2`)
4. Compute final score: `rerank_logit * 0.6 + importance_normalized * 0.3 + recency_normalized * 0.1`
5. Take top 5
6. Inject as system message block before thread history

**Skip retrieval if:**
- Message is < 5 words (greetings, "ok", "thanks")
- Message is a pure image/file upload with no text

**NIM Reranker:**
- **Endpoint:** `POST https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking`
- Returns all passages scored, sort by `logit` desc, take top N client-side

**Injected format:**
```
═══ RELEVANT MEMORY ═══
You know this from past conversations:
• [solution] To fix CORS issues with gen.pollinations.ai, users need to add the origin header (importance: 7)
• [pattern] Users frequently confuse text.pollinations.ai with gen.pollinations.ai (importance: 8)
• [decision] Team decided to deprecate /p/ endpoints in favor of /v1/ (importance: 9)
═══ END MEMORY ═══
```

## Explicit Recall Tool

In addition to auto-injection, Polly gets a `recall_memory` tool for deeper searches.

**Tool definition:**
```json
{
  "name": "recall_memory",
  "description": "Search your long-term memory for past conversations, solutions, patterns, and decisions. Use when the current question might benefit from knowledge you've accumulated over time.",
  "parameters": {
    "query": {"type": "string", "description": "What to search for in memory"},
    "type_filter": {"type": "string", "enum": ["solution", "pattern", "decision", "knowledge", "preference"], "description": "Optional: filter by memory type"}
  }
}
```

**Behavior:** Same pipeline as auto-retrieval but with LLM-refined query, returns top 10 instead of 5.

## New Files

| File | Purpose |
|------|---------|
| `src/services/memory.py` | MemoryStore class — ingest, store, retrieve, consolidate |
| `src/services/nvidia_nim.py` | NIM client — embed + rerank API calls |

## Integration Points

| Location | Change |
|----------|--------|
| `bot.py` → `handle_thread_message()` | Fire memory retrieval in parallel with `fetch_thread_history()` |
| `bot.py` → thread archive / session expire | Trigger async memory extraction |
| `pollinations.py` → `process_with_tools()` | Accept + inject memory context into messages |
| `constants.py` | Add `recall_memory` tool definition + extraction prompt |
| `config.py` / `config.json` | Add NIM API key config, memory settings |

## What Polly Does NOT Remember

- Exact message text (only extracted learnings)
- Private/sensitive content (extraction prompt filters this)
- Low-importance small talk (importance < 3 discarded)
- User-specific data (this is global knowledge, not per-user profiles)

## Performance

- **Retrieval adds ~200-300ms** but runs in parallel with history fetch (effectively zero added latency)
- **Extraction is async** after conversation ends (zero impact on response time)
- **Optimizations:** skip retrieval for trivial messages, cache recent embeddings

## Dependencies

- `chromadb` — already installed (used for code/doc embeddings)
- `aiosqlite` — already installed (used for subscriptions)
- `httpx` or `aiohttp` — for NIM API calls (aiohttp already installed)
- NVIDIA NIM API key (`NVIDIA_NIM_API_KEY` env var)

## Future Extensions (not in scope now)

- Per-user memory layer
- Memory decay (reduce importance over time if not accessed)
- Periodic consolidation (merge similar memories)
- Memory visualization dashboard
