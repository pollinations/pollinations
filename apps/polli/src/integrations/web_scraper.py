import asyncio
import json
import logging
import multiprocessing
import os
import queue
import threading
import time
from html import unescape
from typing import Any

from ..utils.regex import re
from ..utils.url import parse_url

logger = logging.getLogger(__name__)

# Crawl4AI owns Chromium and binds its Playwright objects to an event loop. A dedicated
# thread makes one browser safe for both Discord and Granian's independent ASGI loop.
_BROWSER_CONCURRENCY = 2
_BROWSER_QUEUE_SIZE = 2
_SEMANTIC_CONCURRENCY = 1
_crawler_pool: "_SharedCrawlerPool | None" = None
_crawler_pool_lock = threading.Lock()
_semantic_slots = threading.BoundedSemaphore(_SEMANTIC_CONCURRENCY)


class _SharedCrawlerPool:
    def __init__(self, browser_config: Any):
        self.browser_config = browser_config
        self.loop = asyncio.new_event_loop()
        self.ready = threading.Event()
        self.tabs = threading.BoundedSemaphore(_BROWSER_CONCURRENCY + _BROWSER_QUEUE_SIZE)
        self.active_tabs = asyncio.BoundedSemaphore(_BROWSER_CONCURRENCY)
        self.start_lock: asyncio.Lock | None = None
        self.closing = False
        self.tasks: set[asyncio.Task[Any]] = set()
        self.submission_lock = threading.Lock()
        self.thread = threading.Thread(target=self._run_loop, daemon=True, name="polli-crawl4ai")
        self.crawler: Any | None = None
        self.start_error: BaseException | None = None
        self.thread.start()
        self.ready.wait()
        if self.start_error:
            raise self.start_error

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.ready.set()
        self.loop.run_forever()
        self.loop.close()

    async def _get_crawler(self) -> Any:
        if self.start_lock is None:
            self.start_lock = asyncio.Lock()
        async with self.start_lock:
            if self.crawler is None:
                from crawl4ai import AsyncWebCrawler

                crawler = AsyncWebCrawler(config=self.browser_config)
                try:
                    await crawler.start()
                except BaseException:
                    await crawler.close()
                    raise
                self.crawler = crawler
        return self.crawler

    async def _run(self, url: str, crawl_config: Any, timeout: int) -> Any:
        task = asyncio.current_task()
        if task is not None:
            self.tasks.add(task)
        acquired_active_tab = False
        try:
            await asyncio.wait_for(self.active_tabs.acquire(), timeout=timeout)
            acquired_active_tab = True
            crawler = await asyncio.wait_for(self._get_crawler(), timeout=timeout)
            return await asyncio.wait_for(crawler.arun(url=url, config=crawl_config), timeout=timeout)
        finally:
            if acquired_active_tab:
                self.active_tabs.release()
            if task is not None:
                self.tasks.discard(task)
            self.tabs.release()

    async def submit(self, url: str, crawl_config: Any, timeout: int) -> Any:
        with self.submission_lock:
            if self.closing or not self.tabs.acquire(blocking=False):
                raise RuntimeError("Browser scraper is busy; try again shortly.")
            coroutine = self._run(url, crawl_config, timeout)
            try:
                future = asyncio.run_coroutine_threadsafe(coroutine, self.loop)
            except BaseException:
                coroutine.close()
                self.tabs.release()
                raise
        try:
            return await asyncio.wrap_future(future)
        except asyncio.CancelledError:
            future.cancel()
            raise

    async def close(self) -> None:
        with self.submission_lock:
            self.closing = True

        async def close_crawler() -> None:
            active = list(self.tasks)
            for task in active:
                task.cancel()
            if active:
                await asyncio.gather(*active, return_exceptions=True)
            if self.crawler is not None:
                await self.crawler.close()
                self.crawler = None

        future = asyncio.run_coroutine_threadsafe(close_crawler(), self.loop)
        await asyncio.wrap_future(future)
        self.loop.call_soon_threadsafe(self.loop.stop)
        await asyncio.to_thread(self.thread.join)


async def close_web_scraper() -> None:
    """Close the shared Crawl4AI browser during application shutdown."""
    global _crawler_pool
    with _crawler_pool_lock:
        pool, _crawler_pool = _crawler_pool, None
    if pool is not None:
        await pool.close()


def _get_shared_crawler(browser_config: Any) -> _SharedCrawlerPool:
    global _crawler_pool
    with _crawler_pool_lock:
        if _crawler_pool is None:
            _crawler_pool = _SharedCrawlerPool(browser_config)
        elif getattr(_crawler_pool.browser_config, "headless", None) != getattr(browser_config, "headless", None):
            raise ValueError(
                "The shared Crawl4AI browser configuration does not support changing headless mode per request."
            )
        return _crawler_pool


