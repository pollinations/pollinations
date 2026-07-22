#!/usr/bin/env python3
"""Embed pollinations/pollinations code into Cloudflare Vectorize using Pollinations qwen3-embedding-8b.

Two modes:
  --mode full        Embed every matching file in the repo (first-time backfill / manual re-embed).
  --mode incremental  Embed only files changed between two git refs; delete vectors for removed/renamed files.

Chunking mirrors apps/polly/src/services/embeddings.py's Python fallback path so search results
stay consistent between the one-time backfill and future incremental updates.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests
import tiktoken
import xxhash

CF_ACCOUNT_ID = os.environ["CLOUDFLARE_ACCOUNT_ID"].strip()
CF_API_TOKEN = os.environ["CLOUDFLARE_API_TOKEN"].strip()
POLLINATIONS_TOKEN = os.environ["POLLI_VECTOR_DB"].strip()
INDEX_NAME = os.environ.get("VECTORIZE_INDEX", "polli-code-embeddings")
EMBED_MODEL = "qwen3-embedding-8b"
EMBED_DIMENSIONS = 1536

CF_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/vectorize/v2/indexes/{INDEX_NAME}"
CF_HEADERS = {"Authorization": f"Bearer {CF_API_TOKEN}"}

POLLINATIONS_EMBED_URL = "https://gen.pollinations.ai/v1/embeddings"

_enc = tiktoken.get_encoding("cl100k_base")
# Vectorize caps total metadata at 10KiB per vector, and the chunk's own text now lives
# in metadata (see build_rows_for_file) so results are self-contained without a follow-up
# fetch. Chunk size is kept well under that budget — conservatively assuming ~3 chars/token
# for dense code, 2000 tokens is ~6-8KB, leaving headroom for file_path/language/app/git_sha
# and JSON structural overhead.
MAX_TOKENS_PER_INPUT = 2000
MAX_CHUNK_LINES = 50
VECTORIZE_METADATA_BUDGET_BYTES = 9000  # stay under the 10KiB cap with margin

# Everything git-tracks gets embedded UNLESS it matches one of these — binary/generated/lockfile
# noise with zero search value. This is deliberately a blocklist, not an allowlist: the repo is a
# full-text knowledge base (code, docs, configs, SQL, Dockerfiles, extensionless files like
# LICENSE/Dockerfile/_redirects), not just "source code" in a narrow sense.
BINARY_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".bmp",
    ".tiff",
    ".svg",
    ".ttf",
    ".otf",
    ".woff",
    ".woff2",
    ".eot",
    ".mp3",
    ".mp4",
    ".mov",
    ".avi",
    ".webm",
    ".wav",
    ".ogg",
    ".zip",
    ".tar",
    ".gz",
    ".7z",
    ".rar",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".pyc",
    ".pyo",
    ".so",
    ".dll",
    ".dylib",
    ".exe",
    ".bin",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".lock",
}

# Deliberately does NOT include "bin" or "obj" — real gitignored build output never reaches
# git ls-files anyway, but "bin/" also legitimately holds tracked source (e.g. npm CLI entrypoints
# like packages/polli-cli/bin/polli.js) that a blanket skip would wrongly drop.
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
    ".idea",
    ".vscode",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
}

SKIP_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "pnpm-lock.yml",
    "Gemfile.lock",
    "Pipfile.lock",
    "poetry.lock",
    "Cargo.lock",
    "composer.lock",
    "go.sum",
    "flake.lock",
    "packages.lock.json",
}

MAX_FILE_SIZE = 200 * 1024


def is_probably_binary(sample: bytes) -> bool:
    """Backstop for binary files that slip through the extension blocklist."""
    if b"\x00" in sample:
        return True
    text_chars = bytes(range(32, 127)) + b"\n\r\t\f\b"
    nontext = sum(b not in text_chars for b in sample)
    return bool(sample) and (nontext / len(sample)) > 0.30


def content_hash(data: str) -> str:
    return xxhash.xxh3_64_hexdigest(data.encode())


def is_definition_start(line: str) -> bool:
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


def chunk_code(content: str, max_lines: int = MAX_CHUNK_LINES) -> list[dict]:
    lines = content.split("\n")

    if len(lines) <= max_lines:
        chunks = [{"content": content, "start_line": 1, "end_line": len(lines)}]
    else:
        chunks = []
        current_chunk: list[str] = []
        chunk_start = 1
        for i, line in enumerate(lines, 1):
            current_chunk.append(line)
            is_break = len(current_chunk) >= max_lines or (len(current_chunk) >= 20 and is_definition_start(line))
            if is_break and current_chunk:
                chunks.append(
                    {
                        "content": "\n".join(current_chunk),
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
                    "start_line": chunk_start,
                    "end_line": len(lines),
                }
            )

    final_chunks = []
    for chunk in chunks:
        tokens = _enc.encode(chunk["content"])
        if len(tokens) <= MAX_TOKENS_PER_INPUT:
            final_chunks.append(chunk)
        else:
            for part_idx, pos in enumerate(range(0, len(tokens), MAX_TOKENS_PER_INPUT)):
                sub_tokens = tokens[pos : pos + MAX_TOKENS_PER_INPUT]
                final_chunks.append(
                    {
                        "content": _enc.decode(sub_tokens),
                        "start_line": chunk["start_line"],
                        "end_line": chunk["end_line"],
                        "part": part_idx,
                    }
                )
    return final_chunks


def chunk_id_for(file_path: str, chunk: dict) -> str:
    """Vectorize caps vector IDs at 64 bytes — this repo has paths well past that on their
    own (e.g. enter.pollinations.ai/frontend/src/components/...), so the raw
    "path:start-end" id used during local dev doesn't survive contact with real paths.
    Hash the full identifier instead: deterministic (same file+lines always hashes the
    same, so incremental delete/re-insert by id still works), fixed-length, and the
    human-readable path/lines are preserved in metadata for anyone reading query results.
    """
    part = chunk.get("part")
    suffix = f"p{part}" if part is not None else ""
    raw = f"{file_path}:{chunk['start_line']}-{chunk['end_line']}{suffix}"
    return xxhash.xxh3_64_hexdigest(raw.encode())


def is_embeddable_path(rel_path: str) -> bool:
    """Blocklist check shared by full and incremental modes."""
    parts = Path(rel_path).parts
    if any(part in SKIP_DIRS for part in parts):
        return False
    name = Path(rel_path).name
    if name in SKIP_FILES:
        return False
    suffix = Path(rel_path).suffix.lower()
    if suffix in BINARY_EXTENSIONS:
        return False
    return True


def git_tracked_files(repo_root: Path) -> list[str]:
    """Every file git tracks — the source of truth for 'the whole repo', not a hand-maintained extension list."""
    result = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.strip().split("\n") if line]


def collect_code_files(repo_root: Path) -> list[Path]:
    files = []
    for rel_path in git_tracked_files(repo_root):
        if not is_embeddable_path(rel_path):
            continue
        file_path = repo_root / rel_path
        try:
            if file_path.stat().st_size > MAX_FILE_SIZE:
                continue
        except OSError:
            continue
        files.append(file_path)
    return files


# Pollinations' /v1/embeddings rejects requests with more than this many input items
# ("Too big: expected array to have <=32 items") — a single large file can produce more
# chunks than that, so embed_batch must sub-batch instead of sending everything at once.
MAX_EMBED_INPUTS_PER_REQUEST = 32


def _parse_retry_after(header_value: str | None, fallback: float) -> float:
    """Retry-After is either a delay in seconds or an HTTP-date (RFC 9110) — handle both,
    since float() on a date string raises ValueError and would crash the retry loop
    instead of falling back to a normal backoff."""
    if not header_value:
        return fallback
    try:
        return float(header_value)
    except ValueError:
        pass
    try:
        from email.utils import parsedate_to_datetime

        target = parsedate_to_datetime(header_value)
        delta = (target - datetime.now(timezone.utc)).total_seconds()
        return max(delta, 0.0)
    except Exception:
        return fallback


def _embed_single_request(texts: list[str], retries: int = 4) -> list[list[float]]:
    payload = {
        "model": EMBED_MODEL,
        "input": texts,
        "dimensions": EMBED_DIMENSIONS,
    }
    headers = {"Authorization": f"Bearer {POLLINATIONS_TOKEN}", "Content-Type": "application/json"}
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.post(POLLINATIONS_EMBED_URL, json=payload, headers=headers, timeout=90)
            if resp.status_code == 429:
                # Rate limited — back off longer than a generic error, and respect
                # Retry-After if the server sends one instead of guessing.
                wait = _parse_retry_after(resp.headers.get("Retry-After"), fallback=5 * (attempt + 1))
                print(f"  rate limited (429), waiting {wait}s (attempt {attempt + 1}/{retries})", file=sys.stderr)
                time.sleep(wait)
                last_err = RuntimeError(f"Pollinations embed HTTP 429: {resp.text[:300]}")
                continue
            if resp.status_code != 200:
                raise RuntimeError(f"Pollinations embed HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            items = data["data"]
            if len(items) != len(texts):
                # A short/malformed response would otherwise be silently accepted here,
                # then zip() in the caller truncates and misaligns embeddings to the
                # wrong chunk — same failure mode as the local blank-chunk bug, just
                # coming from the API side instead of local filtering.
                raise RuntimeError(f"Pollinations embed returned {len(items)} embeddings for {len(texts)} inputs")
            sorted_data = sorted(items, key=lambda x: x["index"])
            indices = [item["index"] for item in sorted_data]
            if indices != list(range(len(texts))):
                raise RuntimeError(f"Pollinations embed returned non-contiguous indices: {indices}")
            return [item["embedding"] for item in sorted_data]
        except requests.exceptions.RequestException as e:
            last_err = e
            wait = 2**attempt
            print(f"  embed batch failed (attempt {attempt + 1}/{retries}): {e} — retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
        except RuntimeError as e:
            last_err = e
            wait = 2**attempt
            print(f"  embed batch failed (attempt {attempt + 1}/{retries}): {e} — retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Embedding failed after {retries} attempts: {last_err}")


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed texts via Pollinations qwen3-embedding-8b at 1536-dim (MRL truncation),
    sub-batching to stay under the API's per-request input limit."""
    embeddings: list[list[float]] = []
    for i in range(0, len(texts), MAX_EMBED_INPUTS_PER_REQUEST):
        chunk = texts[i : i + MAX_EMBED_INPUTS_PER_REQUEST]
        embeddings.extend(_embed_single_request(chunk))
    return embeddings


