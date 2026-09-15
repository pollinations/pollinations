import asyncio
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

from src.ai.tools import GITHUB_TOOLS, WEB_SCRAPE_TOOL
from src.integrations.github.pr_review import PRReviewMixin, _review_complexity
from src.integrations.web_scraper import _llm_extract, _pollinations_extract, web_scrape_handler


class ComplexityRoutingTests(unittest.TestCase):
    def test_eligible_tool_schemas_expose_exact_enum(self):
        github_pr = next(tool for tool in GITHUB_TOOLS if tool["function"]["name"] == "github_pr")
        for tool in (github_pr, WEB_SCRAPE_TOOL):
            self.assertEqual(tool["function"]["parameters"]["properties"]["complexity"]["enum"], ["low", "mid", "high"])

    def test_invalid_complexity_is_rejected(self):
        async def run():
            with self.assertRaisesRegex(ValueError, "low, mid, high"):
                await _pollinations_extract("source", "extract fields", None, "unknown")

        asyncio.run(run())

    def test_web_extraction_routes_low_model(self):
        async def run():
            with patch("src.ai.client.pollinations_client.generate_text", new=AsyncMock(return_value="{}")) as generate:
                await _pollinations_extract("source", "extract fields", None, "low")
            self.assertEqual(generate.await_args.kwargs["model"], "openai/gpt-5.6-luna")

        asyncio.run(run())

    def test_web_extract_handler_routes_through_crawler_to_low_model(self):
        async def run():
            result = types.SimpleNamespace(
                success=True,
                metadata={"title": "Example"},
                markdown=types.SimpleNamespace(raw_markdown="Source text", fit_markdown=None),
                html=None,
                extracted_content=None,
            )
            fake_crawl4ai = types.SimpleNamespace(
                BrowserConfig=lambda **kwargs: kwargs,
                CacheMode=types.SimpleNamespace(DISABLED="disabled"),
                CrawlerRunConfig=lambda **kwargs: kwargs,
            )
            markdown_module = types.SimpleNamespace(DefaultMarkdownGenerator=lambda **kwargs: kwargs)
            crawler = types.SimpleNamespace(submit=AsyncMock(return_value=result))
            with (
                patch.dict(
                    sys.modules,
                    {"crawl4ai": fake_crawl4ai, "crawl4ai.markdown_generation_strategy": markdown_module},
                ),
                patch("src.integrations.web_scraper._get_shared_crawler", return_value=crawler),
                patch("src.ai.client.pollinations_client.generate_text", new=AsyncMock(return_value="{}")) as generate,
            ):
                response = await web_scrape_handler(
                    action="extract", url="https://example.com", extract="facts", complexity="low"
                )
            self.assertTrue(response["success"])
            self.assertEqual(generate.await_count, 1)
            self.assertEqual(generate.await_args.kwargs["model"], "openai/gpt-5.6-luna")

        asyncio.run(run())

    def test_file_content_extraction_routes_mid_model(self):
        async def run():
            with patch(
                "src.ai.client.pollinations_client.generate_text", new=AsyncMock(return_value="facts")
            ) as generate:
                await _llm_extract("source", "extract fields", "mid")
            self.assertEqual(generate.await_args.kwargs["model"], "openai/gpt-5.6-terra")

        asyncio.run(run())

    def test_file_review_routes_mid_model(self):
        async def run():
            harness = PRReviewMixin()
            files = [{"filename": "x.py", "diff": "+x", "high_priority": False}]
            token = _review_complexity.set("mid")
            try:
                with patch(
                    "src.ai.client.pollinations_client.generate_text", new=AsyncMock(return_value="OK")
                ) as generate:
                    await harness._review_files_concurrently(files)
            finally:
                _review_complexity.reset(token)
            self.assertEqual(generate.await_args.kwargs["model"], "openai/gpt-5.6-terra")

        asyncio.run(run())

    def test_review_synthesis_routes_high_model(self):
        async def run():
            harness = PRReviewMixin()
            pr = {"number": 1, "title": "Test", "author": "bot", "additions": 1, "deletions": 0, "changed_files": 1}
            findings = [{"filenames": ["x.py"], "findings": "bug", "high_priority": False}]
            token = _review_complexity.set("high")
            try:
                with patch(
                    "src.ai.client.pollinations_client.generate_text", new=AsyncMock(return_value="OK")
                ) as generate:
                    await harness._synthesize_review(pr, findings, [])
            finally:
                _review_complexity.reset(token)
            self.assertEqual(generate.await_args.kwargs["model"], "openai/gpt-5.6-sol")

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
