"""The `code_search` tool — one entry point over two complementary backends.

Vectorize answers "where does X live?" from natural language. The local clone answers
everything after that: exact matches, reading files, walking directories. `search` runs
both in one call — semantic hits first, then the same query grepped literally — so the
common case (find something, then look at it) costs a single tool round trip.
"""

from __future__ import annotations

import logging

from ..core.config import config
from . import code_graph, local_repo
from .code_search import search_code

logger = logging.getLogger(__name__)


async def _semantic(query: str, top_k: int | None) -> list[dict]:
    if not config.code_search.is_configured:
        return []
    try:
        return await search_code(query, top_k=top_k)
    except Exception as e:
        logger.warning("Semantic search failed, falling back to local grep: %s", e)
        return []


async def _grep_fallback(query: str, path: str | None, glob: str | None) -> dict | None:
    """Literal grep of the query — catches exact identifiers semantic search may rank low."""
    if not config.code_search.local_repo_enabled:
        return None
    try:
        return await local_repo.grep(query, path=path, glob=glob, literal=True, max_results=20)
    except local_repo.RepoError as e:
        logger.warning("Local grep failed: %s", e)
        return None


async def code_search_handler(
    action: str = "search",
    query: str = "",
    *,
    path: str | None = None,
    glob: str | None = None,
    top_k: int | None = None,
    start_line: int = 1,
    end_line: int | None = None,
    case_sensitive: bool = False,
    literal: bool = False,
    context_lines: int = 0,
    max_results: int = 50,
    depth: int = 2,
    **kwargs,
) -> dict:
    """Dispatch a code_search action. See CODE_SEARCH_TOOL for the action contract."""
    try:
        if action == "search":
            if not query:
                return {"error": "query is required for action='search'"}
            semantic = await _semantic(query, top_k)
            exact = await _grep_fallback(query, path, glob)
            result: dict = {
                "semantic_matches": [
                    {
                        "file": r["file_path"],
                        "lines": f"{r['start_line']}-{r['end_line']}",
                        "language": r.get("language"),
                        "app": r.get("app"),
                        "similarity": r["similarity"],
                        "code": r["content"],
                    }
                    for r in semantic
                ],
                "exact_matches": (exact or {}).get("matches", []),
            }
            if not result["semantic_matches"] and not result["exact_matches"]:
                result["message"] = "No matches. Try action='grep' with a looser pattern, or action='tree' to explore."
            else:
                result["message"] = (
                    f"{len(result['semantic_matches'])} semantic, {len(result['exact_matches'])} exact. "
                    "Use action='read' to open any file, action='grep' to search further."
                )
            return result

        if action == "grep":
            if not query:
                return {"error": "query is required for action='grep'"}
            return await local_repo.grep(
                query,
                path=path,
                glob=glob,
                case_sensitive=case_sensitive,
                literal=literal,
                context_lines=context_lines,
                max_results=max_results,
            )

        if action == "read":
            if not path:
                return {"error": "path is required for action='read'"}
            return await local_repo.read_file(path, start_line=start_line, end_line=end_line)

        if action == "list":
            return await local_repo.list_files(path or "", glob=glob, max_results=max_results)

        if action == "tree":
            return await local_repo.tree(path or "", depth=depth)

        if action in ("callers", "callees", "impact"):
            if not query:
                return {"error": f"query (the symbol name) is required for action='{action}'"}
            if not config.code_search.graph_enabled:
                return {"error": "The code graph is not enabled; use action='grep' instead."}
            if action == "callers":
                return await code_graph.callers(query, limit=max_results)
            if action == "callees":
                return await code_graph.callees(query, limit=max_results)
            return await code_graph.impact(query, depth=depth)

        if action == "status":
            status = await local_repo.repo_status()
            status["graph_enabled"] = config.code_search.graph_enabled
            return status

        return {
            "error": (
                f"Unknown action '{action}'. Use: search, grep, read, list, tree, "
                "callers, callees, impact, status."
            )
        }

    except local_repo.RepoError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error("code_search action=%s failed: %s", action, e)
        return {"error": str(e)}
