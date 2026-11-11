import importlib.util
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

spec = importlib.util.spec_from_file_location("replies", Path(__file__).parents[1] / "src/discord/replies.py")
replies = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replies)


def plan(*items, defer=None):
    return "<polli_reply>" + json.dumps({"replies": items, "defer": defer or []}) + "</polli_reply>"


class DiscordReplyTests(unittest.IsolatedAsyncioTestCase):
    async def test_working_reaction_does_not_leak_planning_or_finish_request(self):
        await replies.deliver_working_reactions(
            "Private tool planning", channel=self.channel, messages=[self.message], send=self.send
        )
        self.send.assert_not_awaited()
        self.message.add_reaction.assert_not_awaited()
        await replies.deliver_working_reactions(
            plan({"message_ids": ["10"], "react": ["👀", "🐝"]}),
            channel=self.channel,
            messages=[self.message],
            send=self.send,
        )
        self.assertEqual(self.message.add_reaction.await_count, 2)
        self.send.assert_not_awaited()

    def setUp(self):
        self.channel = SimpleNamespace(id=1)
        self.message = SimpleNamespace(
            id=10, author=SimpleNamespace(id=100), channel=self.channel, reactions=[], add_reaction=AsyncMock()
        )
        self.send = AsyncMock()

    async def test_reaction_only_and_multiple_ai_chosen_emojis(self):
        await replies.deliver_reply(
            self.channel, plan({"message_ids": ["10"], "react": ["🐝", "😂", "🐝", "❤️"]}), [self.message], self.send
        )
        self.assertEqual([call.args[0] for call in self.message.add_reaction.await_args_list], ["🐝", "😂", "❤️"])
        self.send.assert_not_awaited()

    async def test_reaction_plus_text(self):
        await replies.deliver_reply(
            self.channel,
            plan({"message_ids": ["10"], "react": ["👍"], "text": "You're welcome!"}),
            [self.message],
            self.send,
        )
        self.message.add_reaction.assert_awaited_once_with("👍")
        self.assertEqual(self.send.await_args.args[1], "You're welcome!")

    async def test_cap_counts_existing_reactions_and_allows_joining_existing(self):
        self.message.reactions = [SimpleNamespace(emoji=chr(0x1F600 + i), me=False) for i in range(20)]
        await replies.deliver_reply(
            self.channel, plan({"message_ids": ["10"], "react": ["🐝", "😀"]}), [self.message], self.send
        )
        self.message.add_reaction.assert_awaited_once_with("😀")
        self.send.assert_not_awaited()

    async def test_permission_failure_falls_back_without_model_retry(self):
        self.message.add_reaction.side_effect = PermissionError("no access")
        await replies.deliver_reply(
            self.channel, plan({"message_ids": ["10"], "react": ["🐝"]}), [self.message], self.send
        )
        self.assertIn("couldn't add", self.send.await_args.args[1])

    async def test_combined_tags_users_and_separate_replies_and_deferral(self):
        second = SimpleNamespace(id=20, author=SimpleNamespace(id=200), channel=self.channel, reactions=[])
        await replies.deliver_reply(self.channel, "Both answers", [self.message, second], self.send)
        self.assertEqual(self.send.await_args.args[1], "<@100> <@200>\nBoth answers")
        self.send.reset_mock()
        await replies.deliver_reply(
            self.channel,
            plan({"message_ids": ["10"], "text": "first"}, {"message_ids": ["20"], "text": "second"}),
            [self.message, second],
            self.send,
        )
        self.assertEqual([call.kwargs["reply_to"].id for call in self.send.await_args_list], [10, 20])
        deferred = await replies.deliver_reply(
            self.channel, plan({"message_ids": ["20"], "text": "done"}, defer=["10"]), [self.message, second], self.send
        )
        self.assertEqual(deferred, ["10"])

    async def test_invalid_targets_and_emojis_have_no_side_effects(self):
        for item in [
            {"message_ids": ["999"], "react": ["🐝"]},
            {"message_ids": ["10", "10"], "text": "duplicate"},
            {"message_ids": ["10"], "react": ["hello"]},
            {"message_ids": ["10"], "react": ["🐝😂"]},
            {"message_ids": ["10"], "react": ["🐝"] * 21},
        ]:
            with self.assertRaises(ValueError):
                await replies.deliver_reply(self.channel, plan(item), [self.message], self.send)
        self.message.add_reaction.assert_not_awaited()
        self.send.assert_not_awaited()