def _semantic_worker(output: Any, url: str, markdown: str, semantic_filter: str | None) -> None:
    """Run Crawl4AI's synchronous embedding stack outside the service process."""
    try:
        for variable in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
            os.environ[variable] = "1"
        import torch

        torch.set_num_threads(1)
        from crawl4ai import CosineStrategy
        from crawl4ai.chunking_strategy import RegexChunking

        class SingleChunkCosineStrategy(CosineStrategy):
            def hierarchical_clustering(self, sentences):
                if len(sentences) == 1:
                    return [0]
                return super().hierarchical_clustering(sentences)

        strategy = SingleChunkCosineStrategy(
            semantic_filter=semantic_filter,
            word_count_threshold=20,
            max_dist=0.2,
            top_k=5,
            sim_threshold=0.3,
            model_name="sentence-transformers/all-MiniLM-L6-v2",
        )
        output.put((True, strategy.run(url, RegexChunking().chunk(markdown))))
    except BaseException as error:
        output.put((False, str(error)))


async def _semantic_extract(url: str, markdown: str, semantic_filter: str | None, timeout: int) -> str:
    """Hard-stop an isolated semantic worker rather than blocking Polli's event loop."""
    if not _semantic_slots.acquire(blocking=False):
        raise RuntimeError("Semantic extractor is busy; try again shortly.")
    output: Any | None = None
    process: Any | None = None
    started = False
    try:
        context = multiprocessing.get_context("spawn")
        output = context.Queue(maxsize=1)
        process = context.Process(target=_semantic_worker, args=(output, url, markdown, semantic_filter))
        process.start()
        started = True
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                success, value = output.get_nowait()
                if success:
                    return json.dumps(value, ensure_ascii=False)
                raise RuntimeError(f"Semantic extraction failed: {value}")
            except queue.Empty:
                await asyncio.sleep(0.01)
        raise TimeoutError
    finally:
        if started and process is not None:
            if process.is_alive():
                process.terminate()
            cleanup_deadline = time.monotonic() + 1
            while process.is_alive() and time.monotonic() < cleanup_deadline:
                await asyncio.sleep(0.01)
            if process.is_alive():
                process.kill()
                while process.is_alive():
                    await asyncio.sleep(0.01)
            process.join()
        if output is not None:
            output.close()
        _semantic_slots.release()


_BOT_MARKERS = [
    "cloudflare",
    "captcha",
    "just a moment",
    "checking your browser",
    "access denied",
    "please enable javascript",
    "are you a robot",
    "security check",
    "ddos protection",
    "cf-browser-verification",
    "recaptcha",
]


def _is_bot_blocked(html: str, status: int) -> bool:
    if status in (403, 429, 503):
        return True
    if len(html) < 1500:
        lower = html.lower()
        return any(m in lower for m in _BOT_MARKERS)
    return False


def _html_to_markdown(html: str) -> str:
    try:
        import html2text

        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = True
        h.body_width = 0
        h.unicode_snob = True
        return h.handle(html).strip()
    except ImportError:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "footer", "aside"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)


def _regex_pattern_map(regex_strategy: Any) -> dict[str, Any]:
    """Map public Crawl4AI 0.9 preset names to its exact IntFlag constants."""
    return {
        "email": regex_strategy.Email,
        "phone": regex_strategy.PhoneIntl,
        "url": regex_strategy.Url,
        "date": regex_strategy.DateIso,
        "currency": regex_strategy.Currency,
        "ip": regex_strategy.IPv4,
        "hashtag": regex_strategy.Hashtag,
        "twitter": regex_strategy.TwitterHandle,
        "all": regex_strategy.All,
    }


def _needs_browser(
    output_format: str,
    extraction_strategy: str | None,
    content_filter: str | None,
    js_code: str | None,
    wait_for: str | None,
    screenshot: bool,
    pdf: bool,
    stealth_mode: bool,
    simulate_user: bool,
    magic_mode: bool,
    process_iframes: bool,
    include_links: bool,
    include_images: bool,
    include_tables: bool,
) -> bool:
    return bool(
        output_format in ("fit_markdown", "html")
        or extraction_strategy
        or content_filter
        or js_code
        or wait_for
        or screenshot
        or pdf
        or stealth_mode
        or simulate_user
        or magic_mode
        or process_iframes
        or include_links
        or include_images
        or include_tables
    )


