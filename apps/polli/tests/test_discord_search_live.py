"""Opt-in, read-only Discord gateway integration matrix."""

import asyncio
import os
import unittest
from typing import TypedDict

import discord
from src.core.config import config
from src.discord.search import discord_search_client, tool_discord_search

LIVE_ENABLED = os.getenv("POLLI_DISCORD_LIVE") == "1"


class LiveIds(TypedDict):
    guild_id: int
    requester_id: int
    public_channel_id: int
    message_id: int
    message_query: str
    thread_id: int
    role_id: int
    expected_role_count: int


REQUIRED_ENVIRONMENT = (
    "POLLI_DISCORD_LIVE_GUILD_ID",
    "POLLI_DISCORD_LIVE_REQUESTER_ID",
    "POLLI_DISCORD_LIVE_PUBLIC_CHANNEL_ID",
    "POLLI_DISCORD_LIVE_MESSAGE_ID",
    "POLLI_DISCORD_LIVE_MESSAGE_QUERY",
    "POLLI_DISCORD_LIVE_THREAD_ID",
    "POLLI_DISCORD_LIVE_ROLE_ID",
    "POLLI_DISCORD_LIVE_EXPECTED_ROLE_COUNT",
)


def required_live_ids() -> LiveIds:
    missing = [name for name in REQUIRED_ENVIRONMENT if not os.getenv(name)]
    if missing:
        raise RuntimeError("POLLI_DISCORD_LIVE=1 requires: " + ", ".join(missing))
    try:
        return {
            "guild_id": int(os.environ["POLLI_DISCORD_LIVE_GUILD_ID"]),
            "requester_id": int(os.environ["POLLI_DISCORD_LIVE_REQUESTER_ID"]),
            "public_channel_id": int(os.environ["POLLI_DISCORD_LIVE_PUBLIC_CHANNEL_ID"]),
            "message_id": int(os.environ["POLLI_DISCORD_LIVE_MESSAGE_ID"]),
            "message_query": os.environ["POLLI_DISCORD_LIVE_MESSAGE_QUERY"],
            "thread_id": int(os.environ["POLLI_DISCORD_LIVE_THREAD_ID"]),
            "role_id": int(os.environ["POLLI_DISCORD_LIVE_ROLE_ID"]),
            "expected_role_count": int(os.environ["POLLI_DISCORD_LIVE_EXPECTED_ROLE_COUNT"]),
        }
    except ValueError as error:
        raise RuntimeError("POLLI_DISCORD_LIVE ID and count values must be integers") from error


