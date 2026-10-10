import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.context.evidence import MAX_RESULT_CHARS, ToolEvidenceStore


def call(name, arguments='{"query": "flux"}'):
    return {"id": "1", "function": {"name": name, "arguments": arguments}}


class ToolEvidenceStoreTests(unittest.TestCase):
    def test_renders_successful_results_for_the_same_thread_and_user(self):
        store = ToolEvidenceStore()
        store.record(
            10,
            1,
            [call("polli:code_search"), call("web_scrape")],
            [{"model": "flux", "provider": "io.net", "_image": "data:image/png;base64,AAA"}, {"error": "timeout"}],
        )
        text = store.render(10, 1)
        self.assertIn('code_search({"query": "flux"})', text)
        self.assertIn('"provider":"io.net"', text)
        self.assertIn("do not overturn it without new evidence", text)
        self.assertNotIn("polli:", text)
        self.assertNotIn("_image", text)
        self.assertNotIn("web_scrape", text)  # failed lookups are not evidence

    def test_evidence_is_scoped_to_thread_and_requester(self):
        store = ToolEvidenceStore()
        store.record(10, 1, [call("github_issue")], [{"title": "private"}])
        self.assertIsNone(store.render(10, 2))
        self.assertIsNone(store.render(11, 1))
        store.clear(10)
        self.assertIsNone(store.render(10, 1))

    def test_bounded_size(self):
        store = ToolEvidenceStore(max_threads=2, max_entries=3)
        store.record(1, 1, [call("a")], ["x" * (MAX_RESULT_CHARS * 2)])
        self.assertLess(len(store.render(1, 1)), MAX_RESULT_CHARS + 600)
        store.record(1, 1, [call(f"t{i}") for i in range(5)], ["ok"] * 5)
        text = store.render(1, 1)
        self.assertNotIn("t1(", text)
        self.assertIn("t2(", text)
        self.assertIn("t4(", text)
        store.record(2, 1, [call("b")], ["ok"])
        store.record(3, 1, [call("c")], ["ok"])
        self.assertIsNone(store.render(1, 1))  # least recently updated thread evicted
        self.assertIsNotNone(store.render(3, 1))

    def test_render_without_entries_returns_none(self):
        self.assertIsNone(ToolEvidenceStore().render(1, 1))

    def test_timestamp_is_shown(self):
        store = ToolEvidenceStore()
        with patch("src.context.evidence.time.time", return_value=0):
            store.record(1, 1, [call("a")], [{"ok": True}])
        self.assertIn("[00:00 UTC] a(", store.render(1, 1))


class BotFollowUpTests(unittest.IsolatedAsyncioTestCase):
    async def test_follow_up_turn_sees_previous_tool_evidence(self):
        from src import bot

        store = ToolEvidenceStore()
        session = SimpleNamespace(thread_id=42, channel_id=7, original_author_name="Ana")
        channel = SimpleNamespace(id=42, guild=None)
        user = SimpleNamespace(id=5, name="ana", display_name="Ana", roles=[])
        turns = [
            {
                "response": "flux runs on io.net",
                "tool_calls": [call("code_search")],
                "tool_results": [{"provider": "io.net"}],
            },
            {"response": "still io.net", "tool_calls": [], "tool_results": []},
        ]
        process = AsyncMock(side_effect=turns)
        with (
            patch.object(bot, "tool_evidence", store),
            patch.object(bot.pollinations_client, "process_with_tools", process),
            patch.object(bot, "send_long_message", AsyncMock()),
        ):
            await bot._process_message(
                channel, user, "which provider?", [], session, [{"role": "user", "content": "q"}]
            )
            await bot._process_message(channel, user, "are you sure?", [], session, [{"role": "user", "content": "q"}])

        first, second = (c.kwargs["thread_history"] for c in process.await_args_list)
        self.assertEqual(first, [{"role": "user", "content": "q"}])
        self.assertEqual(second[0], {"role": "user", "content": "q"})
        self.assertEqual(second[-1]["role"], "system")
        self.assertIn('code_search({"query": "flux"}) → {"provider":"io.net"}', second[-1]["content"])
        self.assertIsNone(store.render(42, 6))  # another requester in the thread sees nothing


if __name__ == "__main__":
    unittest.main()
