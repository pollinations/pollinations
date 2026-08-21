"""Direct exploration of a local clone of the indexed repository.

Semantic search (`code_search.py`) is good at finding *where* something lives; it is bad at
exact matches, at following a symbol across files, and at reading whole files. This module
covers that gap with ripgrep and plain file reads over a shallow clone kept in sync with
main.

Every path from the model is resolved and checked to stay inside the clone, and every
subprocess call is argv-based with a timeout — no shell interpolation anywhere.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from ..core.config import config

logger = logging.getLogger(__name__)

REPO_DIR: Path = config.paths.data_dir / "repo"

# Bound every response so a broad query can't blow up the model's context.
MAX_MATCHES = 100
MAX_LINE_CHARS = 300
MAX_FILE_LINES = 800
MAX_LIST_ENTRIES = 300
COMMAND_TIMEOUT_SECONDS = 30


class RepoError(RuntimeError):
    """A query could not be served (bad path, missing clone, failed command)."""


def _resolve_in_repo(rel_path: str) -> Path:
    """Resolve `rel_path` inside the clone, refusing anything that escapes it."""
    root = REPO_DIR.resolve()
    target = (root / rel_path).resolve()
    if target != root and root not in target.parents:
        raise RepoError(f"Path escapes the repository: {rel_path}")
    return target


async def _run(*argv: str, cwd: Path | None = None) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *argv,
        cwd=str(cwd or REPO_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=COMMAND_TIMEOUT_SECONDS)
    except TimeoutError:
        proc.kill()
        raise RepoError(f"Command timed out after {COMMAND_TIMEOUT_SECONDS}s") from None
    return proc.returncode or 0, stdout.decode("utf-8", "replace"), stderr.decode("utf-8", "replace")


def _ensure_clone() -> None:
    if not (REPO_DIR / ".git").is_dir():
        raise RepoError(f"No repository clone at {REPO_DIR}. Run sync_repo() first.")


async def grep(
    pattern: str,
    *,
    path: str | None = None,
    glob: str | None = None,
    case_sensitive: bool = False,
    literal: bool = False,
    context_lines: int = 0,
    max_results: int = 50,
) -> dict:
    """Search file contents with ripgrep. Returns matches with file/line/text."""
    _ensure_clone()
    max_results = max(1, min(max_results, MAX_MATCHES))

    argv = ["rg", "--json", "--max-count", str(max_results), "--max-columns", str(MAX_LINE_CHARS)]
    if not case_sensitive:
        argv.append("--ignore-case")
    if literal:
        argv.append("--fixed-strings")
    if context_lines:
        argv += ["--context", str(min(context_lines, 10))]
    if glob:
        argv += ["--glob", glob]
    argv.append(pattern)
    # Always pass an explicit search root. With no path argument ripgrep reads stdin when
    # stdin is not a TTY — which is always true here — and silently finds nothing.
    argv.append(str(_resolve_in_repo(path).relative_to(REPO_DIR.resolve())) if path else "./")

    code, stdout, stderr = await _run(*argv)
    # rg exits 1 when there are simply no matches — not an error.
    if code not in (0, 1):
        raise RepoError(f"ripgrep failed: {stderr.strip()[:200]}")

    import json as _json

    matches: list[dict] = []
    for line in stdout.splitlines():
        if len(matches) >= max_results:
            break
        try:
            event = _json.loads(line)
        except ValueError:
            continue
        if event.get("type") != "match":
            continue
        data = event["data"]
        matches.append(
            {
                # Strip the "./" search-root prefix so paths read like git paths.
                "file": data["path"]["text"].removeprefix("./"),
                "line": data["line_number"],
                "text": data["lines"]["text"].rstrip("\n")[:MAX_LINE_CHARS],
            }
        )

    return {
        "pattern": pattern,
        "match_count": len(matches),
        "matches": matches,
        "truncated": len(matches) >= max_results,
    }


async def read_file(path: str, *, start_line: int = 1, end_line: int | None = None) -> dict:
    """Read a file (or a line range of it) from the clone."""
    _ensure_clone()
    target = _resolve_in_repo(path)
    if not target.is_file():
        raise RepoError(f"Not a file: {path}")

    try:
        text = target.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        raise RepoError(f"Could not read {path}: {e}") from e

    lines = text.split("\n")
    total = len(lines)
    start = max(1, start_line)
    end = min(end_line or total, total, start + MAX_FILE_LINES - 1)

    return {
        "file": path,
        "total_lines": total,
        "start_line": start,
        "end_line": end,
        "truncated": end < total,
        "content": "\n".join(lines[start - 1 : end]),
    }


async def list_files(path: str = "", *, glob: str | None = None, max_results: int = 200) -> dict:
    """List tracked files, optionally under `path` and/or matching `glob`."""
    _ensure_clone()
    max_results = max(1, min(max_results, MAX_LIST_ENTRIES))

    argv = ["git", "ls-files"]
    if glob:
        argv += ["--", f"{path.rstrip('/')}/{glob}" if path else glob]
    elif path:
        _resolve_in_repo(path)  # validate before passing through
        argv += ["--", path]

    code, stdout, stderr = await _run(*argv)
    if code != 0:
        raise RepoError(f"git ls-files failed: {stderr.strip()[:200]}")

    files = [f for f in stdout.splitlines() if f]
    return {
        "path": path or "(repo root)",
        "file_count": len(files),
        "files": files[:max_results],
        "truncated": len(files) > max_results,
    }


async def tree(path: str = "", *, depth: int = 2) -> dict:
    """Directory layout under `path`, to `depth` levels — a map before drilling in."""
    _ensure_clone()
    depth = max(1, min(depth, 4))
    root = _resolve_in_repo(path) if path else REPO_DIR.resolve()

    code, stdout, stderr = await _run("git", "ls-files")
    if code != 0:
        raise RepoError(f"git ls-files failed: {stderr.strip()[:200]}")

    prefix = str(root.relative_to(REPO_DIR.resolve())) if path else ""
    entries: set[str] = set()
    for file in stdout.splitlines():
        if prefix and not file.startswith(prefix + "/"):
            continue
        rel = file[len(prefix) + 1 :] if prefix else file
        parts = rel.split("/")
        for level in range(min(depth, len(parts))):
            node = "/".join(parts[: level + 1])
            entries.add(node + ("/" if level + 1 < len(parts) else ""))

    return {
        "path": path or "(repo root)",
        "depth": depth,
        "entries": sorted(entries)[:MAX_LIST_ENTRIES],
    }


async def repo_status() -> dict:
    """Current commit of the clone — how fresh local results are."""
    _ensure_clone()
    code, stdout, _ = await _run("git", "log", "-1", "--format=%H|%cI|%s")
    if code != 0:
        raise RepoError("Could not read repository status")
    sha, committed_at, subject = stdout.strip().split("|", 2)
    return {"commit": sha, "short_commit": sha[:8], "committed_at": committed_at, "subject": subject}


async def sync_repo() -> dict:
    """Fast-forward the clone to the tracked branch. Called when a PR merges."""
    branch = config.code_search.local_repo_branch
    if not (REPO_DIR / ".git").is_dir():
        REPO_DIR.parent.mkdir(parents=True, exist_ok=True)
        code, _, stderr = await _run(
            "git", "clone", "--depth=1", "--filter=blob:none",
            "--branch", branch, config.code_search.local_repo_url, str(REPO_DIR),
            cwd=REPO_DIR.parent,
        )
        if code != 0:
            raise RepoError(f"git clone failed: {stderr.strip()[:200]}")
        return await repo_status()

    code, _, stderr = await _run("git", "fetch", "--depth=1", "origin", branch)
    if code != 0:
        raise RepoError(f"git fetch failed: {stderr.strip()[:200]}")
    code, _, stderr = await _run("git", "reset", "--hard", f"origin/{branch}")
    if code != 0:
        raise RepoError(f"git reset failed: {stderr.strip()[:200]}")
    return await repo_status()