def vectorize_upsert(rows: list[dict]) -> None:
    """Upsert vectors via NDJSON multipart upload, batched at 1000 vectors per request."""
    BATCH = 1000
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        ndjson = "\n".join(json.dumps(r) for r in batch)
        resp = requests.post(
            f"{CF_BASE}/upsert",
            headers=CF_HEADERS,
            files={"vectors": ("vectors.ndjson", ndjson, "application/x-ndjson")},
            timeout=120,
        )
        if resp.status_code != 200 or not resp.json().get("success"):
            raise RuntimeError(f"Vectorize upsert failed: {resp.status_code} {resp.text[:500]}")
        print(f"  upserted {len(batch)} vectors ({i + len(batch)}/{len(rows)})")


def vectorize_delete_by_ids(ids: list[str]) -> None:
    if not ids:
        return
    BATCH = 1000
    for i in range(0, len(ids), BATCH):
        batch = ids[i : i + BATCH]
        resp = requests.post(
            f"{CF_BASE}/delete_by_ids",
            headers={**CF_HEADERS, "Content-Type": "application/json"},
            json={"ids": batch},
            timeout=60,
        )
        if resp.status_code != 200 or not resp.json().get("success"):
            raise RuntimeError(f"Vectorize delete failed: {resp.status_code} {resp.text[:500]}")
        print(f"  deleted {len(batch)} vectors")


