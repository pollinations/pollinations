import ast
import asyncio
import logging
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
        self.namespace = {
            "_conversation_queues": {},
            "_process_message": AsyncMock(return_value=[]),
            "logger": logging.getLogger("test.admission"),
            "discord": SimpleNamespace(Thread=type("Thread", (), {})),
        }
        exec(compile(ast.fix_missing_locations(module), str(path), "exec"), self.namespace)
        self.call = self.namespace["process_message"]

    async def test_overlap_queued_and_other_channel_runs(self):
        entered = asyncio.Event()
        release = asyncio.Event()

        processed = []

        async def work(channel, text, **kwargs):
            processed.append((channel.id, text))
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
            channel.send.assert_not_awaited()
            await self.call(SimpleNamespace(id=2, send=AsyncMock()), None, "other", [], None)
            self.assertEqual(worker.await_count, 2)
        finally:
            release.set()
            await first
        self.assertEqual(processed, [(1, "first"), (2, "other"), (1, "second")])
        self.assertEqual(self.namespace["_conversation_queues"], {})

    async def test_failure_reports_and_cancellation_release_admission(self):
        channel = SimpleNamespace(id=1, send=AsyncMock())
        user = SimpleNamespace(id=42)
        self.namespace["_process_message"].side_effect = RuntimeError("failed")
        await self.call(channel, user, "test", [], None)
        self.assertIn("<@42>", channel.send.await_args.args[0])
        self.assertEqual(self.namespace["_conversation_queues"], {})
        self.namespace["_process_message"].side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await self.call(channel, user, "test", [], None)
        self.assertEqual(self.namespace["_conversation_queues"], {})

    async def test_deferred_request_runs_under_its_own_user(self):
        processed = []
        user_a, user_b = SimpleNamespace(id=11), SimpleNamespace(id=22)
        channel = SimpleNamespace(id=1, send=AsyncMock())

        async def work(user, **kwargs):
            processed.append(user.id)
            if user.id == 11:
                return [dict(channel=channel, user=user_b, text="write", image_urls=[], session=None)]

        self.namespace["_process_message"].side_effect = work
        await self.call(channel, user_a, "read", [], None)
        self.assertEqual(processed, [11, 22])
        self.assertEqual(self.namespace["_conversation_queues"], {})