async def _try_rnet(url: str, timeout: int) -> str | None:
    try:
        from rnet import Client, Impersonate

        client = Client(
            timeout=timeout,
            impersonate=Impersonate.Chrome136,
        )
        resp = await client.get(url)
        status = resp.status
        if status in (403, 429, 503):
            return None
        html = await resp.text()
        if not html or _is_bot_blocked(html, status):
            return None
        md = _html_to_markdown(html)
        return md if md and len(md) > 50 else None
    except Exception as e:
        logger.debug(f"rnet failed for {url}: {e}")
        return None


async def _try_scrapling(url: str, timeout: int) -> str | None:
    try:
        from scrapling.fetchers import AsyncFetcher

        page = await asyncio.wait_for(
            AsyncFetcher.get(url, follow_redirects="safe"),
            timeout=timeout,
        )
        html = page.html_content if hasattr(page, "html_content") else ""
        if not html:
            html = page.body.decode(page.encoding or "utf-8", errors="replace") if hasattr(page, "body") else ""
        if not html or _is_bot_blocked(html, page.status):
            return None
        md = page.markdown(main_content_only=True)
        if not md or not md.strip():
            md = _html_to_markdown(html)
        return md if md and len(md) > 50 else None
    except Exception as e:
        logger.debug(f"scrapling failed for {url}: {e}")
        return None


X_HOSTS = {"x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"}
FXTWITTER_API = "https://api.fxtwitter.com"

# A login wall answers 200 with a page full of chrome and no article. Passing that back as
# a successful scrape is worse than failing: the model cannot tell it apart from real
# content and will happily summarise the navigation menu.
LOGIN_WALL_MARKERS = (
    "log in to x",
    "sign in to x",
    "sign up for twitter",
    "javascript is not available",
    "enable javascript and cookies to continue",
    "you must log in to continue",
    "please log in to continue",
    "attention required! | cloudflare",
    "verify you are human",
    "whoa there, pardner",
    "your request has been blocked",
)


def _looks_like_login_wall(text: str) -> bool:
    """Whether scraped text is a gate rather than the page that was asked for."""
    if not text:
        return False
    head = text[:4000].lower()
    if not any(marker in head for marker in LOGIN_WALL_MARKERS):
        return False
    # Long pages that merely mention logging in are usually genuine articles, so only
    # treat this as a wall when there is little else on the page.
    return len(text.strip()) < 8000


def _format_x_content(payload: dict) -> tuple[str, str] | None:
    """Render an fxtwitter payload as (title, markdown)."""
    tweet = payload.get("tweet")
    if tweet:
        author = tweet.get("author") or {}
        handle = author.get("screen_name", "unknown")
        name = author.get("name", handle)
        lines = [
            f"# Post by {name} (@{handle})",
            "",
            tweet.get("text", ""),
            "",
            f"- Posted: {tweet.get('created_at', 'unknown')}",
            f"- Likes: {tweet.get('likes', 0):,} | Reposts: {tweet.get('retweets', 0):,} "
            f"| Replies: {tweet.get('replies', 0):,}",
            f"- URL: {tweet.get('url', '')}",
        ]
        if tweet.get("replying_to"):
            lines.append(f"- Replying to: @{tweet['replying_to']}")
        media = (tweet.get("media") or {}).get("all") or []
        for item in media:
            if item.get("url"):
                lines.append(f"- Media ({item.get('type', 'media')}): {item['url']}")
        note = tweet.get("community_note")
        if note:
            lines += ["", "**Community note:**", str(note)[:1500]]
        return f"Post by @{handle}", "\n".join(lines)

    user = payload.get("user")
    if user:
        handle = user.get("screen_name", "unknown")
        lines = [
            f"# @{handle} — {user.get('name', '')}".rstrip(),
            "",
            user.get("description", ""),
            "",
            f"- Followers: {user.get('followers', 0):,} | Following: {user.get('following', 0):,}",
            f"- Posts: {user.get('tweets', 0):,}",
            f"- URL: {user.get('url', '')}",
        ]
        return f"@{handle}", "\n".join(lines)

    return None


async def _try_x_api(url: str, timeout: int) -> dict | None:
    """Read an x.com URL through fxtwitter's public JSON API.

    x.com serves a login wall to anything without a session, so scraping it yields
    navigation text rather than the post. fxtwitter returns the post itself, needs no
    credentials, and works from a datacenter IP.
    """
    parsed = parse_url(url)
    if parsed.netloc.lower() not in X_HOSTS:
        return None

    path = parsed.path.rstrip("/")
    if not path or path == "/":
        return None

    api_url = f"{FXTWITTER_API}{path}"
    try:
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                api_url,
                headers={"User-Agent": "polli-bot/1.0"},
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as response:
                if response.status != 200:
                    logger.debug("fxtwitter returned %s for %s", response.status, url)
                    return None
                payload = await response.json(content_type=None)
    except Exception as e:
        logger.debug("fxtwitter request failed for %s: %s", url, e)
        return None

    if payload.get("code") != 200:
        return None

    formatted = _format_x_content(payload)
    if not formatted:
        return None

    title, markdown = formatted
    return {"success": True, "url": url, "title": title, "markdown": markdown, "_fetcher": "fxtwitter"}


