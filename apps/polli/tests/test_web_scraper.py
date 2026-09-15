import asyncio
import json
import sys
import threading
import types
import unittest
from unittest.mock import patch

from src.integrations import web_scraper


class SemanticSingleChunkTests(unittest.TestCase):
    def test_single_chunk_is_one_cluster_and_multiple_chunks_delegate(self):
        class Cosine:
            def __init__(self, **kwargs):
                pass

            def hierarchical_clustering(self, sentences):
                return [1, 2]

        with patch.dict(
            sys.modules, {"crawl4ai": types.SimpleNamespace(CosineStrategy=Cosine), "torch": types.ModuleType("torch")}
        ):
            strategy = web_scraper._build_extraction_strategy("cosine", semantic_filter="testing")

        self.assertEqual(strategy.hierarchical_clustering(["one chunk"]), [0])
        self.assertEqual(strategy.hierarchical_clustering(["first", "second"]), [1, 2])


class _Regex:
    Nothing = 0
    Email = 1
    PhoneIntl = 2
    Url = 4
    DateIso = 8
    Currency = 16
    IPv4 = 32
    Hashtag = 64
    TwitterHandle = 128
    All = 255

    def __init__(self, pattern, input_format="markdown"):
        self.pattern = pattern
        self.input_format = input_format

    def extract(self, url, content):
        return [{"url": url, "content": content, "pattern": self.pattern}]


class _Result:
    success = True
    error_message = None
    metadata = {}
    html = "<main>content</main>"
    markdown = types.SimpleNamespace(raw_markdown="page content", fit_markdown="")
    links = {}
    media = {}
    screenshot = None
    pdf = None

    def __init__(self, extracted_content):
        self.extracted_content = extracted_content


