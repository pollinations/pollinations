"""Singleton registry for tool handler instances.

Manages shared resources (sessions, managers) and registers
tool handlers on the PollyClient.
"""

import logging
from typing import Optional

import aiohttp

from ..config import config

logger = logging.getLogger(__name__)

# Singletons
_http_session: Optional[aiohttp.ClientSession] = None
_github_manager = None
_github_pr_manager = None
_github_graphql = None


def get_config():
    """Get the global config instance."""
    return config


async def get_http_session() -> aiohttp.ClientSession:
    """Get or create shared HTTP session."""
    global _http_session
    if _http_session is None or _http_session.closed:
        connector = aiohttp.TCPConnector(
            limit=50,
            limit_per_host=20,
            keepalive_timeout=60,
            enable_cleanup_closed=True,
            ttl_dns_cache=300,
            use_dns_cache=True,
        )
        _http_session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=120, connect=10),
        )
    return _http_session


def _get_github_manager():
    """Get or create GitHubManager singleton."""
    global _github_manager
    if _github_manager is None:
        from .github import GitHubIssueManager
        _github_manager = GitHubIssueManager()
    return _github_manager


def _get_github_pr_manager():
    """Get or create GitHubPRManager singleton."""
    global _github_pr_manager
    if _github_pr_manager is None:
        from .github_pr import github_pr_manager
        _github_pr_manager = github_pr_manager
    return _github_pr_manager


async def init_registry():
    """Initialize singletons that need async setup."""
    from . import github_auth
    github_auth.init_github_app_auth()
    logger.info("Registry initialized")


def register_all_handlers(client):
    """Register all tool handlers on the PollyClient instance."""
    from .github import (
        tool_github_issue,
        tool_github_project,
        tool_github_custom,
        tool_github_overview,
    )
    from .github_pr import tool_github_pr
    from .web import web_search_handler, web_handler

    # GitHub tools
    client.register_tool_handler("github_issue", tool_github_issue)
    client.register_tool_handler("github_pr", tool_github_pr)
    client.register_tool_handler("github_project", tool_github_project)
    client.register_tool_handler("github_custom", tool_github_custom)
    client.register_tool_handler("github_overview", tool_github_overview)

    # Web tools
    client.register_tool_handler("web_search", web_search_handler)
    client.register_tool_handler("web", web_handler)

    # Web scraper (imported from copied module)
    from .web_scraper import web_scrape_handler
    client.register_tool_handler("web_scrape", web_scrape_handler)

    # Optional: code search
    if config.local_embeddings_enabled:
        try:
            from .embeddings import search_code
            async def code_search_handler(query: str, top_k: int = 5, **kwargs):
                return await search_code(query=query, top_k=top_k)
            client.register_tool_handler("code_search", code_search_handler)
        except Exception as e:
            logger.warning(f"Code search not available: {e}")

    # Optional: doc search
    if config.doc_embeddings_enabled:
        try:
            from .doc_embeddings import search_docs
            async def doc_search_handler(query: str, top_k: int = 5, **kwargs):
                return await search_docs(query=query, top_k=top_k)
            client.register_tool_handler("doc_search", doc_search_handler)
        except Exception as e:
            logger.warning(f"Doc search not available: {e}")

    # Optional: Discord search
    if config.discord_search_enabled:
        try:
            from .discord_search import tool_discord_search
            client.register_tool_handler("discord_search", tool_discord_search)
        except Exception as e:
            logger.warning(f"Discord search not available: {e}")

    handler_count = len(client._tool_handlers)
    logger.info(f"Registered {handler_count} tool handlers")


async def cleanup():
    """Close all singleton sessions."""
    global _http_session, _github_manager, _github_pr_manager

    if _http_session and not _http_session.closed:
        await _http_session.close()
        _http_session = None

    if _github_manager:
        await _github_manager.close()
        _github_manager = None

    if _github_pr_manager:
        await _github_pr_manager.close()
        _github_pr_manager = None

    logger.info("Registry cleaned up")