async def _try_jina(url: str, timeout: int) -> str | None:
    """Last-resort read through Jina Reader, which fetches from its own infrastructure.

    Useful when the target blocks this host specifically. It cannot defeat a block that
    also covers Jina, so callers must still handle failure.
    """
    try:
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://r.jina.ai/{url}",
                headers={"User-Agent": "polli-bot/1.0", "X-Return-Format": "markdown"},
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as response:
                if response.status != 200:
                    return None
                text = await response.text()
    except Exception as e:
        logger.debug("Jina Reader failed for %s: %s", url, e)
        return None

    if not text or _looks_like_login_wall(text):
        return None
    return text


async def scrape_url(
    url: str,
    extraction_strategy: str | None = None,
    schema: dict[str, Any] | None = None,
    instruction: str | None = None,
    semantic_filter: str | None = None,
    regex_patterns: list[str] | None = None,
    content_filter: str | None = None,
    filter_query: str | None = None,
    include_links: bool = False,
    include_images: bool = False,
    include_raw_html: bool = False,
    include_tables: bool = False,
    output_format: str = "markdown",
    js_code: str | None = None,
    wait_for: str | None = None,
    screenshot: bool = False,
    pdf: bool = False,
    stealth_mode: bool = False,
    simulate_user: bool = False,
    magic_mode: bool = False,
    scan_full_page: bool = False,
    process_iframes: bool = False,
    remove_overlays: bool = True,
    timeout: int = 30,
    headless: bool = True,
    session_id: str | None = None,
) -> dict:
    try:
        parsed = parse_url(url)
        if not parsed.scheme or not parsed.netloc:
            return {
                "success": False,
                "url": url,
                "error": "Invalid URL - must include http:// or https://",
            }
    except Exception:
        return {"success": False, "url": url, "error": "Invalid URL format"}

    # ── Layer 0: x.com via fxtwitter ──────────────────────────────────────────
    # Ahead of the generic fetchers because they can only ever reach the login wall.
    x_result = await _try_x_api(url, min(timeout, 15))
    if x_result:
        logger.debug(f"fxtwitter succeeded for {url}")
        return x_result

    # ── Layer 1: rnet (Rust HTTP + Chrome TLS) ────────────────────────────────
    # ── Layer 2: scrapling AsyncFetcher (curl_cffi stealth) ──────────────────
    # Fast path for basic markdown — skip browser entirely when not needed.
    if not _needs_browser(
        output_format=output_format,
        extraction_strategy=extraction_strategy,
        content_filter=content_filter,
        js_code=js_code,
        wait_for=wait_for,
        screenshot=screenshot,
        pdf=pdf,
        stealth_mode=stealth_mode,
        simulate_user=simulate_user,
        magic_mode=magic_mode,
        process_iframes=process_iframes,
        include_links=include_links,
        include_images=include_images,
        include_tables=include_tables,
    ):
        rnet_timeout = min(timeout, 12)
        md = await _try_rnet(url, rnet_timeout)
        if md and not _looks_like_login_wall(md):
            logger.debug(f"rnet succeeded for {url}")
            return {"success": True, "url": url, "title": "", "markdown": md, "_fetcher": "rnet"}

        scrapling_timeout = min(timeout, 18)
        md = await _try_scrapling(url, scrapling_timeout)
        if md and not _looks_like_login_wall(md):
            logger.debug(f"scrapling succeeded for {url}")
            return {"success": True, "url": url, "title": "", "markdown": md, "_fetcher": "scrapling"}

        # Reaching a login wall means this host is the problem, so ask Jina to fetch it
        # from elsewhere before spending a browser launch on the same wall.
        jina_md = await _try_jina(url, min(timeout, 25))
        if jina_md:
            logger.debug(f"jina succeeded for {url}")
            return {"success": True, "url": url, "title": "", "markdown": jina_md, "_fetcher": "jina"}

        logger.debug(f"rnet+scrapling+jina all failed for {url}, falling back to crawl4ai")

    # ── Layer 3: crawl4ai (Playwright browser) ────────────────────────────────
    # Used when: browser features needed, or rnet/scrapling returned empty.
    return await _scrape_with_crawl4ai(
        url=url,
        extraction_strategy=extraction_strategy,
        schema=schema,
        instruction=instruction,
        semantic_filter=semantic_filter,
        regex_patterns=regex_patterns,
        content_filter=content_filter,
        filter_query=filter_query,
        include_links=include_links,
        include_images=include_images,
        include_raw_html=include_raw_html,
        include_tables=include_tables,
        output_format=output_format,
        js_code=js_code,
        wait_for=wait_for,
        screenshot=screenshot,
        pdf=pdf,
        stealth_mode=stealth_mode,
        simulate_user=simulate_user,
        magic_mode=magic_mode,
        scan_full_page=scan_full_page,
        process_iframes=process_iframes,
        remove_overlays=remove_overlays,
        timeout=timeout,
        headless=headless,
        session_id=session_id,
    )


