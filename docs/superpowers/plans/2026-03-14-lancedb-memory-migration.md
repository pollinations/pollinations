# LanceDB Memory Migration + Smarter Consolidation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite + ChromaDB with LanceDB (single store) and improve consolidation to compress memories instead of accumulating infinitely.

**Architecture:** Single LanceDB table stores all memory data (text, metadata, vectors). NIM embeddings computed externally, passed as vectors. Consolidation merges similar memories into pattern summaries and deletes originals to bound growth.

**Tech Stack:** LanceDB (Python async API), NVIDIA NIM (embeddings + reranking), step-3.5-flash (consolidation LLM)

**Target:** `/root/polly` on VPS `157.230.129.96` (SSH alias `bot`)

---

## File Map

- **Modify:** `/root/polly/src/extensions/memory.py` — Full rewrite: remove SQLite/ChromaDB, use LanceDB
- **Modify:** `/root/polly/src/extensions/__init__.py` — Update setup_hook (remove ChromaDB init, add LanceDB), update consolidation logic
- **Install:** `lancedb` package in `/root/polly/venv`
- **Remove dep:** `chromadb` (can uninstall after migration confirmed working)

---

## Task 1: Install LanceDB on VPS

- [ ] **Step 1: Install lancedb**
```bash
ssh bot "/root/polly/venv/bin/python3 -m pip install lancedb"
```

- [ ] **Step 2: Verify import works**
```bash
ssh bot "/root/polly/venv/bin/python3 -c 'import lancedb; print(lancedb.__version__)'"
```

---

## Task 2: Rewrite memory.py with LanceDB

Replace the entire `MemoryStore` class. Key changes:
- No more `aiosqlite` or ChromaDB collection
- Single LanceDB async table with vectors stored inline
- `store()` embeds via NIM then writes to LanceDB
- `retrieve()` does vector search on LanceDB, reranks via NIM
- `get_unconsolidated()`, `mark_consolidated()`, `remove_memories()` use LanceDB filter/delete
- `count()` uses `count_rows()`
- Drop `decay_unused()` — consolidation handles growth now

Constructor: `MemoryStore(nim_client, db_path)` — no more chroma_collection param.

**LanceDB schema (dict-based, no pyarrow needed):**
```python
{
    "id": "string",
    "text": "string",
    "type": "string",
    "importance": 5,
    "tags": "[]",
    "participants": "[]",
    "source_thread_id": 0,
    "source_channel_id": 0,
    "vector": [0.0] * EMBED_DIM,  # NIM embedding
    "created_at": 0.0,
    "last_accessed": 0.0,
    "access_count": 0,
    "consolidated": False,
    "consolidation_type": "raw",
}
```

- [ ] **Step 1: Write new memory.py**

Full rewrite of `/root/polly/src/extensions/memory.py`. Key methods:
- `initialize()` — `connect_async` + `create_table` (or `open_table` if exists)
- `store(memories)` — embed via NIM, add to table
- `retrieve(query)` — vector_search + NIM rerank + scoring
- `get_unconsolidated(limit)` — filter `consolidated = false`
- `mark_consolidated(ids)` — update rows
- `remove_memories(ids)` — delete rows by ID
- `count()` — count_rows()
- `format_for_prompt()` — same as current
- `close()` — no-op (LanceDB handles cleanup)

- [ ] **Step 2: Deploy to VPS**
```bash
scp memory.py bot:/root/polly/src/extensions/memory.py
```

---

## Task 3: Update extensions/__init__.py

- [ ] **Step 1: Update `_patched_setup_hook`**

Remove:
- `import chromadb`
- ChromaDB client/collection creation
- `chroma_collection` parameter

Add:
- `import lancedb`
- `db_path = Path(__file__).parent.parent.parent / "data" / "lance_memories"`
- Pass `db_path` to `MemoryStore(nim_client=_nim_client, db_path=db_path)`

- [ ] **Step 2: Improve consolidation in `_run_consolidation()`**

Current flow: LLM decides merge/remove → we delete + create merged.
New flow:
1. Get unconsolidated memories (limit=50, need >= 5)
2. Send to LLM for analysis
3. For merges: create new consolidated memory, delete originals
4. For insights: store as new pattern memories
5. Mark remaining as consolidated
6. **No decay_unused() call** — consolidation IS the growth control

The consolidation prompt stays mostly the same but emphasize compression.

- [ ] **Step 3: Deploy to VPS**
```bash
scp __init__.py bot:/root/polly/src/extensions/__init__.py
```

---

## Task 4: Test and restart

- [ ] **Step 1: Restart Polly**
```bash
ssh bot "sudo systemctl restart polly"
```

- [ ] **Step 2: Verify startup**
```bash
ssh bot "journalctl -u polly --since '1 min ago' --no-pager | grep -i 'memory\|lance\|error'"
```
Expected: "Memory store initialized", "Memory system initialized (0 memories)", no errors.

- [ ] **Step 3: Verify table created**
```bash
ssh bot "/root/polly/venv/bin/python3 -c \"
import lancedb, asyncio
async def check():
    db = await lancedb.connect_async('/root/polly/data/lance_memories')
    tables = await db.table_names()
    print(f'Tables: {tables}')
asyncio.run(check())
\""
```

- [ ] **Step 4: Cleanup old data (after confirming LanceDB works)**
```bash
ssh bot "rm -rf /root/polly/data/memories.db /root/polly/data/memories.db.bak-old-format /root/polly/data/chroma_memories /root/polly/data/embeddings"
```
