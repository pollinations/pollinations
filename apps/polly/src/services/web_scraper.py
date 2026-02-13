"""Web scraping service using Crawl4AI - full-featured async scraping with all extraction strategies.

Crawl4AI v0.7.8+ features:
- Extraction: LLMExtractionStrategy, JsonCssExtractionStrategy, CosineStrategy, RegexExtractionStrategy
- Content Filters: BM25ContentFilter, PruningContentFilter, LLMContentFilter
- Chunking: RegexChunking, SlidingWindowChunking, TopicSegmentationChunking
- Advanced: fit_markdown, session reuse, JS execution, screenshots, PDF export
"""

import asyncio
import logging
import re
from typing import Optional, Dict, Any, List, Union
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# =============================================================================
# CORE SCRAPING FUNCTION - Full Crawl4AI integration
# =============================================================================


async def scrape_url(
    url: str,
    # Extraction strategy options
    extraction_strategy: Optional[
        str
    ] = None,  # "llm", "css", "xpath", "cosine", "regex"
    schema: Optional[Dict[str, Any]] = None,  # For css/xpath extraction
    instruction: Optional[str] = None,  # For LLM extraction
    semantic_filter: Optional[str] = None,  # For cosine clustering
    regex_patterns: Optional[
        List[str]
    ] = None,  # For regex extraction: ["email", "url", "phone"]
    # Content filter options
    content_filter: Optional[str] = None,  # "bm25", "pruning", "llm"
    filter_query: Optional[str] = None,  # Query for content filtering
    # Output options
    include_links: bool = False,
    include_images: bool = False,
    include_raw_html: bool = False,
    include_tables: bool = False,  # Extract tables separately
    output_format: str = "markdown",  # "markdown", "fit_markdown", "html"
    # Browser/crawl options
    js_code: Optional[str] = None,  # JavaScript to execute
    wait_for: Optional[str] = None,  # CSS selector to wait for
    screenshot: bool = False,
    pdf: bool = False,
    # Anti-bot / stealth options
    stealth_mode: bool = False,  # Enable stealth mode
    simulate_user: bool = False,  # Simulate human behavior
    magic_mode: bool = False,  # Auto anti-bot bypass
    # Page scanning options
    scan_full_page: bool = False,  # Scroll entire page
    process_iframes: bool = False,  # Extract iframe content
    remove_overlays: bool = True,  # Remove popups/modals
    # Performance options
    timeout: int = 30,
    headless: bool = True,
    # Session reuse
    session_id: Optional[str] = None,
) -> dict:
    """
    Scrape a URL with full Crawl4AI capabilities.

    Args:
        url: The URL to scrape

        # Extraction strategies (pick one or none for raw markdown):
        extraction_strategy: Strategy type - "llm", "css", "xpath", "cosine", "regex"
        schema: JSON schema for css/xpath extraction (baseSelector, fields, etc.)
        instruction: Natural language instruction for LLM extraction
        semantic_filter: Keywords for cosine similarity filtering
        regex_patterns: List of pattern names for regex extraction

        # Content filtering (pre-extraction cleanup):
        content_filter: Filter type - "bm25", "pruning", "llm"
        filter_query: Query string for content relevance filtering

        # Output options:
        include_links: Include extracted links
        include_images: Include image URLs
        include_raw_html: Include raw HTML in response
        include_tables: Extract tables as structured data
        output_format: "markdown" (default), "fit_markdown" (filtered), "html"

        # Browser control:
        js_code: JavaScript to execute before extraction
        wait_for: CSS selector to wait for before extraction
        screenshot: Capture screenshot
        pdf: Generate PDF

        # Anti-bot / Stealth:
        stealth_mode: Enable stealth mode to avoid detection
        simulate_user: Simulate human behavior (mouse movements, delays)
        magic_mode: Auto anti-bot bypass (combines stealth + simulation)

        # Page scanning:
        scan_full_page: Scroll entire page to load lazy content
        process_iframes: Extract content from iframes
        remove_overlays: Remove popups, modals, overlays

        # Performance:
        timeout: Request timeout in seconds
        headless: Run browser headless
        session_id: Reuse browser session

    Returns:
        Dict with success, content, extracted data, metadata, etc.
    """
    # Validate URL
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return {
                "success": False,
                "url": url,
                "error": "Invalid URL - must include http:// or https://",
            }
    except Exception:
        return {"success": False, "url": url, "error": "Invalid URL format"}

    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

        # Build extraction strategy
        ext_strategy = None
        if extraction_strategy:
            ext_strategy = _build_extraction_strategy(
                strategy_type=extraction_strategy,
                schema=schema,
                instruction=instruction,
                semantic_filter=semantic_filter,
                regex_patterns=regex_patterns,
            )

        # Build content filter via markdown_generator (0.7.8+ API)
        from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

        md_generator = None
        if content_filter:
            cont_filter = _build_content_filter(
                filter_type=content_filter, query=filter_query
            )
            md_generator = DefaultMarkdownGenerator(content_filter=cont_filter)

        # Configure browser
        browser_config = BrowserConfig(
            headless=headless,
            verbose=False,
        )

        # Configure crawl
        crawl_config = CrawlerRunConfig(
            word_count_threshold=10,
            excluded_tags=["nav", "footer", "aside", "script", "style", "noscript"],
            remove_overlay_elements=remove_overlays,
            cache_mode=CacheMode.DISABLED,  # Always fresh data
            # Extraction
            extraction_strategy=ext_strategy,
            # Markdown generator with content filter
            markdown_generator=md_generator,
            # JS execution
            js_code=js_code,
            wait_for=wait_for,
            # Screenshots/PDF
            screenshot=screenshot,
            pdf=pdf,
            # Session
            session_id=session_id,
            # Anti-bot / Stealth
            simulate_user=simulate_user or magic_mode,
            override_navigator=stealth_mode or magic_mode,
            magic=magic_mode,
            # Page scanning
            scan_full_page=scan_full_page,
            process_iframes=process_iframes,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await asyncio.wait_for(
                crawler.arun(url=url, config=crawl_config), timeout=timeout
            )

            if not result.success:
                return {
                    "success": False,
                    "url": url,
                    "error": f"Failed to fetch page: {result.error_message or 'Unknown error'}",
                }

            # Build response based on output format
            response = {
                "success": True,
                "url": url,
                "title": result.metadata.get("title", "") if result.metadata else "",
            }

            # Content based on format
            if output_format == "fit_markdown" and result.fit_markdown:
                response["markdown"] = result.fit_markdown
            elif output_format == "html" and result.html:
                response["html"] = result.html
            else:
                response["markdown"] = result.markdown or ""

            # Raw HTML if requested
            if include_raw_html and result.html:
                response["raw_html"] = result.html

            # Extracted content from strategy
            if result.extracted_content:
                try:
                    import json

                    response["extracted"] = json.loads(result.extracted_content)
                except (json.JSONDecodeError, TypeError):
                    response["extracted"] = result.extracted_content

            # Include links if requested
            if include_links and result.links:
                internal = result.links.get("internal", [])
                external = result.links.get("external", [])
                response["links"] = {
                    "internal": [l.get("href") for l in internal[:30] if l.get("href")],
                    "external": [l.get("href") for l in external[:30] if l.get("href")],
                }

            # Include images if requested
            if include_images and result.media:
                images = result.media.get("images", [])
                response["images"] = [
                    img.get("src") for img in images[:20] if img.get("src")
                ]

            # Include tables if requested
            if include_tables and hasattr(result, "media") and result.media:
                tables = result.media.get("tables", [])
                if tables:
                    response["tables"] = tables

            # Screenshot
            if screenshot and result.screenshot:
                response["screenshot_base64"] = result.screenshot

            # PDF
            if pdf and result.pdf:
                response["pdf_base64"] = result.pdf

            # Metadata
            if result.metadata:
                response["metadata"] = {
                    k: v
                    for k, v in result.metadata.items()
                    if k in ["title", "description", "author", "language", "og:image"]
                }

            return response

    except asyncio.TimeoutError:
        return {
            "success": False,
            "url": url,
            "error": f"Timeout after {timeout}s - page took too long to load",
        }
    except ImportError as e:
        return {
            "success": False,
            "url": url,
            "error": f"crawl4ai not installed or missing dependency: {e}",
        }
    except Exception as e:
        logger.error(f"Scrape error for {url}: {e}")
        return {"success": False, "url": url, "error": str(e)}


# =============================================================================
# EXTRACTION STRATEGY BUILDERS
# =============================================================================


def _build_extraction_strategy(
    strategy_type: str,
    schema: Optional[Dict] = None,
    instruction: Optional[str] = None,
    semantic_filter: Optional[str] = None,
    regex_patterns: Optional[List[str]] = None,
):
    """Build the appropriate extraction strategy."""

    if strategy_type == "llm":
        from crawl4ai import LLMExtractionStrategy, LLMConfig

        # Use Pollinations API as LLM provider
        llm_config = LLMConfig(
            provider="openai/gpt-4o-mini",  # Will be overridden by our custom extraction
            api_token="dummy",  # We use our own LLM call
        )

        return LLMExtractionStrategy(
            llm_config=llm_config,
            instruction=instruction or "Extract the main content and key information.",
            schema=schema,
            extraction_type="schema" if schema else "block",
            apply_chunking=True,
            chunk_token_threshold=4000,
            overlap_rate=0.1,
            input_format="markdown",
        )

    elif strategy_type == "css":
        from crawl4ai import JsonCssExtractionStrategy

        if not schema:
            raise ValueError("schema required for CSS extraction strategy")

        return JsonCssExtractionStrategy(schema=schema, verbose=False)

    elif strategy_type == "xpath":
        from crawl4ai import JsonXPathExtractionStrategy

        if not schema:
            raise ValueError("schema required for XPath extraction strategy")

        return JsonXPathExtractionStrategy(schema=schema, verbose=False)

    elif strategy_type == "cosine":
        from crawl4ai import CosineStrategy

        return CosineStrategy(
            semantic_filter=semantic_filter,
            word_count_threshold=20,
            max_dist=0.2,
            top_k=5,
            sim_threshold=0.3,
            model_name="sentence-transformers/all-MiniLM-L6-v2",
        )

    elif strategy_type == "regex":
        from crawl4ai import RegexExtractionStrategy

        # Map pattern names to flags
        pattern_map = {
            "email": RegexExtractionStrategy.Email,
            "phone": RegexExtractionStrategy.PhoneIntl,
            "url": RegexExtractionStrategy.URL,
            "date": RegexExtractionStrategy.DateISO,
            "currency": RegexExtractionStrategy.Currency,
            "ip": RegexExtractionStrategy.IPV4,
            "hashtag": RegexExtractionStrategy.Hashtag,
            "twitter": RegexExtractionStrategy.TwitterHandle,
            "all": RegexExtractionStrategy.All,
        }

        patterns = regex_patterns or ["email", "url", "phone"]
        combined_pattern = RegexExtractionStrategy.Nothing
        for p in patterns:
            if p.lower() in pattern_map:
                combined_pattern |= pattern_map[p.lower()]

        return RegexExtractionStrategy(pattern=combined_pattern)

    else:
        raise ValueError(f"Unknown extraction strategy: {strategy_type}")


def _build_content_filter(filter_type: str, query: Optional[str] = None):
    """Build content filter strategy."""

    if filter_type == "bm25":
        from crawl4ai import BM25ContentFilter

        return BM25ContentFilter(
            user_query=query, bm25_threshold=1.0, language="english"
        )

    elif filter_type == "pruning":
        from crawl4ai import PruningContentFilter

        return PruningContentFilter(
            user_query=query, threshold=0.48, threshold_type="fixed"
        )

    elif filter_type == "llm":
        from crawl4ai import LLMContentFilter, LLMConfig

        return LLMContentFilter(
            llm_config=LLMConfig(provider="openai/gpt-4o-mini", api_token="dummy"),
            instruction=query or "Extract relevant content",
        )

    else:
        raise ValueError(f"Unknown content filter: {filter_type}")


# =============================================================================
# MULTI-URL SCRAPING
# =============================================================================


async def scrape_multiple(
    urls: list[str],
    extraction_strategy: Optional[str] = None,
    schema: Optional[Dict] = None,
    instruction: Optional[str] = None,
    max_concurrent: int = 5,
    timeout: int = 30,
) -> dict:
    """
    Scrape multiple URLs concurrently.

    Args:
        urls: List of URLs to scrape (max 10)
        extraction_strategy: Strategy to apply to all URLs
        schema: Schema for structured extraction
        instruction: LLM instruction
        max_concurrent: Max concurrent requests
        timeout: Per-URL timeout

    Returns:
        Dict with results array and success/fail counts
    """
    if not urls:
        return {"success": False, "error": "No URLs provided", "results": []}

    # Limit URLs
    urls = urls[:10]

    semaphore = asyncio.Semaphore(max_concurrent)

    async def scrape_with_limit(url: str) -> dict:
        async with semaphore:
            return await scrape_url(
                url=url,
                extraction_strategy=extraction_strategy,
                schema=schema,
                instruction=instruction,
                timeout=timeout,
            )

    tasks = [scrape_with_limit(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    processed_results = []
    succeeded = 0
    failed = 0

    for url, result in zip(urls, results):
        if isinstance(result, Exception):
            processed_results.append(
                {"success": False, "url": url, "error": str(result)}
            )
            failed += 1
        elif result.get("success"):
            processed_results.append(result)
            succeeded += 1
        else:
            processed_results.append(result)
            failed += 1

    return {
        "success": succeeded > 0,
        "results": processed_results,
        "succeeded": succeeded,
        "failed": failed,
        "total": len(urls),
    }


# =============================================================================
# FILE/RAW CONTENT PARSING - For Discord attachments
# =============================================================================


async def parse_file_content(
    content: str,
    file_type: str = "text",
    instruction: Optional[str] = None,
    extract_patterns: Optional[List[str]] = None,
) -> dict:
    """
    Parse raw file content (for Discord attachments).

    Args:
        content: The raw file content
        file_type: Type hint - "code", "log", "json", "yaml", "text"
        instruction: Optional LLM instruction for extraction
        extract_patterns: Regex patterns to extract ["email", "url", etc.]

    Returns:
        Dict with parsed/extracted content
    """
    response = {
        "success": True,
        "file_type": file_type,
        "length": len(content),
        "content": content,
    }

    # Try to detect file type from content
    if file_type == "text":
        if content.strip().startswith(("{", "[")):
            file_type = "json"
        elif "def " in content or "import " in content or "class " in content:
            file_type = "code"
        elif re.search(r"^\d{4}-\d{2}-\d{2}", content, re.MULTILINE):
            file_type = "log"

    response["detected_type"] = file_type

    # JSON parsing
    if file_type == "json":
        try:
            import json

            response["parsed"] = json.loads(content)
            response["content"] = None  # Don't duplicate
        except json.JSONDecodeError as e:
            response["parse_error"] = str(e)

    # YAML parsing
    elif file_type == "yaml":
        try:
            import yaml

            response["parsed"] = yaml.safe_load(content)
            response["content"] = None
        except Exception as e:
            response["parse_error"] = str(e)

    # Regex extraction
    if extract_patterns:
        try:
            from crawl4ai import RegexExtractionStrategy

            pattern_map = {
                "email": RegexExtractionStrategy.Email,
                "phone": RegexExtractionStrategy.PhoneIntl,
                "url": RegexExtractionStrategy.URL,
                "date": RegexExtractionStrategy.DateISO,
                "ip": RegexExtractionStrategy.IPV4,
            }

            combined = RegexExtractionStrategy.Nothing
            for p in extract_patterns:
                if p.lower() in pattern_map:
                    combined |= pattern_map[p.lower()]

            if combined != RegexExtractionStrategy.Nothing:
                strategy = RegexExtractionStrategy(
                    pattern=combined, input_format="text"
                )
                extracted = strategy.extract("file", content)
                response["extracted_patterns"] = extracted
        except ImportError:
            pass

    # LLM extraction if instruction provided
    if instruction:
        try:
            extracted = await _llm_extract(content, instruction)
            if extracted:
                response["llm_extracted"] = extracted
        except Exception as e:
            response["llm_error"] = str(e)

    return response


async def fetch_discord_attachment(
    attachment_url: str,
    file_type: Optional[str] = None,
    instruction: Optional[str] = None,
) -> dict:
    """
    Fetch and parse a Discord attachment URL.

    Args:
        attachment_url: Discord CDN URL
        file_type: Optional type hint
        instruction: Optional LLM extraction instruction

    Returns:
        Parsed file content
    """
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                attachment_url, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status != 200:
                    return {"success": False, "error": f"HTTP {resp.status}"}

                content = await resp.text()

                # Detect file type from URL if not provided
                if not file_type:
                    url_lower = attachment_url.lower()
                    if any(
                        ext in url_lower
                        for ext in [
                            ".py",
                            ".js",
                            ".ts",
                            ".java",
                            ".cpp",
                            ".c",
                            ".go",
                            ".rs",
                        ]
                    ):
                        file_type = "code"
                    elif ".json" in url_lower:
                        file_type = "json"
                    elif any(ext in url_lower for ext in [".yaml", ".yml"]):
                        file_type = "yaml"
                    elif ".log" in url_lower:
                        file_type = "log"
                    else:
                        file_type = "text"

                return await parse_file_content(
                    content=content, file_type=file_type, instruction=instruction
                )

    except asyncio.TimeoutError:
        return {"success": False, "error": "Timeout fetching attachment"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# LLM EXTRACTION HELPER - Uses Pollinations API
# =============================================================================


async def _llm_extract(content: str, instruction: str) -> Optional[str]:
    """Use Pollinations AI to extract specific information."""
    try:
        from .pollinations import pollinations_client

        result = await pollinations_client.generate_text(
            system_prompt=(
                "You are a precise data extraction assistant. "
                "Extract ONLY the requested information from the content. "
                "Be concise and structured. Use bullet points or JSON if appropriate. "
                "If the requested information is not found, say 'Not found'."
            ),
            user_prompt=f"Content:\n{content}\n\n---\nExtract: {instruction}",
            temperature=0.3,
        )

        return result

    except Exception as e:
        logger.warning(f"LLM extraction failed: {e}")
        return None


# =============================================================================
# TOOL HANDLER - Called by the AI
# =============================================================================


async def web_scrape_handler(
    action: str = "scrape",
    url: Optional[str] = None,
    urls: Optional[list[str]] = None,
    # Extraction options
    strategy: Optional[str] = None,  # "llm", "css", "xpath", "cosine", "regex"
    schema: Optional[Dict] = None,
    extract: Optional[str] = None,  # LLM instruction
    semantic_filter: Optional[str] = None,
    patterns: Optional[List[str]] = None,  # Regex patterns
    # Content filter
    content_filter: Optional[str] = None,
    filter_query: Optional[str] = None,
    # Output options
    include_links: bool = False,
    include_images: bool = False,
    include_tables: bool = False,
    output_format: str = "markdown",
    # Browser options
    js_code: Optional[str] = None,
    wait_for: Optional[str] = None,
    screenshot: bool = False,
    # Anti-bot / stealth options
    stealth_mode: bool = False,
    simulate_user: bool = False,
    magic_mode: bool = False,
    # Page scanning options
    scan_full_page: bool = False,
    process_iframes: bool = False,
    # Session
    session_id: Optional[str] = None,
    # File parsing
    file_url: Optional[str] = None,
    file_content: Optional[str] = None,
    file_type: Optional[str] = None,
    **kwargs,
) -> dict:
    """
    Handle web_scrape tool calls - full Crawl4AI power.

    Actions:
    - scrape: Single URL → markdown/extracted content
    - multi: Multiple URLs concurrently
    - extract: Scrape + LLM extraction
    - css_extract: Scrape + CSS schema extraction (fast, no LLM)
    - semantic: Scrape + cosine similarity clustering
    - regex: Scrape + pattern matching (emails, URLs, etc.)
    - parse_file: Parse raw file content (Discord attachments)
    - fetch_file: Fetch + parse file from URL

    Args:
        action: The operation to perform
        url: Single URL (for scrape/extract)
        urls: List of URLs (for multi)
        strategy: Extraction strategy override
        schema: CSS/XPath schema for structured extraction
        extract: LLM extraction instruction
        semantic_filter: Keywords for semantic filtering
        patterns: Regex patterns ["email", "url", "phone", "all"]
        content_filter: Pre-filter - "bm25", "pruning"
        filter_query: Query for content filtering
        include_links: Include page links
        include_images: Include image URLs
        include_tables: Extract tables as structured data
        output_format: "markdown", "fit_markdown", "html"
        js_code: JavaScript to run before extraction
        wait_for: CSS selector to wait for
        screenshot: Capture screenshot
        stealth_mode: Enable stealth to avoid bot detection
        simulate_user: Simulate human behavior
        magic_mode: Auto anti-bot bypass (stealth + simulation)
        scan_full_page: Scroll to load lazy content
        process_iframes: Extract iframe content
        session_id: Reuse browser session
        file_url: Discord attachment URL to fetch
        file_content: Raw file content to parse
        file_type: File type hint

    Returns:
        Scraped/extracted content ready for AI consumption
    """

    # File parsing actions
    if action == "parse_file":
        if not file_content:
            return {"error": "file_content required for parse_file action"}
        return await parse_file_content(
            content=file_content,
            file_type=file_type or "text",
            instruction=extract,
            extract_patterns=patterns,
        )

    if action == "fetch_file":
        if not file_url:
            return {"error": "file_url required for fetch_file action"}
        return await fetch_discord_attachment(
            attachment_url=file_url, file_type=file_type, instruction=extract
        )

    # URL-based actions
    if action == "scrape":
        if not url:
            return {"error": "url parameter required for scrape action"}
        return await scrape_url(
            url=url,
            extraction_strategy=strategy,
            schema=schema,
            instruction=extract,
            semantic_filter=semantic_filter,
            regex_patterns=patterns,
            content_filter=content_filter,
            filter_query=filter_query,
            include_links=include_links,
            include_images=include_images,
            include_tables=include_tables,
            output_format=output_format,
            js_code=js_code,
            wait_for=wait_for,
            screenshot=screenshot,
            stealth_mode=stealth_mode,
            simulate_user=simulate_user,
            magic_mode=magic_mode,
            scan_full_page=scan_full_page,
            process_iframes=process_iframes,
            session_id=session_id,
        )

    elif action == "extract":
        if not url:
            return {"error": "url parameter required for extract action"}
        if not extract:
            return {"error": "extract parameter required - describe what to extract"}
        return await scrape_url(
            url=url,
            extraction_strategy="llm",
            instruction=extract,
            schema=schema,
            content_filter=content_filter,
            filter_query=filter_query,
            include_links=include_links,
            include_images=include_images,
            include_tables=include_tables,
            stealth_mode=stealth_mode,
            simulate_user=simulate_user,
            magic_mode=magic_mode,
            scan_full_page=scan_full_page,
            process_iframes=process_iframes,
            session_id=session_id,
        )

    elif action == "css_extract":
        if not url:
            return {"error": "url parameter required"}
        if not schema:
            return {"error": "schema required for CSS extraction"}
        return await scrape_url(
            url=url,
            extraction_strategy="css",
            schema=schema,
            include_links=include_links,
            include_images=include_images,
            include_tables=include_tables,
            stealth_mode=stealth_mode,
            magic_mode=magic_mode,
            scan_full_page=scan_full_page,
            process_iframes=process_iframes,
            session_id=session_id,
        )

    elif action == "semantic":
        if not url:
            return {"error": "url parameter required"}
        return await scrape_url(
            url=url,
            extraction_strategy="cosine",
            semantic_filter=semantic_filter or filter_query,
            content_filter=content_filter,
            filter_query=filter_query,
            stealth_mode=stealth_mode,
            magic_mode=magic_mode,
            scan_full_page=scan_full_page,
            process_iframes=process_iframes,
            session_id=session_id,
        )

    elif action == "regex":
        if not url:
            return {"error": "url parameter required"}
        return await scrape_url(
            url=url,
            extraction_strategy="regex",
            regex_patterns=patterns or ["email", "url", "phone"],
            stealth_mode=stealth_mode,
            magic_mode=magic_mode,
            scan_full_page=scan_full_page,
            process_iframes=process_iframes,
            session_id=session_id,
        )

    elif action == "multi":
        if not urls:
            return {"error": "urls parameter required for multi action (list of URLs)"}
        return await scrape_multiple(
            urls=urls, extraction_strategy=strategy, schema=schema, instruction=extract
        )

    else:
        return {
            "error": f"Unknown action: {action}",
            "available_actions": [
                "scrape - Single URL to markdown",
                "extract - URL + LLM extraction",
                "css_extract - URL + CSS schema (fast)",
                "semantic - URL + cosine clustering",
                "regex - URL + pattern extraction",
                "multi - Multiple URLs",
                "parse_file - Parse raw content",
                "fetch_file - Fetch + parse URL",
            ],
        }