async def _scrape_with_crawl4ai(
    url: str,
    extraction_strategy: str | None = None,
    schema: dict[str, Any] | None = None,
    instruction: str | None = None,
    semantic_filter: str | None = None,
    regex_patterns: list[str] | None = None,
    content_filter: str | None = None,
    filter_query: str | None = None,
    include_links: bool = False,
    include_images: bool = False,
    include_raw_html: bool = False,
    include_tables: bool = False,
    output_format: str = "markdown",
    js_code: str | None = None,
    wait_for: str | None = None,
    screenshot: bool = False,
    pdf: bool = False,
    stealth_mode: bool = False,
    simulate_user: bool = False,
    magic_mode: bool = False,
    scan_full_page: bool = False,
    process_iframes: bool = False,
    remove_overlays: bool = True,
    timeout: int = 30,
    headless: bool = True,
    session_id: str | None = None,
) -> dict:
    if session_id:
        return {
            "success": False,
            "url": url,
            "error": "session_id is not supported by the shared browser scraper.",
        }
    try:
        from crawl4ai import BrowserConfig, CacheMode, CrawlerRunConfig

        ext_strategy = None
        if extraction_strategy and extraction_strategy not in {"llm", "cosine"}:
            ext_strategy = _build_extraction_strategy(
                strategy_type=extraction_strategy,
                schema=schema,
                instruction=instruction,
                semantic_filter=semantic_filter,
                regex_patterns=regex_patterns,
            )

        from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

        md_generator = None
        if content_filter:
            cont_filter = _build_content_filter(filter_type=content_filter, query=filter_query)
            md_generator = DefaultMarkdownGenerator(content_filter=cont_filter)

        browser_config = BrowserConfig(
            headless=headless,
            create_isolated_context=True,
            verbose=False,
        )

        crawl_config = CrawlerRunConfig(
            word_count_threshold=10,
            excluded_tags=["nav", "footer", "aside", "script", "style", "noscript"],
            remove_overlay_elements=remove_overlays,
            cache_mode=CacheMode.DISABLED,
            extraction_strategy=ext_strategy,
            markdown_generator=md_generator,
            js_code=js_code,
            wait_for=wait_for,
            screenshot=screenshot,
            pdf=pdf,
            simulate_user=simulate_user or magic_mode,
            override_navigator=stealth_mode or magic_mode,
            magic=magic_mode,
            scan_full_page=scan_full_page,
            process_iframes=process_iframes,
        )

        crawler_pool = _get_shared_crawler(browser_config)
        try:
            result = await crawler_pool.submit(url, crawl_config, timeout)
        except RuntimeError as error:
            if str(error) == "Browser scraper is busy; try again shortly.":
                return {"success": False, "url": url, "error": str(error)}
            raise
        if True:
            if not result.success:
                return {
                    "success": False,
                    "url": url,
                    "error": f"Failed to fetch page: {result.error_message or 'Unknown error'}",
                }

            # The browser renders a login wall as happily as a real page, so check here
            # too rather than handing the model a page of navigation text.
            rendered = (getattr(result.markdown, "raw_markdown", None) or "") if result.markdown else ""
            if _looks_like_login_wall(rendered):
                return {
                    "success": False,
                    "url": url,
                    "error": "Page requires a login or blocked automated access; no content available.",
                }

            response = {
                "success": True,
                "url": url,
                "title": result.metadata.get("title", "") if result.metadata else "",
                "_fetcher": "crawl4ai",
            }

            if output_format == "fit_markdown" and result.markdown and result.markdown.fit_markdown:
                response["markdown"] = result.markdown.fit_markdown
            elif output_format == "html" and result.html:
                response["html"] = result.html
            else:
                response["markdown"] = result.markdown.raw_markdown if result.markdown else ""

            if include_raw_html and result.html:
                response["raw_html"] = result.html

            if extraction_strategy == "llm":
                extracted_content = await _pollinations_extract(
                    rendered,
                    instruction or "Extract the main content and key information.",
                    schema,
                )
            elif extraction_strategy == "cosine":
                extracted_content = await _semantic_extract(url, rendered, semantic_filter, timeout)
            elif extraction_strategy:
                extracted_content = result.extracted_content
            else:
                extracted_content = None

            if extraction_strategy:
                if not extracted_content:
                    return {
                        "success": False,
                        "url": url,
                        "error": f"{extraction_strategy} extraction returned no result.",
                    }
                try:
                    extracted_value = json.loads(extracted_content)
                except ValueError:
                    if extraction_strategy == "css":
                        return {
                            "success": False,
                            "url": url,
                            "error": "CSS extraction returned invalid structured data.",
                        }
                    extracted_value = extracted_content
                if isinstance(extracted_value, dict) and extracted_value.get("error"):
                    return {
                        "success": False,
                        "url": url,
                        "error": f"{extraction_strategy} extraction failed: {extracted_value['error']}",
                    }
                if isinstance(extracted_value, list):
                    extraction_error = next(
                        (item.get("error") for item in extracted_value if isinstance(item, dict) and item.get("error")),
                        None,
                    )
                    if extraction_error:
                        return {
                            "success": False,
                            "url": url,
                            "error": f"{extraction_strategy} extraction failed: {extraction_error}",
                        }
                if extraction_strategy == "regex" and isinstance(extracted_value, list):
                    for item in extracted_value:
                        if isinstance(item, dict) and item.get("label") == "url" and isinstance(item.get("value"), str):
                            item["value"] = unescape(item["value"])
                response["extracted"] = extracted_value
                if extraction_strategy == "css" and extracted_value == []:
                    response["extraction_empty"] = True
                    response["markdown"] = ""

            if include_links and result.links:
                internal = result.links.get("internal", [])
                external = result.links.get("external", [])
                response["links"] = {
                    "internal": [l.get("href") for l in internal[:30] if l.get("href")],
                    "external": [l.get("href") for l in external[:30] if l.get("href")],
                }

            if include_images and result.media:
                images = result.media.get("images", [])
                response["images"] = [img.get("src") for img in images[:20] if img.get("src")]

            if include_tables and hasattr(result, "media") and result.media:
                tables = result.media.get("tables", [])
                if tables:
                    response["tables"] = tables

            if screenshot and result.screenshot:
                response["screenshot_base64"] = result.screenshot

            if pdf and result.pdf:
                response["pdf_base64"] = result.pdf

            if result.metadata:
                response["metadata"] = {
                    k: v
                    for k, v in result.metadata.items()
                    if k in ["title", "description", "author", "language", "og:image"]
                }

            return response

    except TimeoutError:
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