@unittest.skipUnless(LIVE_ENABLED, "set POLLI_DISCORD_LIVE=1 to run live Discord tests")
class DiscordSearchLiveIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.ids = required_live_ids()
        if not config.discord.token:
            raise RuntimeError("DISCORD_TOKEN must be configured for live Discord tests")

        intents = discord.Intents.none()
        intents.guilds = True
        intents.members = True
        intents.message_content = True
        self.client = discord.Client(intents=intents, chunk_guilds_at_startup=False)
        await self.client.__aenter__()
        self.addAsyncCleanup(self.client.__aexit__, None, None, None)
        self.addAsyncCleanup(discord_search_client.close)
        self.client_task = asyncio.create_task(self.client.start(config.discord.token))
        self.addAsyncCleanup(self._close_client_task)
        try:
            await asyncio.wait_for(self.client.wait_until_ready(), timeout=90)
        except TimeoutError as error:
            raise RuntimeError("Discord gateway did not become ready within 90 seconds") from error

        self.guild = self.client.get_guild(self.ids["guild_id"])
        if self.guild is None:
            raise RuntimeError("Configured live guild is not available through the Discord gateway")
        self.requester = self.guild.get_member(self.ids["requester_id"])
        if self.requester is None:
            self.requester = await self.guild.fetch_member(self.ids["requester_id"])
        if self.requester is None:
            raise RuntimeError("Configured live requester is not a member of the configured guild")
        self.public_channel = self.guild.get_channel(self.ids["public_channel_id"])
        if self.public_channel is None:
            self.public_channel = await self.client.fetch_channel(self.ids["public_channel_id"])
        if not isinstance(self.public_channel, discord.TextChannel):
            raise RuntimeError("Configured live public channel must be a text channel")
        self.thread = self.guild.get_thread(self.ids["thread_id"])
        if self.thread is None:
            self.thread = await self.client.fetch_channel(self.ids["thread_id"])
        if not isinstance(self.thread, discord.Thread):
            raise RuntimeError("Configured live thread must be a Discord thread")
        self.role = self.guild.get_role(self.ids["role_id"])
        if self.role is None:
            raise RuntimeError("Configured live role is not available through the Discord gateway")

        self.discord_context = {
            "discord_guild": self.guild,
            "discord_bot": self.client,
            "user_id": self.requester.id,
        }
        self.http_context = {
            "discord_guild": self.guild,
            "discord_bot": self.client,
            "is_http_api": True,
        }

    async def _close_client_task(self) -> None:
        if not self.client.is_closed():
            await self.client.close()
        await self.client_task

    async def test_read_only_search_matrix(self) -> None:
        with self.subTest(action="role members"):
            self.assertFalse(self.guild.chunked)
            role_members = await tool_discord_search(
                "members", 10, role_id=self.ids["role_id"], _context=self.discord_context
            )
            self.assertTrue(role_members.get("success"), role_members.get("error"))
            self.assertTrue(self.guild.chunked)
            self.assertEqual(10, role_members["returned"])
            self.assertEqual(self.ids["expected_role_count"], role_members["total"])
            self.assertEqual(10, len(role_members["members"]))

        with self.subTest(action="messages"):
            result = await tool_discord_search(
                "messages",
                25,
                query=self.ids["message_query"],
                channel_id=self.ids["public_channel_id"],
                _context=self.discord_context,
            )
            self.assertTrue(result.get("success"), result.get("error"))
            matching = [item for item in result["messages"] if item["id"] == str(self.ids["message_id"])]
            self.assertEqual(1, len(matching))
            self.assertEqual(
                f"https://discord.com/channels/{self.ids['guild_id']}/{self.ids['public_channel_id']}/{self.ids['message_id']}",
                matching[0]["jump_url"],
            )

        with self.subTest(action="members"):
            result = await tool_discord_search("members", 10, query=self.requester.name, _context=self.discord_context)
            self.assertTrue(result.get("success"), result.get("error"))
            self.assertIn(str(self.requester.id), {item["id"] for item in result["members"]})

        with self.subTest(action="roles"):
            result = await tool_discord_search("roles", 10, query=self.role.name, _context=self.discord_context)
            self.assertTrue(result.get("success"), result.get("error"))
            matches = [item for item in result["roles"] if item["id"] == str(self.ids["role_id"])]
            self.assertEqual(1, len(matches))
            self.assertEqual(self.ids["expected_role_count"], matches[0]["member_count"])

        for action, kwargs, key, expected in (
            ("channels", {"query": self.public_channel.name}, "channels", str(self.ids["public_channel_id"])),
            ("threads", {"query": self.thread.name, "include_archived": False}, "threads", str(self.ids["thread_id"])),
        ):
            with self.subTest(action=action):
                result = await tool_discord_search(action, 25, _context=self.discord_context, **kwargs)
                self.assertTrue(result.get("success"), result.get("error"))
                self.assertIn(expected, {item["id"] for item in result[key]})

        with self.subTest(action="history"):
            result = await tool_discord_search(
                "history",
                1,
                channel_id=self.ids["public_channel_id"],
                before=str(self.ids["message_id"] + 1),
                _context=self.discord_context,
            )
            self.assertTrue(result.get("success"), result.get("error"))
            self.assertEqual(str(self.ids["message_id"]), result["messages"][0]["id"])

        with self.subTest(action="context"):
            result = await tool_discord_search(
                "context",
                2,
                channel_id=self.ids["public_channel_id"],
                message_id=self.ids["message_id"],
                _context=self.discord_context,
            )
            self.assertTrue(result.get("success"), result.get("error"))
            self.assertEqual(str(self.ids["message_id"]), result["target"]["id"])

        with self.subTest(action="thread history"):
            result = await tool_discord_search(
                "thread_history", 1, thread_id=self.ids["thread_id"], _context=self.discord_context
            )
            self.assertTrue(result.get("success"), result.get("error"))
            self.assertEqual(str(self.ids["thread_id"]), result["thread_id"])
            self.assertGreaterEqual(result["showing"], 1)

        with self.subTest(action="HTTP messages"):
            result = await tool_discord_search(
                "messages",
                25,
                query=self.ids["message_query"],
                channel_id=self.ids["public_channel_id"],
                _context=self.http_context,
            )
            self.assertTrue(result.get("success"), result.get("error"))
            self.assertIn(str(self.ids["message_id"]), {item["id"] for item in result["messages"]})
            self.assertTrue(
                all(item["channel_id"] == str(self.ids["public_channel_id"]) for item in result["messages"])
            )

        with self.subTest(action="HTTP channels"):
            result = await tool_discord_search(
                "channels", 25, query=self.public_channel.name, _context=self.http_context
            )
            self.assertTrue(result.get("success"), result.get("error"))
            self.assertIn(str(self.ids["public_channel_id"]), {item["id"] for item in result["channels"]})

        for action in ("members", "roles"):
            with self.subTest(action=f"HTTP {action}"):
                result = await tool_discord_search(action, 10, _context=self.http_context)
                self.assertIn("only from Discord", result.get("error", ""))


if __name__ == "__main__":
    unittest.main()
