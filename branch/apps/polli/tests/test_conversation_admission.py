import ast
import asyncio
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock


class ConversationAdmissionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        path = Path(__file__).parents[1] / "src" / "bot.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        function = next(
            node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "process_message"
        )
        module = ast.Module(
            body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), function],
            type_ignores=[],
        )
        self.namespace = {"_active_conversations": set(), "_process_message": AsyncMock()}
        exec(compile(ast.fix_missing_locations(module), str(path), "exec"), self.namespace)
        self.call = self.namespace["process_message"]

    async def test_overlap_rejected_and_other_channel_runs(self):
        entered = asyncio.Event()
        release = asyncio.Event()

        async def work(channel, *args):
            if channel.id == 1:
                entered.set()
                await release.wait()

        worker = self.namespace["_process_message"]
        worker.side_effect = work
        channel = SimpleNamespace(id=1, send=AsyncMock())
        first = asyncio.create_task(self.call(channel, None, "first", [], None))
        await entered.wait()
        try:
            await self.call(channel, None, "second", [], None)
            channel.send.assert_awaited_once()
            await self.call(SimpleNamespace(id=2, send=AsyncMock()), None, "other", [], None)
            self.assertEqual(worker.await_count, 2)
        finally:
            release.set()
            await first
        self.assertEqual(self.namespace["_active_conversations"], set())

    async def test_failure_and_cancellation_release_admission(self):
        channel = SimpleNamespace(id=1, send=AsyncMock())
        for error in (RuntimeError("failed"), asyncio.CancelledError()):
            self.namespace["_process_message"].side_effect = error
            with self.assertRaises(type(error)):
                await self.call(channel, None, "test", [], None)
            self.assertEqual(self.namespace["_active_conversations"], set())