def vectorize_find_ids_for_file(file_path: str) -> list[str]:
    """Look up existing vector IDs for a file via metadata filter (dummy vector — filter does the work)."""
    dummy_vector = [0.0] * EMBED_DIMENSIONS
    resp = requests.post(
        f"{CF_BASE}/query",
        headers={**CF_HEADERS, "Content-Type": "application/json"},
        json={
            "vector": dummy_vector,
            "filter": {"file_path": file_path},
            "topK": 100,
            "returnValues": False,
            "returnMetadata": "none",
        },
        timeout=60,
    )
    if resp.status_code != 200 or not resp.json().get("success"):
        raise RuntimeError(f"Vectorize query failed for {file_path}: {resp.status_code} {resp.text[:500]}")
    matches = resp.json()["result"]["matches"]
    if len(matches) >= 100:
        print(
            f"  WARNING: {file_path} hit topK=100 cap on old-chunk lookup — some stale vectors may survive",
            file=sys.stderr,
        )
    return [m["id"] for m in matches]


# Extension -> language label for metadata. Not exhaustive — anything unlisted falls back
# to the bare extension, which is still a usable filter value.
LANGUAGE_BY_EXTENSION = {
    ".py": "python",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".vue": "vue",
    ".svelte": "svelte",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".mdx": "markdown",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".tf": "terraform",
    ".pipe": "tinybird-pipe",
    ".datasource": "tinybird-datasource",
}


def _language_for(rel_path: str) -> str:
    suffix = Path(rel_path).suffix.lower()
    if suffix:
        return LANGUAGE_BY_EXTENSION.get(suffix, suffix.lstrip("."))
    name = Path(rel_path).name.lower()
    return "dockerfile" if name == "dockerfile" else "text"