async def _pollinations_extract(content: str, instruction: str, schema: dict | None) -> str:
    """Extract through Pollinations' configured gateway, not a Crawl4AI dummy provider."""
    from ..ai.client import pollinations_client

    max_content_chars = 24_000
    bounded_content = content[:max_content_chars]
    schema_prompt = (
        f"\nReturn JSON conforming to this schema: {json.dumps(schema, ensure_ascii=False)}"
        if schema
        else "\nReturn valid JSON only."
    )
    result = await pollinations_client.generate_text(
        system_prompt=(
            "You extract requested facts from supplied web content. Do not invent facts. Return only valid JSON."
        ),
        user_prompt=(
            f"Instruction: {instruction}{schema_prompt}\n\n"
            f"Content (limited to {max_content_chars} characters):\n{bounded_content}"
        ),
        temperature=0.0,
    )
    if not isinstance(result, str) or not result.strip():
        raise ValueError("Configured Pollinations extraction returned no output.")
    try:
        parsed = json.loads(result)
    except ValueError as e:
        raise ValueError("Configured Pollinations extraction returned invalid JSON.") from e
    if isinstance(parsed, dict) and parsed.get("error"):
        raise ValueError(f"Configured Pollinations extraction failed: {parsed['error']}")
    return json.dumps(parsed, ensure_ascii=False)


def _build_extraction_strategy(
    strategy_type: str,
    schema: dict | None = None,
    instruction: str | None = None,
    semantic_filter: str | None = None,
    regex_patterns: list[str] | None = None,
):
    if strategy_type == "llm":
        raise ValueError("LLM extraction is handled by the configured Pollinations gateway.")

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
        try:
            import torch  # noqa: F401
        except ImportError as e:
            raise ImportError(
                "Semantic extraction requires the Crawl4AI CPU embedding dependencies, including "
                "a CPU-compatible torch installation."
            ) from e
        from crawl4ai import CosineStrategy

        class SingleChunkCosineStrategy(CosineStrategy):
            def hierarchical_clustering(self, sentences):
                # SciPy linkage requires two observations; one chunk is one cluster.
                if len(sentences) == 1:
                    return [0]
                return super().hierarchical_clustering(sentences)

        return SingleChunkCosineStrategy(
            semantic_filter=semantic_filter,
            word_count_threshold=20,
            max_dist=0.2,
            top_k=5,
            sim_threshold=0.3,
            model_name="sentence-transformers/all-MiniLM-L6-v2",
        )

    elif strategy_type == "regex":
        from crawl4ai import RegexExtractionStrategy

        pattern_map = _regex_pattern_map(RegexExtractionStrategy)

        patterns = regex_patterns or ["email", "url", "phone"]
        combined_pattern = RegexExtractionStrategy.Nothing
        for p in patterns:
            if p.lower() in pattern_map:
                combined_pattern |= pattern_map[p.lower()]

        return RegexExtractionStrategy(pattern=combined_pattern)

    else:
        raise ValueError(f"Unknown extraction strategy: {strategy_type}")


