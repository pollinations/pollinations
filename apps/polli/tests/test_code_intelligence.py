import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

APP_DIR = Path(__file__).resolve().parents[1]
API_HELPER = APP_DIR / "src" / "search" / "code_graph_api.js"
CODEGRAPH = APP_DIR / "node_modules" / ".bin" / ("codegraph.cmd" if __import__("os").name == "nt" else "codegraph")
NODE = "node"


def run_graph_command(fixture: Path, *args: str) -> dict | list:
    result = subprocess.run(
        args,
        cwd=fixture,
        capture_output=True,
        check=True,
        text=True,
        timeout=120,
    )
    return json.loads(result.stdout)


def node_available() -> bool:
    return (
        API_HELPER.is_file()
        and CODEGRAPH.is_file()
        and subprocess.run([NODE, "--version"], capture_output=True, check=False, timeout=10).returncode == 0
    )


@unittest.skipUnless(node_available(), "pinned CodeGraph Node dependency is not installed")
class CodeGraphApiIntegrationTests(unittest.TestCase):
    def test_stable_ids_isolate_duplicate_callers_callees_and_impact(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            (fixture / "one.py").write_text(
                "def duplicate():\n    return 'one'\n\ndef caller_one():\n    return duplicate()\n"
            )
            (fixture / "two.py").write_text(
                "def duplicate():\n    return 'two'\n\ndef caller_two():\n    return duplicate()\n"
            )
            subprocess.run(
                [str(CODEGRAPH), "init", ".", "--yes"], cwd=fixture, check=True, capture_output=True, timeout=120
            )
            symbols = run_graph_command(fixture, str(CODEGRAPH), "query", "duplicate", "--json", "--limit", "10")
            one_id = next(item["node"]["id"] for item in symbols if item["node"]["filePath"] == "one.py")
            two_id = next(item["node"]["id"] for item in symbols if item["node"]["filePath"] == "two.py")

            one_callers = run_graph_command(fixture, NODE, str(API_HELPER), "callers", one_id, "1")
            two_callers = run_graph_command(fixture, NODE, str(API_HELPER), "callers", two_id, "1")
            one_callees = run_graph_command(
                fixture, NODE, str(API_HELPER), "callees", one_callers["nodes"][0]["id"], "1"
            )
            one_impact = run_graph_command(fixture, NODE, str(API_HELPER), "impact", one_id, "2")

            self.assertEqual([node["name"] for node in one_callers["nodes"]], ["caller_one"])
            self.assertEqual([node["name"] for node in two_callers["nodes"]], ["caller_two"])
            self.assertEqual([node["id"] for node in one_callees["nodes"]], [one_id])
            self.assertEqual({node["name"] for node in one_impact["nodes"]}, {"duplicate", "caller_one"})

    def test_unknown_stable_id_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            (fixture / "source.py").write_text("def target():\n    return None\n")
            subprocess.run(
                [str(CODEGRAPH), "init", ".", "--yes"], cwd=fixture, check=True, capture_output=True, timeout=120
            )
            result = subprocess.run(
                [NODE, str(API_HELPER), "callers", "function:missing", "1"],
                cwd=fixture,
                capture_output=True,
                text=True,
                timeout=120,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("No exact symbol", result.stderr)


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
            },
            {"node": {"id": "method:unrelated", "name": "canCoverEstimatedCharge"}, "score": 50},
        ]
        with (
            patch.object(code_graph, "_run_codegraph", AsyncMock(return_value=response)),
            patch.object(code_graph, "graph_status", AsyncMock(return_value={"revision": "abc123", "fresh": True})),
        ):
            result = await code_graph.symbols("process_with_tools", limit=5)

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["results"][0]["id"], "method:abc")
        self.assertEqual(result["results"][0]["qualified_name"], "PollinationsClient::process_with_tools")
        self.assertEqual(result["revision"], "abc123")

    @unittest.skipUnless(node_available(), "pinned CodeGraph Node dependency is not installed")
    async def test_python_wrapper_uses_pinned_cli_and_exact_id_api(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            (fixture / "one.py").write_text(
                "def duplicate():\n    return 'one'\n\ndef caller_one():\n    return duplicate()\n"
            )
            (fixture / "two.py").write_text(
                "def duplicate():\n    return 'two'\n\ndef caller_two():\n    return duplicate()\n"
            )
            with (
                patch.object(code_graph, "REPO_DIR", fixture),
                patch("src.search.code_graph.local_repo.repo_status", AsyncMock(return_value={"commit": "fixture"})),
            ):
                synced = await code_graph.sync_graph()
                discovered = await code_graph.symbols("duplicate", limit=10)
                one_id = next(node["id"] for node in discovered["results"] if node["file"] == "one.py")
                callers = await code_graph.callers(one_id)
                impacted = await code_graph.impact(one_id, depth=2)

            self.assertEqual(synced, {"action": "init", "ok": True})
            self.assertEqual([node["symbol"] for node in callers["results"]], ["caller_one"])
            self.assertEqual([node["symbol"] for node in impacted["results"]], ["caller_one"])

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