def _app_for(rel_path: str) -> str:
    """Top-level path segment — the monorepo's app/service boundary, e.g.
    "enter.pollinations.ai" or "apps/polly". Lets search be scoped to one part of the repo."""
    parts = Path(rel_path).parts
    if len(parts) >= 2 and parts[0] == "apps":
        return f"apps/{parts[1]}"
    return parts[0] if parts else rel_path


def _metadata_size(metadata: dict) -> int:
    return len(json.dumps(metadata).encode("utf-8"))


def build_rows_for_file(repo_root: Path, rel_path: str, git_sha: str) -> list[dict]:
    abs_path = repo_root / rel_path
    try:
        raw = abs_path.read_bytes()
    except OSError:
        return []
    if is_probably_binary(raw[:8192]):
        print(f"  skipping {rel_path} — detected as binary", file=sys.stderr)
        return []

    content = raw.decode("utf-8", errors="ignore")
    if not content.strip():
        return []

    file_hash = content_hash(content)
    language = _language_for(rel_path)
    app = _app_for(rel_path)

    # Filter once and reuse the same list for both — embed_batch's output is positionally
    # aligned to `texts`, so zipping it against the unfiltered `chunks` (as a prior version
    # of this function did) silently shifts every embedding after the first blank chunk:
    # wrong content ends up stored under the wrong file_path/line-range metadata.
    valid_chunks = [c for c in chunk_code(content) if c["content"].strip()]
    if not valid_chunks:
        return []

    embeddings = embed_batch([c["content"] for c in valid_chunks])

    rows = []
    for chunk, emb in zip(valid_chunks, embeddings):
        metadata = {
            "file_path": rel_path,
            "start_line": chunk["start_line"],
            "end_line": chunk["end_line"],
            "file_hash": file_hash,
            "language": language,
            "app": app,
            "git_sha": git_sha,
            "content": chunk["content"],
        }
        # Chunk size is kept well under the 10KiB metadata cap by MAX_TOKENS_PER_INPUT, but
        # a pathological single very-long line (e.g. a minified-adjacent one-liner that
        # slipped the binary check) could still exceed it. Drop content rather than fail
        # the whole upload — search still returns file_path/line-range for that chunk.
        if _metadata_size(metadata) > VECTORIZE_METADATA_BUDGET_BYTES:
            print(
                f"  WARNING: {rel_path}:{chunk['start_line']}-{chunk['end_line']} metadata "
                f"exceeds budget even after chunking — storing without content",
                file=sys.stderr,
            )
            metadata["content"] = ""
        rows.append(
            {
                "id": chunk_id_for(rel_path, chunk),
                "values": emb,
                "metadata": metadata,
            }
        )
    return rows


# Files are embedded independently — safe to run several at once. Pollinations/Vectorize
# both take real network round-trips per call, so a sequential loop over ~1800 files
# spends almost all its time waiting on I/O rather than doing local work.
#
# POLLI_VECTOR_DB is an sk_ (secret) key: gen.pollinations.ai's rate-limit middleware
# (rate-limit-durable.ts) explicitly skips non-publishable keys, so there's no
# platform-side concurrency wall here — the only real ceiling is pollen balance (402 on
# empty). Still bounded rather than unbounded to stay a reasonable client of Vectorize's
# own API and the GitHub Actions runner's resources, not because of a Pollinations limit.
EMBED_CONCURRENCY = 16


def _current_head(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _embed_and_upsert_file(repo_root: Path, rel_path: str, git_sha: str) -> tuple[str, int, Exception | None]:
    """Returns (rel_path, vectors_upserted, error) — never raises, so one bad file
    doesn't take down the whole pool."""
    try:
        rows = build_rows_for_file(repo_root, rel_path, git_sha)
        if rows:
            vectorize_upsert(rows)
        return rel_path, len(rows), None
    except Exception as e:
        return rel_path, 0, e


def run_full(repo_root: Path) -> bool:
    """Returns True if every file embedded successfully. A partial run must not report
    success — a green CI check has to mean the index is actually fully populated, not
    "ran without crashing while silently dropping some files"."""
    files = collect_code_files(repo_root)
    git_sha = _current_head(repo_root)
    print(f"Full embed: {len(files)} files found (concurrency={EMBED_CONCURRENCY}, HEAD={git_sha[:8]})")

    total_vectors = 0
    processed = 0
    failed: list[str] = []
    progress_lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=EMBED_CONCURRENCY) as pool:
        futures = {
            pool.submit(_embed_and_upsert_file, repo_root, str(f.relative_to(repo_root)), git_sha): f for f in files
        }
        for future in as_completed(futures):
            rel_path, vector_count, error = future.result()
            with progress_lock:
                processed += 1
                if error:
                    failed.append(rel_path)
                    print(f"  FAILED {rel_path}: {error}", file=sys.stderr)
                else:
                    total_vectors += vector_count
                if processed % 25 == 0 or processed == len(files):
                    print(f"[{processed}/{len(files)}] files processed, {total_vectors} vectors upserted so far")

    print(f"Full embed complete: {total_vectors} vectors across {len(files) - len(failed)} files")
    if failed:
        print(f"ERROR: {len(failed)} file(s) failed and were skipped: {', '.join(failed[:20])}", file=sys.stderr)
        if len(failed) > 20:
            print(f"  ...and {len(failed) - 20} more", file=sys.stderr)
        print(
            "Re-running is safe — upserts are idempotent by id, so a re-run only fills the gaps.",
            file=sys.stderr,
        )
        return False
    return True