def _build_content_filter(filter_type: str, query: str | None = None):
    if filter_type == "bm25":
        from crawl4ai import BM25ContentFilter

        return BM25ContentFilter(user_query=query, bm25_threshold=1.0, language="english")

    elif filter_type == "pruning":
        from crawl4ai import PruningContentFilter

        return PruningContentFilter(user_query=query, threshold=0.48, threshold_type="fixed")

    elif filter_type == "llm":
        raise ValueError(
            "LLM content filtering is not configured for Crawl4AI; use a configured Pollinations "
            "LLM route or configure a real Crawl4AI provider."
        )

    else:
        raise ValueError(f"Unknown content filter: {filter_type}")


async def scrape_multiple(
    urls: list[str],
    extraction_strategy: str | None = None,
    schema: dict | None = None,
    instruction: str | None = None,
    max_concurrent: int = 5,
    timeout: int = 30,
) -> dict:
    if not urls:
        return {"success": False, "error": "No URLs provided", "results": []}

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
            processed_results.append({"success": False, "url": url, "error": str(result)})
            failed += 1
        elif result.get("success"):
            processed_results.append(result)
            succeeded += 1
        else:
            processed_results.append(result)
            failed += 1

    per_item_limit = 12_000
    response_limit = 48_000
    bounded_results: list[dict] = []
    omitted = 0
    for item in processed_results:
        serialized = json.dumps(item, ensure_ascii=False, separators=(",", ":"), default=str)
        if len(serialized) > per_item_limit:
            item = {
                "success": item.get("success", False),
                "url": str(item.get("url", ""))[:2_000],
                "url_truncated": len(str(item.get("url", ""))) > 2_000,
                "output_truncated": True,
                "output_limit_chars": per_item_limit,
                "original_output_chars": len(serialized),
            }
        candidate = {
            "success": succeeded > 0,
            "results": [*bounded_results, item],
            "succeeded": succeeded,
            "failed": failed,
            "total": len(urls),
            "results_omitted": len(processed_results) - len(bounded_results) - 1,
            "response_truncated": len(bounded_results) + 1 < len(processed_results),
            "response_limit_chars": response_limit,
            "per_item_limit_chars": per_item_limit,
        }
        if len(json.dumps(candidate, ensure_ascii=False, separators=(",", ":"), default=str)) > response_limit:
            omitted = len(processed_results) - len(bounded_results)
            break
        bounded_results.append(item)
    else:
        omitted = 0

    return {
        "success": succeeded > 0,
        "results": bounded_results,
        "succeeded": succeeded,
        "failed": failed,
        "total": len(urls),
        "results_omitted": omitted,
        "response_truncated": bool(omitted),
        "response_limit_chars": response_limit,
        "per_item_limit_chars": per_item_limit,
    }


