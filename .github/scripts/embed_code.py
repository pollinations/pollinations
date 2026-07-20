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
import time
from pathlib import Path

import requests
import tiktoken
import xxhash

CF_ACCOUNT_ID = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
POLLINATIONS_TOKEN = os.environ["POLLI_VECTOR_DB"]
INDEX_NAME = os.environ.get("VECTORIZE_INDEX", "polly-code-embeddings")
EMBED_MODEL = "qwen3-embedding-8b"
EMBED_DIMENSIONS = 1536

CF_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/vectorize/v2/indexes/{INDEX_NAME}"
CF_HEADERS = {"Authorization": f"Bearer {CF_API_TOKEN}"}

POLLINATIONS_EMBED_URL = "https://gen.pollinations.ai/v1/embeddings"

_enc = tiktoken.get_encoding("cl100k_base")
MAX_TOKENS_PER_INPUT = 8000

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


def chunk_code(content: str, max_lines: int = 100) -> list[dict]:
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
    part = chunk.get("part")
    suffix = f"p{part}" if part is not None else ""
    return f"{file_path}:{chunk['start_line']}-{chunk['end_line']}{suffix}"


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


def embed_batch(texts: list[str], retries: int = 3) -> list[list[float]]:
    """Embed a batch of texts via Pollinations qwen3-embedding-8b at 1536-dim (MRL truncation)."""
    payload = {
        "model": EMBED_MODEL,
        "input": texts,
        "dimensions": EMBED_DIMENSIONS,
    }
    headers = {"Authorization": f"Bearer {POLLINATIONS_TOKEN}", "Content-Type": "application/json"}
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.post(POLLINATIONS_EMBED_URL, json=payload, headers=headers, timeout=60)
            if resp.status_code != 200:
                raise RuntimeError(f"Pollinations embed HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            sorted_data = sorted(data["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in sorted_data]
        except Exception as e:
            last_err = e
            wait = 2**attempt
            print(f"  embed batch failed (attempt {attempt + 1}/{retries}): {e} — retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Embedding failed after {retries} attempts: {last_err}")


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


def build_rows_for_file(repo_root: Path, rel_path: str) -> list[dict]:
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
    chunks = chunk_code(content)
    texts = [c["content"] for c in chunks if c["content"].strip()]
    if not texts:
        return []

    embeddings = embed_batch(texts)

    rows = []
    for chunk, emb in zip(chunks, embeddings):
        if not chunk["content"].strip():
            continue
        rows.append(
            {
                "id": chunk_id_for(rel_path, chunk),
                "values": emb,
                "metadata": {
                    "file_path": rel_path,
                    "start_line": chunk["start_line"],
                    "end_line": chunk["end_line"],
                    "file_hash": file_hash,
                },
            }
        )
    return rows


def run_full(repo_root: Path) -> None:
    files = collect_code_files(repo_root)
    print(f"Full embed: {len(files)} files found")
    total_vectors = 0
    for idx, file_path in enumerate(files, 1):
        rel_path = str(file_path.relative_to(repo_root))
        rows = build_rows_for_file(repo_root, rel_path)
        if rows:
            vectorize_upsert(rows)
            total_vectors += len(rows)
        if idx % 25 == 0 or idx == len(files):
            print(f"[{idx}/{len(files)}] files processed, {total_vectors} vectors upserted so far")
    print(f"Full embed complete: {total_vectors} vectors across {len(files)} files")


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


def run_incremental(repo_root: Path, base_sha: str, head_sha: str) -> None:
    changes = git_changed_files(repo_root, base_sha, head_sha)
    print(f"Incremental embed: {len(changes)} changed paths between {base_sha[:8]}..{head_sha[:8]}")

    relevant = [c for c in changes if is_embeddable_path(c[2])]
    if not relevant:
        print("No relevant files changed — nothing to do")
        return

    total_upserted = 0
    total_deleted = 0

    for status, old_path, new_path in relevant:
        if status == "D":
            stale_ids = vectorize_find_ids_for_file(old_path)
            vectorize_delete_by_ids(stale_ids)
            total_deleted += len(stale_ids)
            print(f"D  {old_path} — removed {len(stale_ids)} vectors")
            continue

        if status == "R" and old_path != new_path:
            stale_ids = vectorize_find_ids_for_file(old_path)
            vectorize_delete_by_ids(stale_ids)
            total_deleted += len(stale_ids)

        stale_ids = vectorize_find_ids_for_file(new_path)
        if stale_ids:
            vectorize_delete_by_ids(stale_ids)
            total_deleted += len(stale_ids)

        rows = build_rows_for_file(repo_root, new_path)
        if rows:
            vectorize_upsert(rows)
            total_upserted += len(rows)
            print(f"{status}  {new_path} — {len(rows)} new vectors")
        else:
            print(f"{status}  {new_path} — no embeddable content (empty/binary)")

    print(f"Incremental embed complete: {total_upserted} vectors upserted, {total_deleted} stale vectors deleted")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["full", "incremental"], required=True)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--base-sha", help="required for incremental mode")
    parser.add_argument("--head-sha", help="required for incremental mode")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()

    if args.mode == "full":
        run_full(repo_root)
    else:
        if not args.base_sha or not args.head_sha:
            parser.error("--base-sha and --head-sha are required for incremental mode")
        run_incremental(repo_root, args.base_sha, args.head_sha)


if __name__ == "__main__":
    main()
