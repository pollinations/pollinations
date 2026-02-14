"""Web search and deep research tool handlers."""

import asyncio
import logging

import aiohttp

from ..config import config

logger = logging.getLogger(__name__)


async def _get_session() -> aiohttp.ClientSession:
    """Get a shared HTTP session."""
    from ._registry import get_http_session
    return await get_http_session()


async def web_search_handler(query: str, model: str = "perplexity-fast", **kwargs) -> dict:
    """
    Web search using search-enabled models.

    Models:
    - gemini-search: Gemini 2.0 Flash with Google Search (fast, factual)
    - perplexity-fast: Perplexity Sonar (balanced, citations)
    - perplexity-reasoning: Perplexity Sonar Reasoning (deep analysis)
    """
    valid_models = ["gemini-search", "perplexity-fast", "perplexity-reasoning"]
    if model not in valid_models:
        model = "perplexity-fast"

    messages = [
        {
            "role": "system",
            "content": "You are a helpful search assistant. Provide accurate, up-to-date information with sources when available. Be concise but thorough.",
        },
        {"role": "user", "content": query},
    ]

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.pollinations_token}",
    }

    payload = {
        "model": model,
        "messages": messages,
    }

    try:
        session = await _get_session()
        url = f"{config.pollinations_api_base}/v1/chat/completions"

        async with session.post(
            url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=60)
        ) as response:
            if response.status == 200:
                data = await response.json()
                content = data["choices"][0]["message"].get("content", "")
                return {"result": content, "model": model, "query": query}
            else:
                error_text = await response.text()
                logger.error(f"Web search API error: {response.status} - {error_text[:200]}")
                return {"error": f"Search failed: HTTP {response.status}"}

    except asyncio.TimeoutError:
        logger.error("Web search timeout")
        return {"error": "Search timed out. Try a simpler query."}
    except Exception as e:
        logger.error(f"Web search error: {e}")
        return {"error": f"Search failed: {str(e)}"}


async def web_handler(query: str, **kwargs) -> dict:
    """
    Deep research using nomnom model (search + scrape + crawl + code execution).
    Use sparingly - powerful but slower than simple tools.
    """
    messages = [
        {
            "role": "system",
            "content": "You are a deep research assistant with web search, scraping, crawling, and Python code execution capabilities. Provide thorough, accurate, well-sourced answers. Use code for data analysis when helpful.",
        },
        {"role": "user", "content": query},
    ]

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.pollinations_token}",
    }

    payload = {
        "model": "nomnom",
        "messages": messages,
    }

    try:
        session = await _get_session()
        url = f"{config.pollinations_api_base}/v1/chat/completions"

        async with session.post(url, json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                message = data["choices"][0]["message"]
                content = message.get("content", "")

                content_blocks = message.get("content_blocks", [])
                image_urls = []
                for block in content_blocks:
                    if block.get("type") == "image_url":
                        img_url = block.get("image_url", {}).get("url", "")
                        if img_url and img_url.startswith("http"):
                            image_urls.append(img_url)

                result = {"result": content, "model": "nomnom", "query": query}
                if image_urls:
                    result["image_urls"] = image_urls
                return result
            else:
                error_text = await response.text()
                logger.error(f"Web (nomnom) API error: {response.status} - {error_text[:200]}")
                return {"error": f"Research failed: HTTP {response.status}"}

    except asyncio.TimeoutError:
        logger.error("Web (nomnom) timeout")
        return {"error": "Research timed out. Try a simpler query or use web_search instead."}
    except Exception as e:
        logger.error(f"Web (nomnom) error: {e}")
        return {"error": f"Research failed: {str(e)}"}
