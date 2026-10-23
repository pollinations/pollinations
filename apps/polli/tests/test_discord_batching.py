import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.ai.client import PollinationsClient
from src.bot import process_message
from src.context.evidence import ToolEvidenceStore


def call(name, action):
    return {"id": "one", "type": "function", "function": {"name": name, "arguments": json.dumps({"action": action})}}


class DiscordBatchingTests(unittest.IsolatedAsyncioTestCase):
    async def test_ai_chosen_reaction_runs_before_tools_in_existing_round(self):
        client = PollinationsClient()
        events = []

        async def react(content):
            events.append("reaction")

        async def read(**kwargs):
            events.append("tool")
            return {"data": "done"}

        client.register_tool_handler("github_issue", read)
        responses = [
            {
                "content": '<polli_reply>{"replies":[{"message_ids":["10"],"react":["👀"]}]}</polli_reply>',
                "tool_calls": [call("github_issue", "get")],
            },
            {"content": "answer"},
        ]
        with patch.object(client, "_call_api_with_tools", side_effect=responses) as api:
            result = await client._call_with_tools([], "user", tool_context={"working_reaction": react})
        self.assertEqual(events, ["reaction", "tool"])
        self.assertEqual(api.await_count, 2)
        self.assertEqual(result["response"], "answer")

    async def test_mixed_user_write_is_blocked_before_dispatch_even_with_admin_context(self):
        client = PollinationsClient()
        handler = AsyncMock(return_value={"success": True})
        client.register_tool_handler("github_issue", handler)
        context = {"discord_mixed_batch": True, "is_admin": True, "user_id": 1}
        results = await client._execute_tools_parallel(
            [
                call("github_issue", "create"),
                call("github_issue", "CLOSE"),
                call("default_api:github_issue", "subscribe"),
            ],
            "admin",
            context,
        )
        self.assertTrue(all(result.get("error") for result in results))
        handler.assert_not_awaited()
        read = await client._execute_tools_parallel([call("github_issue", "get")], "admin", context)
        self.assertTrue(read[0]["success"])
        self.assertIs(handler.await_args.kwargs["_context"], context)
        separate = {"is_admin": False, "user_id": 2}
        await client._execute_tools_parallel([call("github_issue", "create")], "user", separate)
        self.assertIs(handler.await_args.kwargs["_context"], separate)

    async def test_message_arriving_during_tools_joins_existing_next_call(self):
        client = PollinationsClient()
        pending = []
        context = {}
        messages = [{"role": "user", "content": "first"}]

        def take_pending(**kwargs):
            result = pending[:]
            pending.clear()
            if result:
                context["discord_mixed_batch"] = True
            return result

        context["take_pending"] = take_pending

        async def read(**kwargs):
            pending.append(
                {
                    "source_message": SimpleNamespace(id=20, author=SimpleNamespace(id=2)),
                    "text": "second",
                    "image_urls": ["https://example.org/image.png"],
                    "file_urls": ["https://example.org/file.txt"],
                    "video_urls": [],
                }
            )
            return {"data": "first answer"}

        client.register_tool_handler("github_issue", read)
        snapshots = []

        async def api(current, tools, **kwargs):
            snapshots.append(json.loads(json.dumps({"messages": current, "tools": tools})))
            if len(snapshots) == 1:
                return {"tool_calls": [call("github_issue", "get")]}
            return {"content": "combined"}

        with patch.object(client, "_call_api_with_tools", side_effect=api):
            result = await client._call_with_tools(messages, "first", tool_context=context, is_admin=True)
        self.assertEqual(result["response"], "combined")
        self.assertEqual(len(snapshots), 2)
        self.assertIn("author <@2>", json.dumps(snapshots[1]["messages"]))
        self.assertIn("second", json.dumps(snapshots[1]["messages"]))
        self.assertIn("image.png", json.dumps(snapshots[1]["messages"]))
        issue = next(tool for tool in snapshots[1]["tools"] if tool["function"]["name"] == "github_issue")
        self.assertNotIn("create", issue["function"]["parameters"]["properties"]["action"]["enum"])

    async def test_late_message_is_seen_before_final_delivery(self):
        client = PollinationsClient()
        pending = []

        def take_pending(**kwargs):
            result = pending[:]
            pending.clear()
            return result

        async def api(messages, **kwargs):
            if not any("Another message arrived" in str(message) for message in messages):
                pending.append(
                    {
                        "source_message": SimpleNamespace(id=20, author=SimpleNamespace(id=1)),
                        "text": "also this",
                        "image_urls": [],
                    }
                )
                return {"content": "stale draft"}
            return {"content": "both answers"}

        with patch.object(client, "_call_api_with_tools", side_effect=api) as boundary:
            result = await client._call_with_tools([], "first", tool_context={"take_pending": take_pending})
        self.assertEqual(result["response"], "both answers")
        self.assertEqual(boundary.await_count, 2)

    async def test_api_mode_does_not_consume_discord_inbox(self):
        client = PollinationsClient()
        inbox = AsyncMock()
        with patch.object(client, "_call_api_with_tools", return_value={"content": "api answer"}):
            await client._call_with_tools([], "api", mode="api", tool_context={"take_pending": inbox})
        inbox.assert_not_called()


class DiscordConversationIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Tool evidence is per-thread process state; keep each test's turns isolated.
        evidence = patch("src.bot.tool_evidence", ToolEvidenceStore())
        evidence.start()
        self.addCleanup(evidence.stop)

    async def test_real_queue_client_and_delivery_combine_two_users(self):
        client = PollinationsClient()
        entered, release = asyncio.Event(), asyncio.Event()
        sent, reacted = [], []
        channel = SimpleNamespace(
            id=1,
            guild=SimpleNamespace(id=99),
            permissions_for=lambda user: SimpleNamespace(view_channel=True, read_message_history=True),
        )

        async def send(body, **kwargs):
            sent.append(body)

        channel.send = send

        def message(identifier, user):
            async def react(emoji):
                reacted.append((identifier, emoji))

            return SimpleNamespace(
                id=identifier,
                author=user,
                channel=channel,
                jump_url="https://discord.example/message",
                reactions=[],
                add_reaction=react,
                reply=send,
            )

        user_a = SimpleNamespace(id=100, name="a", display_name="A")
        user_b = SimpleNamespace(id=200, name="b", display_name="B")
        first, second = message(10, user_a), message(20, user_b)
        session = SimpleNamespace(original_author_name="A", channel_id=1, thread_id=1)
        snapshots = []

        async def api(messages, tools, **kwargs):
            snapshots.append(json.loads(json.dumps(messages)))
            if len(snapshots) == 1:
                entered.set()
                await release.wait()
                return {"content": "stale draft"}
            return {
                "content": '<polli_reply>{"replies":[{"message_ids":["10","20"],'
                '"text":"Both answered","react":["🐝","🌻"]}]}</polli_reply>'
            }

        with (
            patch("src.bot.pollinations_client", client),
            patch.object(client, "_call_api_with_tools", side_effect=api),
        ):
            task = asyncio.create_task(process_message(channel, user_a, "first", [], session, source_message=first))
            await entered.wait()
            await process_message(channel, user_b, "second", [], session, source_message=second)
            release.set()
            await task
        self.assertEqual(len(snapshots), 2)
        self.assertEqual(sent, ["<@100> <@200>\nBoth answered"])
        self.assertEqual(reacted, [(10, "🐝"), (10, "🌻"), (20, "🐝"), (20, "🌻")])

    async def test_new_user_after_tool_evidence_gets_an_isolated_turn(self):
        client = PollinationsClient()
        entered, release = asyncio.Event(), asyncio.Event()
        sent, snapshots = [], []
        channel = SimpleNamespace(id=1, guild=SimpleNamespace(id=99))

        async def send(body, **kwargs):
            sent.append(body)

        channel.send = send
        users = [SimpleNamespace(id=i, name=str(i), display_name=str(i)) for i in (100, 200)]
        messages = [
            SimpleNamespace(
                id=i, author=user, channel=channel, reactions=[], reply=send, jump_url="https://discord.example/message"
            )
            for i, user in zip((10, 20), users)
        ]
        session = SimpleNamespace(original_author_name="A", channel_id=1, thread_id=1)

        async def read(**kwargs):
            entered.set()
            await release.wait()
            return {"data": "restricted evidence"}

        async def api(current, **kwargs):
            snapshots.append(json.loads(json.dumps(current)))
            if len(snapshots) == 1:
                return {"tool_calls": [call("github_issue", "get")]}
            return {"content": "first answer" if len(snapshots) == 2 else "second answer"}

        client.register_tool_handler("github_issue", read)
        with (
            patch("src.bot.pollinations_client", client),
            patch.object(client, "_call_api_with_tools", side_effect=api),
        ):
            task = asyncio.create_task(
                process_message(channel, users[0], "first", [], session, source_message=messages[0])
            )
            await entered.wait()
            await process_message(channel, users[1], "second", [], session, source_message=messages[1])
            release.set()
            await task
        self.assertEqual(sent, ["first answer", "second answer"])
        self.assertEqual(len(snapshots), 3)
        self.assertIn("restricted evidence", json.dumps(snapshots[1]))
        self.assertNotIn("restricted evidence", json.dumps(snapshots[2]))
