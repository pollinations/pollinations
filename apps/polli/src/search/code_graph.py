"""Structural queries over the local clone via CodeGraph.

Grep answers "where does this string appear"; the graph answers "what calls this, what
does it call, and what breaks if it changes". The difference matters most for impact
analysis, which reaches files that never mention the symbol at all — grep cannot find
those no matter how many times it runs.

The graph is a snapshot built by `codegraph index`, so it needs `sync_graph()` whenever
the clone moves, or answers silently go stale.
"""

from __future__ import annotations

import asyncio
import json
import logging

from ..core.config import config
from . import local_repo
from .local_repo import REPO_DIR, RepoError

logger = logging.getLogger(__name__)

COMMAND_TIMEOUT_SECONDS = 60
MAX_RESULTS = 50
MAX_IMPACT_DEPTH = 4


async def _run_codegraph(*args: str) -> dict:
    """Run a codegraph subcommand and parse its JSON output."""
    if not (REPO_DIR / ".codegraph").is_dir():
        raise RepoError("No code graph built yet — run sync_graph() first.")

    proc = await asyncio.create_subprocess_exec(
        config.code_search.codegraph_binary,
        *args,
        cwd=str(REPO_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=COMMAND_TIMEOUT_SECONDS)
    except TimeoutError:
        proc.kill()
        raise RepoError(f"codegraph timed out after {COMMAND_TIMEOUT_SECONDS}s") from None

    out = stdout.decode("utf-8", "replace").strip()
    if proc.returncode != 0:
        raise RepoError(f"codegraph failed: {stderr.decode('utf-8', 'replace').strip()[:200]}")
    if not out:
        return {}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        # A symbol that isn't in the graph prints a plain-text notice rather than JSON.
        raise RepoError(out[:200]) from None


def _format_nodes(nodes: list[dict], limit: int) -> list[dict]:
    return [
        {
            "id": node.get("id"),
            "symbol": node.get("name"),
            "qualified_name": node.get("qualifiedName"),
            "signature": node.get("signature"),
            "kind": node.get("kind"),
            "language": node.get("language"),
            "file": node.get("filePath"),
            "start_line": node.get("startLine"),
            "end_line": node.get("endLine"),
        }
        for node in nodes[:limit]
    ]


async def graph_status() -> dict:
    data = await _run_codegraph("status", "--json")
    repo = await local_repo.repo_status()
    changes = data.get("pendingChanges") or {}
    pending = sum(int(changes.get(key, 0)) for key in ("added", "modified", "removed"))
    return {
        "available": bool(data.get("initialized")),
        "fresh": pending == 0 and not data.get("worktreeMismatch"),
        "revision": repo["commit"],
        "indexed_at": data.get("lastIndexed"),
        "version": data.get("version"),
        "files": data.get("fileCount"),
        "nodes": data.get("nodeCount"),
        "edges": data.get("edgeCount"),
        "pending_changes": changes,
    }


async def symbols(query: str, *, limit: int = 20) -> dict:
    limit = max(1, min(limit, MAX_RESULTS))
    data = await _run_codegraph("query", query, "--json", "--limit", str(limit))
    status = await graph_status()
    results = _format_nodes([item.get("node", item) for item in data], limit)
    return {
        "query": query,
        "relation": "symbols",
        "revision": status["revision"],
        "fresh": status["fresh"],
        "count": len(results),
        "results": results,
    }


async def callers(symbol: str, *, limit: int = 20) -> dict:
    """Which functions call `symbol`."""
    limit = max(1, min(limit, MAX_RESULTS))
    data = await _run_codegraph("callers", symbol, "--json", "--limit", str(limit))
    status = await graph_status()
    found = _format_nodes(data.get("callers", []), limit)
    return {
        "symbol": symbol,
        "relation": "callers",
        "revision": status["revision"],
        "fresh": status["fresh"],
        "count": len(found),
        "results": found,
        "message": f"{len(found)} caller(s) of {symbol}" if found else f"No callers found for {symbol}",
    }


async def callees(symbol: str, *, limit: int = 20) -> dict:
    """Which functions `symbol` calls."""
    limit = max(1, min(limit, MAX_RESULTS))
    data = await _run_codegraph("callees", symbol, "--json", "--limit", str(limit))
    status = await graph_status()
    found = _format_nodes(data.get("callees", []), limit)
    return {
        "symbol": symbol,
        "relation": "callees",
        "revision": status["revision"],
        "fresh": status["fresh"],
        "count": len(found),
        "results": found,
        "message": f"{symbol} calls {len(found)} symbol(s)" if found else f"No callees found for {symbol}",
    }


async def impact(symbol: str, *, depth: int = 2) -> dict:
    """Everything transitively affected by changing `symbol`."""
    depth = max(1, min(depth, MAX_IMPACT_DEPTH))
    data = await _run_codegraph("impact", symbol, "--json", "--depth", str(depth))
    status = await graph_status()
    affected = _format_nodes(data.get("affected", []), MAX_RESULTS)
    return {
        "symbol": symbol,
        "relation": "impact",
        "revision": status["revision"],
        "fresh": status["fresh"],
        "depth": data.get("depth", depth),
        "count": len(affected),
        "results": affected,
        "message": (
            f"{len(affected)} symbol(s) affected by changing {symbol} (depth {depth}). "
            "Includes files that never name the symbol directly."
        ),
    }


async def sync_graph() -> dict:
    """Bring the graph up to date with the clone. Cheap enough to run on every merge."""
    graph_exists = (REPO_DIR / ".codegraph").is_dir()
    args = ("sync", "--quiet") if graph_exists else ("init", ".")

    proc = await asyncio.create_subprocess_exec(
        config.code_search.codegraph_binary,
        *args,
        cwd=str(REPO_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
    except TimeoutError:
        proc.kill()
        raise RepoError("codegraph sync timed out") from None
    if proc.returncode != 0:
        raise RepoError(f"codegraph {args[0]} failed: {stderr.decode('utf-8', 'replace').strip()[:200]}")
    return {"action": args[0], "ok": True}