class WebScraperTests(unittest.TestCase):
    def setUp(self):
        web_scraper._crawler_pool = None

    def test_scrapling_uses_safe_redirects_and_native_markdown(self):
        from unittest.mock import AsyncMock, Mock

        page = types.SimpleNamespace(
            status=200,
            html_content="<main>Article content</main>",
            markdown=Mock(return_value="Article content with enough useful text to retain as a successful scrape."),
        )
        fetcher = types.SimpleNamespace(get=AsyncMock(return_value=page))
        with patch.dict(sys.modules, {"scrapling.fetchers": types.SimpleNamespace(AsyncFetcher=fetcher)}):
            result = asyncio.run(web_scraper._try_scrapling("https://example.test", 10))
        fetcher.get.assert_awaited_once_with("https://example.test", follow_redirects="safe")
        page.markdown.assert_called_once_with(main_content_only=True)
        self.assertIn("Article content", result)

    def test_rnet_client_does_not_receive_unsupported_redirect_option(self):
        captured = {}

        class _Client:
            def __init__(self, **kwargs):
                captured.update(kwargs)

            async def get(self, url):
                return types.SimpleNamespace(status=200, text=lambda: asyncio.sleep(0, result=""))

        fake_module = types.SimpleNamespace(Client=_Client, Impersonate=types.SimpleNamespace(Chrome136="chrome"))
        with patch.dict(sys.modules, {"rnet": fake_module}):
            self.assertIsNone(asyncio.run(web_scraper._try_rnet("https://example.test", 1)))
        self.assertNotIn("redirect", captured)

    def test_regex_map_uses_crawl4ai_090_constant_names(self):
        self.assertEqual(web_scraper._regex_pattern_map(_Regex)["url"], _Regex.Url)
        self.assertEqual(web_scraper._regex_pattern_map(_Regex)["date"], _Regex.DateIso)
        self.assertEqual(web_scraper._regex_pattern_map(_Regex)["ip"], _Regex.IPv4)

    def test_file_regex_uses_shared_map_and_reports_missing_dependency(self):
        fake_module = types.SimpleNamespace(RegexExtractionStrategy=_Regex)
        with patch.dict(sys.modules, {"crawl4ai": fake_module}):
            result = asyncio.run(web_scraper.parse_file_content("contact a@example.com", extract_patterns=["url"]))
        self.assertTrue(result["success"])
        self.assertEqual(result["extracted_patterns"][0]["pattern"], _Regex.Url)

        with patch.dict(sys.modules, {"crawl4ai": None}):
            missing = asyncio.run(web_scraper.parse_file_content("x", extract_patterns=["url"]))
        self.assertFalse(missing["success"])
        self.assertIn("missing dependency", missing["error"])

    def test_css_empty_rows_are_successful_empty_structured_output(self):
        result = _Result("[]")
        crawler = types.SimpleNamespace(arun=lambda **kwargs: asyncio.sleep(0, result=result))
        crawler.__aenter__ = lambda: asyncio.sleep(0, result=crawler)
        crawler.__aexit__ = lambda *args: asyncio.sleep(0)

        class _Crawler:
            def __init__(self, config):
                self.crawler = crawler

            async def start(self):
                return self

            async def close(self):
                pass

            async def arun(self, **kwargs):
                return await self.crawler.arun(**kwargs)

        fake_module = types.SimpleNamespace(
            AsyncWebCrawler=_Crawler,
            BrowserConfig=lambda **kwargs: kwargs,
            CacheMode=types.SimpleNamespace(DISABLED="disabled"),
            CrawlerRunConfig=lambda **kwargs: kwargs,
            JsonCssExtractionStrategy=lambda **kwargs: kwargs,
        )
        markdown_module = types.SimpleNamespace(DefaultMarkdownGenerator=lambda **kwargs: kwargs)
        with patch.dict(
            sys.modules, {"crawl4ai": fake_module, "crawl4ai.markdown_generation_strategy": markdown_module}
        ):
            output = asyncio.run(
                web_scraper._scrape_with_crawl4ai(
                    "https://example.test", extraction_strategy="css", schema={"baseSelector": ".missing"}
                )
            )
        self.assertTrue(output["success"])
        self.assertEqual(output["extracted"], [])
        self.assertTrue(output["extraction_empty"])
        self.assertEqual(output["markdown"], "")

    def test_extraction_error_payload_is_failure(self):
        result = _Result(json.dumps({"error": "provider unavailable"}))
        crawler = types.SimpleNamespace(arun=lambda **kwargs: asyncio.sleep(0, result=result))

        class _Crawler:
            def __init__(self, config):
                self.crawler = crawler

            async def start(self):
                return self

            async def close(self):
                pass

            async def arun(self, **kwargs):
                return await self.crawler.arun(**kwargs)

        fake_module = types.SimpleNamespace(
            AsyncWebCrawler=_Crawler,
            BrowserConfig=lambda **kwargs: kwargs,
            CacheMode=types.SimpleNamespace(DISABLED="disabled"),
            CrawlerRunConfig=lambda **kwargs: kwargs,
            RegexExtractionStrategy=_Regex,
        )
        markdown_module = types.SimpleNamespace(DefaultMarkdownGenerator=lambda **kwargs: kwargs)
        with patch.dict(
            sys.modules, {"crawl4ai": fake_module, "crawl4ai.markdown_generation_strategy": markdown_module}
        ):
            output = asyncio.run(web_scraper._scrape_with_crawl4ai("https://example.test", extraction_strategy="regex"))
        self.assertFalse(output["success"])
        self.assertIn("provider unavailable", output["error"])

    def test_multi_bounds_outputs_with_valid_serialized_aggregate(self):
        async def fake_scrape(url, **kwargs):
            return {"success": True, "url": url, "markdown": "x" * 20_000}

        with patch.object(web_scraper, "scrape_url", fake_scrape):
            output = asyncio.run(web_scraper.scrape_multiple(["https://one.test", "https://two.test"]))
        self.assertTrue(output["success"])
        self.assertTrue(all(item["output_truncated"] for item in output["results"]))
        self.assertLessEqual(len(json.dumps(output, ensure_ascii=False)), output["response_limit_chars"])
        self.assertEqual(output["results_omitted"], 0)

    def test_multi_response_bound_omits_late_unicode_and_oversized_url_results(self):
        oversized_url = "https://example.test/" + ("ü" * 5_000)

        async def fake_scrape(url, **kwargs):
            return {"success": True, "url": url, "markdown": "界" * 11_500}

        urls = [oversized_url] + [f"https://{index}.test" for index in range(9)]
        with patch.object(web_scraper, "scrape_url", fake_scrape):
            output = asyncio.run(web_scraper.scrape_multiple(urls))
        self.assertLessEqual(len(json.dumps(output, ensure_ascii=False)), output["response_limit_chars"])
        self.assertTrue(output["response_truncated"])
        self.assertGreater(output["results_omitted"], 0)
        self.assertEqual(output["results"][1]["url"], urls[1])
        self.assertLessEqual(len(output["results"][0]["url"]), 2_000)
        self.assertTrue(output["results"][0]["url_truncated"])

    def test_regex_url_values_decode_html_entities(self):
        from unittest.mock import AsyncMock

        rows = [
            {"label": "url", "value": "https://example.test/?a=1&amp;b=2", "span": [0, 33]},
            {"label": "email", "value": "a&amp;b@example.test"},
        ]
        fake_module = types.SimpleNamespace(
            BrowserConfig=lambda **kwargs: kwargs,
            CacheMode=types.SimpleNamespace(DISABLED="disabled"),
            CrawlerRunConfig=lambda **kwargs: kwargs,
            RegexExtractionStrategy=_Regex,
        )
        with (
            patch.dict(
                sys.modules,
                {
                    "crawl4ai": fake_module,
                    "crawl4ai.markdown_generation_strategy": types.SimpleNamespace(
                        DefaultMarkdownGenerator=lambda **kwargs: kwargs
                    ),
                },
            ),
            patch.object(
                web_scraper,
                "_get_shared_crawler",
                return_value=types.SimpleNamespace(submit=AsyncMock(return_value=_Result(json.dumps(rows)))),
            ),
        ):
            output = asyncio.run(
                web_scraper._scrape_with_crawl4ai(
                    "https://example.test", extraction_strategy="regex", regex_patterns=["url"]
                )
            )
        self.assertTrue(output["success"])
        self.assertEqual(output["extracted"][0]["value"], "https://example.test/?a=1&b=2")
        self.assertEqual(output["extracted"][0]["span"], [0, 33])
        self.assertEqual(output["extracted"][1]["value"], rows[1]["value"])

    def test_list_extraction_error_payload_is_failure(self):
        result = _Result(json.dumps([{"error": "embedding unavailable"}]))
        crawler = types.SimpleNamespace(arun=lambda **kwargs: asyncio.sleep(0, result=result))

        class _Crawler:
            def __init__(self, config):
                self.crawler = crawler

            async def start(self):
                return self

            async def close(self):
                pass

            async def arun(self, **kwargs):
                return await self.crawler.arun(**kwargs)

        fake_module = types.SimpleNamespace(
            AsyncWebCrawler=_Crawler,
            BrowserConfig=lambda **kwargs: kwargs,
            CacheMode=types.SimpleNamespace(DISABLED="disabled"),
            CrawlerRunConfig=lambda **kwargs: kwargs,
            RegexExtractionStrategy=_Regex,
        )
        markdown_module = types.SimpleNamespace(DefaultMarkdownGenerator=lambda **kwargs: kwargs)
        with patch.dict(
            sys.modules,
            {
                "crawl4ai": fake_module,
                "crawl4ai.markdown_generation_strategy": markdown_module,
            },
        ):
            output = asyncio.run(web_scraper._scrape_with_crawl4ai("https://example.test", extraction_strategy="regex"))
        self.assertFalse(output["success"])
        self.assertIn("embedding unavailable", output["error"])

    def test_llm_scrape_uses_configured_gateway_with_bounded_structured_input(self):
        result = _Result(None)
        crawler = types.SimpleNamespace(arun=lambda **kwargs: asyncio.sleep(0, result=result))

        class _Crawler:
            def __init__(self, config):
                self.crawler = crawler

            async def start(self):
                return self

            async def close(self):
                pass

            async def arun(self, **kwargs):
                return await self.crawler.arun(**kwargs)

        class _Gateway:
            def __init__(self):
                self.kwargs = None

            async def generate_text(self, **kwargs):
                self.kwargs = kwargs
                return '{"title":"extracted"}'

        gateway = _Gateway()
        fake_crawl4ai = types.SimpleNamespace(
            AsyncWebCrawler=_Crawler,
            BrowserConfig=lambda **kwargs: kwargs,
            CacheMode=types.SimpleNamespace(DISABLED="disabled"),
            CrawlerRunConfig=lambda **kwargs: kwargs,
        )
        fake_client_module = types.SimpleNamespace(pollinations_client=gateway)
        markdown_module = types.SimpleNamespace(DefaultMarkdownGenerator=lambda **kwargs: kwargs)
        with patch.dict(
            sys.modules,
            {
                "crawl4ai": fake_crawl4ai,
                "crawl4ai.markdown_generation_strategy": markdown_module,
                "src.ai.client": fake_client_module,
            },
        ):
            output = asyncio.run(
                web_scraper._scrape_with_crawl4ai(
                    "https://example.test",
                    extraction_strategy="llm",
                    instruction="Find the title",
                    schema={"type": "object"},
                )
            )
        self.assertTrue(output["success"])
        self.assertEqual(output["extracted"], {"title": "extracted"})
        self.assertIn("Find the title", gateway.kwargs["user_prompt"])
        self.assertIn("limited to 24000", gateway.kwargs["user_prompt"])

    def test_llm_content_filter_is_an_actionable_configuration_failure(self):
        with self.assertRaisesRegex(ValueError, "not configured"):
            web_scraper._build_content_filter("llm")

    def test_regex_handler_forwards_patterns_to_scrape_url(self):
        captured = {}

        async def fake_scrape_url(**kwargs):
            captured.update(kwargs)
            return {"success": True, "extracted": []}

        with patch.object(web_scraper, "scrape_url", fake_scrape_url):
            result = asyncio.run(
                web_scraper.web_scrape_handler(action="regex", url="https://fixture.test", patterns=["url"])
            )
        self.assertTrue(result["success"])
        self.assertEqual(captured["regex_patterns"], ["url"])
        self.assertEqual(captured["extraction_strategy"], "regex")

    def test_shared_browser_bounds_admission_and_cancellation_releases_tab(self):
        active = 0
        peak = 0
        started = threading.Event()
        unblock = threading.Event()

        class _Crawler:
            def __init__(self, config):
                self.config = config

            async def start(self):
                return self

            async def close(self):
                pass

            async def arun(self, **kwargs):
                nonlocal active, peak
                active += 1
                peak = max(peak, active)
                started.set()
                try:
                    await asyncio.to_thread(unblock.wait)
                    return _Result(None)
                finally:
                    active -= 1

        fake_crawl4ai = types.SimpleNamespace(
            AsyncWebCrawler=_Crawler,
            BrowserConfig=lambda **kwargs: types.SimpleNamespace(**kwargs),
            CacheMode=types.SimpleNamespace(DISABLED="disabled"),
            CrawlerRunConfig=lambda **kwargs: types.SimpleNamespace(**kwargs),
        )
        markdown_module = types.SimpleNamespace(DefaultMarkdownGenerator=lambda **kwargs: kwargs)

        async def scenario():
            web_scraper._crawler_pool = None
            with patch.dict(
                sys.modules,
                {"crawl4ai": fake_crawl4ai, "crawl4ai.markdown_generation_strategy": markdown_module},
            ):
                jobs = [
                    asyncio.create_task(web_scraper._scrape_with_crawl4ai(f"https://{index}.test"))
                    for index in range(4)
                ]
                await asyncio.to_thread(started.wait)
                for _ in range(20):
                    if peak == 2:
                        break
                    await asyncio.sleep(0.01)
                self.assertEqual(peak, 2)
                busy = await web_scraper._scrape_with_crawl4ai("https://busy.test")
                self.assertFalse(busy["success"])
                self.assertIn("busy", busy["error"])
                jobs[2].cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await jobs[2]
                jobs[3].cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await jobs[3]
                unblock.set()
                await asyncio.gather(*jobs[:2])
                self.assertLessEqual(peak, 2)
                await web_scraper.close_web_scraper()

        asyncio.run(scenario())

    def test_shared_browser_rejects_sessions_and_conflicting_headless_mode(self):
        async def scenario():
            web_scraper._crawler_pool = None
            rejected = await web_scraper._scrape_with_crawl4ai("https://example.test", session_id="persist")
            self.assertFalse(rejected["success"])
            self.assertIn("session_id", rejected["error"])

            pool = web_scraper._SharedCrawlerPool(types.SimpleNamespace(headless=True))
            web_scraper._crawler_pool = pool
            with self.assertRaisesRegex(ValueError, "headless mode"):
                await web_scraper._get_shared_crawler(types.SimpleNamespace(headless=False))
            web_scraper._crawler_pool = None

        asyncio.run(scenario())

    def test_dedicated_crawler_reuses_one_browser_across_two_caller_loops(self):
        created = []
        active = 0
        peak = 0
        lock = threading.Lock()

        class _Crawler:
            def __init__(self, config):
                created.append(self)

            async def start(self):
                return self

            async def close(self):
                pass

            async def arun(self, **kwargs):
                nonlocal active, peak
                with lock:
                    active += 1
                    peak = max(peak, active)
                try:
                    await asyncio.sleep(0.03)
                    return _Result(None)
                finally:
                    with lock:
                        active -= 1

        fake = types.SimpleNamespace(AsyncWebCrawler=_Crawler)
        pool = None
        with patch.dict(sys.modules, {"crawl4ai": fake}):
            pool = web_scraper._SharedCrawlerPool(types.SimpleNamespace(headless=True))

            def caller():
                return asyncio.run(pool.submit("https://example.test", object(), 1))

            threads = [threading.Thread(target=caller) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            self.assertEqual(len(created), 1)
            self.assertEqual(peak, 2)
            asyncio.run(pool.close())

    def test_semantic_spawn_failure_releases_admission(self):
        class _Context:
            def Queue(self, maxsize):
                raise RuntimeError("spawn setup failed")

        async def scenario():
            with patch.object(web_scraper.multiprocessing, "get_context", return_value=_Context()):
                with self.assertRaisesRegex(RuntimeError, "spawn setup failed"):
                    await web_scraper._semantic_extract("https://example.test", "content", None, 1)
            self.assertTrue(web_scraper._semantic_slots.acquire(blocking=False))
            web_scraper._semantic_slots.release()

        asyncio.run(scenario())

    def test_semantic_timeout_keeps_loop_responsive_and_terminates_worker(self):
        class _Output:
            def get_nowait(self):
                raise web_scraper.queue.Empty

            def close(self):
                pass

        class _Process:
            def __init__(self):
                self.terminated = False
                self.killed = False

            def start(self):
                pass

            def is_alive(self):
                return not self.terminated and not self.killed

            def terminate(self):
                self.terminated = True

            def kill(self):
                self.killed = True

            def join(self):
                pass

        process = _Process()
        context = types.SimpleNamespace(
            Queue=lambda maxsize: _Output(),
            Process=lambda target, args: process,
        )

        async def scenario():
            ticks = 0

            async def tick():
                nonlocal ticks
                while True:
                    ticks += 1
                    await asyncio.sleep(0.01)

            ticker = asyncio.create_task(tick())
            with patch.object(web_scraper.multiprocessing, "get_context", return_value=context):
                with self.assertRaises(TimeoutError):
                    await web_scraper._semantic_extract("https://example.test", "content", None, 0.05)
            ticker.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await ticker
            self.assertTrue(process.terminated)
            self.assertGreater(ticks, 1)

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