async def parse_file_content(
    content: str,
    file_type: str = "text",
    instruction: str | None = None,
    extract_patterns: list[str] | None = None,
) -> dict:
    response = {
        "success": True,
        "file_type": file_type,
        "length": len(content),
        "content": content,
    }

    if file_type == "text":
        if content.strip().startswith(("{", "[")):
            file_type = "json"
        elif "def " in content or "import " in content or "class " in content:
            file_type = "code"
        elif re.search(r"^\d{4}-\d{2}-\d{2}", content, re.MULTILINE):
            file_type = "log"

    response["detected_type"] = file_type

    if file_type == "json":
        try:
            from ..utils.json import loads as _json_loads

            response["parsed"] = _json_loads(content)
            response["content"] = None
        except ValueError as e:
            response["parse_error"] = str(e)

    elif file_type == "yaml":
        try:
            import yaml

            response["parsed"] = yaml.safe_load(content)
            response["content"] = None
        except Exception as e:
            response["parse_error"] = str(e)

    if extract_patterns:
        try:
            from crawl4ai import RegexExtractionStrategy

            pattern_map = _regex_pattern_map(RegexExtractionStrategy)

            combined = RegexExtractionStrategy.Nothing
            for p in extract_patterns:
                if p.lower() in pattern_map:
                    combined |= pattern_map[p.lower()]

            if combined != RegexExtractionStrategy.Nothing:
                strategy = RegexExtractionStrategy(pattern=combined, input_format="text")
                extracted = strategy.extract("file", content)
                response["extracted_patterns"] = extracted
        except ImportError as e:
            return {
                "success": False,
                "file_type": file_type,
                "length": len(content),
                "content": content,
                "error": f"crawl4ai not installed or missing dependency: {e}",
            }
        except Exception as e:
            return {
                "success": False,
                "file_type": file_type,
                "length": len(content),
                "content": content,
                "error": f"Regex extraction failed: {e}",
            }

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
    file_type: str | None = None,
    instruction: str | None = None,
) -> dict:
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(attachment_url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    return {"success": False, "error": f"HTTP {resp.status}"}

                content = await resp.text()

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

                return await parse_file_content(content=content, file_type=file_type, instruction=instruction)

    except TimeoutError:
        return {"success": False, "error": "Timeout fetching attachment"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _llm_extract(content: str, instruction: str) -> str | None:
    try:
        from ..ai.client import pollinations_client

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


async def web_scrape_handler(
    action: str = "scrape",
    url: str | None = None,
    urls: list[str] | None = None,
    strategy: str | None = None,
    schema: dict | None = None,
    extract: str | None = None,
    semantic_filter: str | None = None,
    patterns: list[str] | None = None,
    content_filter: str | None = None,
    filter_query: str | None = None,
    include_links: bool = False,
    include_images: bool = False,
    include_tables: bool = False,
    output_format: str = "markdown",
    js_code: str | None = None,
    wait_for: str | None = None,
    screenshot: bool = False,
    stealth_mode: bool = False,
    simulate_user: bool = False,
    magic_mode: bool = False,
    scan_full_page: bool = False,
    process_iframes: bool = False,
    session_id: str | None = None,
    file_url: str | None = None,
    file_content: str | None = None,
    file_type: str | None = None,
    **kwargs,
) -> dict:
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
        return await fetch_discord_attachment(attachment_url=file_url, file_type=file_type, instruction=extract)

    scrape_actions = {"scrape", "extract", "css_extract", "semantic", "regex"}
    if action in scrape_actions:
        if not url:
            suffix = f" for {action} action" if action in {"scrape", "extract"} else ""
            return {"error": f"url parameter required{suffix}"}

        scrape_options: dict[str, Any] = {
            "url": url,
            "stealth_mode": stealth_mode,
            "magic_mode": magic_mode,
            "scan_full_page": scan_full_page,
            "process_iframes": process_iframes,
            "session_id": session_id,
        }

        if action == "scrape":
            scrape_options.update(
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
                simulate_user=simulate_user,
            )
        elif action == "extract":
            if not extract:
                return {"error": "extract parameter required - describe what to extract"}
            scrape_options.update(
                extraction_strategy="llm",
                instruction=extract,
                schema=schema,
                content_filter=content_filter,
                filter_query=filter_query,
                include_links=include_links,
                include_images=include_images,
                include_tables=include_tables,
                simulate_user=simulate_user,
            )
        elif action == "css_extract":
            if not schema:
                return {"error": "schema required for CSS extraction"}
            scrape_options.update(
                extraction_strategy="css",
                schema=schema,
                include_links=include_links,
                include_images=include_images,
                include_tables=include_tables,
            )
        elif action == "semantic":
            scrape_options.update(
                extraction_strategy="cosine",
                semantic_filter=semantic_filter or filter_query,
                content_filter=content_filter,
                filter_query=filter_query,
            )
        else:
            scrape_options.update(
                extraction_strategy="regex",
                regex_patterns=patterns or ["email", "url", "phone"],
            )

        return await scrape_url(**scrape_options)

    if action == "multi":
        if not urls:
            return {"error": "urls parameter required for multi action (list of URLs)"}
        return await scrape_multiple(urls=urls, extraction_strategy=strategy, schema=schema, instruction=extract)

    return {
        "error": f"Unknown action: {action}",
        "available_actions": [
            "scrape - Single URL to markdown (rnet → scrapling → Jina → crawl4ai). "
            "x.com/twitter.com links are read through fxtwitter, so posts and profiles "
            "come back as real content. Reddit blocks this server, so reddit.com links "
            "return an error rather than a page.",
            "extract - URL + LLM extraction",
            "css_extract - URL + CSS schema (fast)",
            "semantic - URL + cosine clustering",
            "regex - URL + pattern extraction",
            "multi - Multiple URLs",
            "parse_file - Parse raw content",
            "fetch_file - Fetch + parse URL",
        ],
    }