def git_changed_files(repo_root: Path, base_sha: str, head_sha: str) -> list[tuple[str, str, str]]:
    """Return list of (status, old_path, new_path) between two refs. status: A/M/D/R."""
    result = subprocess.run(
        ["git", "-C", str(repo_root), "diff", "--name-status", "-M", base_sha, head_sha],
        capture_output=True,
        text=True,
        check=True,
    )
    changes = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        status = parts[0]
        if status.startswith("R"):
            changes.append(("R", parts[1], parts[2]))
        else:
            changes.append((status[0], parts[1], parts[1]))
    return changes


def _sync_one_change(
    repo_root: Path, status: str, old_path: str, new_path: str, git_sha: str
) -> tuple[str, int, int, Exception | None]:
    """Returns (log_line, vectors_upserted, vectors_deleted, error)."""
    try:
        deleted = 0
        if status == "D":
            stale_ids = vectorize_find_ids_for_file(old_path)
            vectorize_delete_by_ids(stale_ids)
            return f"D  {old_path} — removed {len(stale_ids)} vectors", 0, len(stale_ids), None

        if status == "R" and old_path != new_path:
            stale_ids = vectorize_find_ids_for_file(old_path)
            vectorize_delete_by_ids(stale_ids)
            deleted += len(stale_ids)

        stale_ids = vectorize_find_ids_for_file(new_path)
        if stale_ids:
            vectorize_delete_by_ids(stale_ids)
            deleted += len(stale_ids)

        rows = build_rows_for_file(repo_root, new_path, git_sha)
        if rows:
            vectorize_upsert(rows)
            return f"{status}  {new_path} — {len(rows)} new vectors", len(rows), deleted, None
        return f"{status}  {new_path} — no embeddable content (empty/binary)", 0, deleted, None
    except Exception as e:
        return f"{status}  {new_path} — FAILED: {e}", 0, 0, e


def run_incremental(repo_root: Path, base_sha: str, head_sha: str) -> bool:
    """Returns True if every changed file synced successfully."""
    changes = git_changed_files(repo_root, base_sha, head_sha)
    print(f"Incremental embed: {len(changes)} changed paths between {base_sha[:8]}..{head_sha[:8]}")

    relevant = [c for c in changes if is_embeddable_path(c[2])]
    if not relevant:
        print("No relevant files changed — nothing to do")
        return True

    total_upserted = 0
    total_deleted = 0
    failed: list[str] = []

    with ThreadPoolExecutor(max_workers=EMBED_CONCURRENCY) as pool:
        futures = [
            pool.submit(_sync_one_change, repo_root, status, old, new, head_sha) for status, old, new in relevant
        ]
        for future in as_completed(futures):
            log_line, upserted, deleted, error = future.result()
            print(log_line, file=sys.stderr if error else sys.stdout)
            total_upserted += upserted
            total_deleted += deleted
            if error:
                failed.append(log_line)

    print(f"Incremental embed complete: {total_upserted} vectors upserted, {total_deleted} stale vectors deleted")
    if failed:
        print(f"ERROR: {len(failed)} change(s) failed to sync:", file=sys.stderr)
        for line in failed:
            print(f"  {line}", file=sys.stderr)
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["full", "incremental"], required=True)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--base-sha", help="required for incremental mode")
    parser.add_argument("--head-sha", help="required for incremental mode")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()

    if args.mode == "full":
        ok = run_full(repo_root)
    else:
        if not args.base_sha or not args.head_sha:
            parser.error("--base-sha and --head-sha are required for incremental mode")
        ok = run_incremental(repo_root, args.base_sha, args.head_sha)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
