import unittest
from unittest.mock import AsyncMock, patch

from src.ai.tool_filters import get_tools_with_embeddings
from src.ai.tools import GITHUB_TOOLS
from src.search import code_graph
from src.search.handlers import code_search_handler


class CodeSearchAvailabilityTests(unittest.TestCase):
    def test_local_clone_exposes_code_search_without_vectorize(self):
        tools = get_tools_with_embeddings(GITHUB_TOOLS.copy(), code_search_enabled=True)

        self.assertIn("code_search", [tool["function"]["name"] for tool in tools])


class GraphResultTests(unittest.IsolatedAsyncioTestCase):
    async def test_symbol_query_preserves_identity_and_revision(self):
        response = [
            {
                "node": {
                    "id": "method:abc",
                    "name": "process_with_tools",
                    "qualifiedName": "PollinationsClient::process_with_tools",
                    "signature": "(self) -> dict",
                    "kind": "method",
                    "filePath": "apps/polli/src/ai/client.py",
                    "startLine": 10,
                    "endLine": 20,
                    "language": "python",
                },
                "score": 99.5,
            }
        ]
        with (
            patch.object(code_graph, "_run_codegraph", AsyncMock(return_value=response)),
            patch.object(code_graph, "graph_status", AsyncMock(return_value={"revision": "abc123", "fresh": True})),
        ):
            result = await code_graph.symbols("process_with_tools", limit=5)

        self.assertEqual(result["results"][0]["id"], "method:abc")
        self.assertEqual(result["results"][0]["qualified_name"], "PollinationsClient::process_with_tools")
        self.assertEqual(result["revision"], "abc123")

    async def test_status_marks_graph_stale_when_clone_has_changes(self):
        status = {"pendingChanges": {"modified": 1}, "lastIndexed": "2026-09-04T00:00:00Z"}
        with (
            patch.object(code_graph, "_run_codegraph", AsyncMock(return_value=status)),
            patch("src.search.code_graph.local_repo.repo_status", AsyncMock(return_value={"commit": "abc"})),
        ):
            result = await code_graph.graph_status()

        self.assertFalse(result["fresh"])
        self.assertEqual(result["revision"], "abc")


class HandlerTests(unittest.IsolatedAsyncioTestCase):
    async def test_status_reports_backend_availability(self):
        with (
            patch("src.search.handlers.local_repo.repo_status", AsyncMock(return_value={"commit": "abc"})),
            patch("src.search.handlers.code_graph.graph_status", AsyncMock(return_value={"fresh": True})),
        ):
            result = await code_search_handler(action="status")

        self.assertIn("backends", result)
        self.assertTrue(result["backends"]["local"])


if __name__ == "__main__":
    unittest.main()
