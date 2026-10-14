import unittest
from unittest.mock import AsyncMock, Mock, patch

from src.ai.client import pollinations_client, web_search_handler


class WebSearchSourcesTests(unittest.IsolatedAsyncioTestCase):
    async def search(self, payload):
        response = AsyncMock()
        response.status = 200
        response.json.return_value = payload
        response.__aenter__.return_value = response
        session = Mock()
        session.post.return_value = response
        with patch.object(pollinations_client, "get_session", AsyncMock(return_value=session)):
            return await web_search_handler("test query")

    async def test_text_helper_omits_unsupported_seed(self):
        response = AsyncMock()
        response.status = 200
        response.json.return_value = {"choices": [{"message": {"content": "review"}}]}
        response.__aenter__.return_value = response
        session = Mock()
        session.post.return_value = response
        with patch.object(pollinations_client, "get_session", AsyncMock(return_value=session)):
            result = await pollinations_client.generate_text("Review", "Public diff", model="test-model")
        self.assertEqual(result, "review")
        payload = session.post.call_args.kwargs["json"]
        self.assertNotIn("seed", payload)
        self.assertEqual(payload["model"], "test-model")

    async def test_citations_keep_provider_indexes(self):
        result = await self.search(
            {
                "choices": [{"message": {"content": "Evidence [1] and [3]."}}],
                "citations": ["https://example.org/one", None, "https://example.org/three"],
            }
        )
        self.assertEqual([source["index"] for source in result["sources"]], [1, 3])
        self.assertIn("[3] https://example.org/three", result["result"])

    async def test_annotations_expose_urls_without_inventing_indexes(self):
        result = await self.search(
            {
                "choices": [
                    {
                        "message": {
                            "content": "Evidence.",
                            "annotations": [
                                None,
                                {"url_citation": None},
                                {"url_citation": {"url": "https://example.org/source", "title": "Source"}},
                            ],
                        }
                    }
                ]
            }
        )
        self.assertEqual(result["sources"], [{"url": "https://example.org/source", "title": "Source"}])
        self.assertIn("https://example.org/source", result["result"])

    async def test_missing_metadata_does_not_invent_sources(self):
        result = await self.search({"choices": [{"message": {"content": "Evidence [8]."}}]})
        self.assertEqual(result["sources"], [])
        self.assertEqual(result["result"], "Evidence [8].")
