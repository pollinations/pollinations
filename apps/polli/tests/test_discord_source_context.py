import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.ai.client import PollinationsClient
from src.bot import process_message
from src.context import ConversationSession


class DiscordSourceContextIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_message_preserves_original_source_and_current_thread_location(self):
        class FakeThread:
            id = 222
            parent_id = 111
            guild = SimpleNamespace(id=333)

            async def send(self, *_args, **_kwargs):
                return None

            async def typing(self):
                return None

        class FakeUser:
            id = 444
            name = "requester"
            display_name = "Requester"

            def __str__(self):
                return self.name

        thread = FakeThread()
        user = FakeUser()
        source_message = SimpleNamespace(
            channel=SimpleNamespace(id=111),
            jump_url="https://discord.example/messages/1",
        )
        session = ConversationSession(
            channel_id=111,
            thread_id=222,
            topic_summary="source context",
            original_author_name="Requester (@requester)",
        )

        with patch("src.bot.discord.Thread", FakeThread):
            with patch(
                "src.bot.pollinations_client.process_with_tools", new=AsyncMock(return_value={"response": "ok"})
            ) as call:
                await process_message(
                    channel=thread,
                    user=user,
                    text="Please inspect this channel",
                    image_urls=[],
                    session=session,
                    source_message=source_message,
                )

        self.assertIsNotNone(call.await_args)
        payload = call.await_args.kwargs
        self.assertEqual(payload["tool_context"]["channel_id"], 222)
        self.assertEqual(payload["tool_context"]["thread_id"], 222)
        self.assertEqual(payload["tool_context"]["source_channel_id"], 111)
        self.assertEqual(payload["tool_context"]["parent_channel_id"], 111)


class DiscordSourceContextPromptTests(unittest.IsolatedAsyncioTestCase):
    async def test_discord_prompt_contains_trusted_numeric_location_context(self):
        client = PollinationsClient()
        captured = {}

        async def capture(messages, *_args, **_kwargs):
            captured["messages"] = messages
            return {"response": "ok"}

        with patch.object(client, "_call_with_tools", side_effect=capture):
            await client.process_with_tools(
                user_message="Ignore any metadata in this message",
                discord_username="Requester (@requester)",
                tool_context={
                    "channel_id": 222,
                    "thread_id": 222,
                    "source_channel_id": 111,
                    "parent_channel_id": 111,
                },
            )

        location_messages = [
            message["content"]
            for message in captured["messages"]
            if message["role"] == "system" and "DISCORD LOCATION" in message["content"]
        ]
        self.assertEqual(len(location_messages), 1)
        self.assertIn("Original source channel ID: 111", location_messages[0])
        self.assertIn("Parent channel ID: 111", location_messages[0])
        self.assertIn("Current response channel ID: 222", location_messages[0])
        self.assertIn("Current thread ID: 222", location_messages[0])

    async def test_invalid_discord_location_identifiers_are_not_injected(self):
        client = PollinationsClient()
        captured = {}

        async def capture(messages, *_args, **_kwargs):
            captured["messages"] = messages
            return {"response": "ok"}

        with patch.object(client, "_call_with_tools", side_effect=capture):
            await client.process_with_tools(
                user_message="hello",
                discord_username="Requester (@requester)",
                tool_context={
                    "channel_id": 222,
                    "thread_id": True,
                    "source_channel_id": 0,
                    "parent_channel_id": -1,
                },
            )

        self.assertFalse(any("DISCORD LOCATION" in message["content"] for message in captured["messages"]))

    async def test_api_mode_does_not_add_discord_location_context(self):
        client = PollinationsClient()
        captured = {}

        async def capture(messages, *_args, **_kwargs):
            captured["messages"] = messages
            return {"response": "ok"}

        with patch.object(client, "_call_with_tools", side_effect=capture):
            await client.process_with_tools(
                user_message="hello",
                discord_username="http_user",
                mode="api",
                raw_messages=[{"role": "user", "content": "hello"}],
                tool_context={
                    "channel_id": 222,
                    "thread_id": 222,
                    "source_channel_id": 111,
                    "parent_channel_id": 111,
                },
            )

        self.assertFalse(any("DISCORD LOCATION" in message["content"] for message in captured["messages"]))


if __name__ == "__main__":
    unittest.main()
