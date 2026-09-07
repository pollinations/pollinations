"""Structural queries over the local clone via the pinned CodeGraph package."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import TypeAlias

from . import local_repo
from .local_repo import REPO_DIR, RepoError

COMMAND_TIMEOUT_SECONDS = 60
MAX_RESULTS = 50
MAX_IMPACT_DEPTH = 4
APP_DIR = Path(__file__).resolve().parents[2]
API_HELPER = Path(__file__).with_name("code_graph_api.js")
CLI_SHIM = APP_DIR / "node_modules" / "@colbymchenry" / "codegraph" / "npm-shim.js"
JsonData: TypeAlias = dict | list[dict]


async def _run_process(*args: str, timeout: int = COMMAND_TIMEOUT_SECONDS) -> tuple[str, str]:
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=str(REPO_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except (TimeoutError, asyncio.CancelledError) as error:
        if proc.returncode is None:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        await proc.communicate()
        if isinstance(error, asyncio.CancelledError):
            raise
        raise RepoError(f"CodeGraph timed out after {timeout}s") from None
    stderr_text = stderr.decode("utf-8", "replace").strip()
    if proc.returncode != 0:
        raise RepoError(f"CodeGraph failed: {stderr_text[:200]}")
    return stdout.decode("utf-8", "replace").strip(), stderr_text


async def _run_codegraph(*args: str) -> JsonData:
    """Backward-compatible name for JSON-producing pinned CLI commands."""
    return await _run_codegraph_json(*args)


async def _run_codegraph_json(*args: str) -> JsonData:
    """Run the locally pinned CLI and parse a JSON-producing command."""
    if not (REPO_DIR / ".codegraph").is_dir():
        raise RepoError("No code graph built yet — run sync_graph() first.")
    if not CLI_SHIM.is_file():
        raise RepoError("Pinned CodeGraph dependency is not installed.")
    stdout, _ = await _run_process("node", str(CLI_SHIM), *args)
    if not stdout:
        return {}
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        raise RepoError(stdout[:200]) from None


async def _run_graph_api(action: str, identifier: str, depth: int = 1) -> dict:
    """Resolve and traverse a node through CodeGraph's public exact-ID API."""
    if not API_HELPER.is_file():
        raise RepoError("CodeGraph API helper is unavailable.")
    stdout, _ = await _run_process("node", str(API_HELPER), action, identifier, str(depth))
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        raise RepoError("CodeGraph API returned invalid JSON") from None
    return data if isinstance(data, dict) else {}


def _as_dict(data: JsonData) -> dict:
    return data if isinstance(data, dict) else {}


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
    data = _as_dict(await _run_codegraph("status", "--json"))
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
    """Fuzzy symbol discovery; use a returned stable ID for traversal."""
    limit = max(1, min(limit, MAX_RESULTS))
    data = await _run_codegraph("query", query, "--json", "--limit", str(limit))
    status = await graph_status()
    items = data if isinstance(data, list) else []
    nodes = [item.get("node", item) for item in items if isinstance(item, dict)]
    exact = [node for node in nodes if query in (node.get("id"), node.get("name"), node.get("qualifiedName"))]
    results = _format_nodes(exact or nodes, limit)
    return {
        "query": query,
        "relation": "symbols",
        "revision": status["revision"],
        "fresh": status["fresh"],
        "count": len(results),
        "results": results,
    }


async def _relationship(action: str, symbol: str, *, limit: int, depth: int = 1) -> dict:
    data = await _run_graph_api(action, symbol, depth)
    target = data.get("target", {})
    target_id = target.get("id")
    if not isinstance(target_id, str):
        raise RepoError("CodeGraph API did not return a stable target ID.")
    status = await graph_status()
    nodes = data.get("nodes", [])
    if action == "impact":
        nodes = [node for node in nodes if node.get("id") != target_id]
    results = _format_nodes(nodes, limit)
    return {
        "symbol": target.get("qualifiedName") or target_id,
        "symbol_id": target_id,
        "relation": action,
        "revision": status["revision"],
        "fresh": status["fresh"],
        "depth": data.get("depth") if action == "impact" else None,
        "count": len(results),
        "results": results,
    }


async def callers(symbol: str, *, limit: int = 20) -> dict:
    return await _relationship("callers", symbol, limit=max(1, min(limit, MAX_RESULTS)))


async def callees(symbol: str, *, limit: int = 20) -> dict:
    return await _relationship("callees", symbol, limit=max(1, min(limit, MAX_RESULTS)))


async def impact(symbol: str, *, depth: int = 2) -> dict:
    depth = max(1, min(depth, MAX_IMPACT_DEPTH))
    return await _relationship("impact", symbol, limit=MAX_RESULTS, depth=depth)


async def sync_graph() -> dict:
    """Build or synchronize the graph with the same pinned CLI package."""
    if not CLI_SHIM.is_file():
        raise RepoError("Pinned CodeGraph dependency is not installed.")
    graph_exists = (REPO_DIR / ".codegraph").is_dir()
    args = ("sync", "--quiet") if graph_exists else ("init", ".", "--yes")
    await _run_process("node", str(CLI_SHIM), *args, timeout=300)
    return {"action": args[0], "ok": True}
