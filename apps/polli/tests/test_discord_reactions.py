"""Unit tests for Polli Discord message reaction capability."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock

import discord
from src.ai.tool_filters import filter_api_tools, filter_tools_by_intent, get_tools_with_embeddings
from src.ai.tools import DISCORD_REACT_TOOL, GITHUB_TOOLS
from src.discord.reactions import (
    extract_id,
    parse_discord_message_link,
    parse_emoji_inputs,
    resolve_single_emoji,
    tool_discord_react,
)


class TestDiscordReactionsParsing(unittest.TestCase):
    def test_parse_discord_message_link(self):
        url = "https://discord.com/channels/123456789/987654321/1122334455"
        guild_id, channel_id, message_id = parse_discord_message_link(url)
        self.assertEqual(guild_id, 123456789)
        self.assertEqual(channel_id, 987654321)
        self.assertEqual(message_id, 1122334455)

        canary_url = "https://canary.discord.com/channels/111/222/333"
        g_id, c_id, m_id = parse_discord_message_link(canary_url)
        self.assertEqual((g_id, c_id, m_id), (111, 222, 333))

        ptb_url = "https://ptb.discordapp.com/channels/444/555/666"
        g_id, c_id, m_id = parse_discord_message_link(ptb_url)
        self.assertEqual((g_id, c_id, m_id), (444, 555, 666))

        invalid_url = "https://google.com/search?q=discord"
        self.assertEqual(parse_discord_message_link(invalid_url), (None, None, None))

    def test_extract_id(self):
        self.assertEqual(extract_id(12345), 12345)
        self.assertEqual(extract_id("987654321"), 987654321)
        self.assertEqual(extract_id("<#123456789>", r"<#(\d+)>"), 123456789)
        self.assertEqual(extract_id("<@!99887766>", r"<@!?(\d+)>"), 99887766)
        self.assertIsNone(extract_id("not-a-number"))
        self.assertIsNone(extract_id(-1))
        self.assertIsNone(extract_id(None))

    def test_resolve_single_emoji_unicode_and_shortcode(self):
        # Raw unicode emoji
        self.assertEqual(resolve_single_emoji("🐝"), "🐝")
        self.assertEqual(resolve_single_emoji("👍"), "👍")

        # Standard shortcode
        self.assertEqual(resolve_single_emoji(":thumbsup:"), "👍")
        self.assertEqual(resolve_single_emoji("thumbsup"), "👍")

        # Custom emoji string <:name:id>
        custom = resolve_single_emoji("<:bee:999888>")
        self.assertIsInstance(custom, discord.PartialEmoji)
        self.assertEqual(custom.name, "bee")
        self.assertEqual(custom.id, 999888)

    def test_resolve_single_emoji_guild_lookup(self):
        mock_guild = MagicMock()
        mock_custom_emoji = MagicMock()
        mock_custom_emoji.name = "polli_bee"
        mock_custom_emoji.id = 555666
        mock_guild.emojis = [mock_custom_emoji]

        res = resolve_single_emoji("polli_bee", guild=mock_guild)
        self.assertEqual(res, mock_custom_emoji)

        res_colon = resolve_single_emoji(":polli_bee:", guild=mock_guild)
        self.assertEqual(res_colon, mock_custom_emoji)

    def test_parse_emoji_inputs_multiple(self):
        emojis = parse_emoji_inputs(emoji="🐝 👍")
        self.assertEqual(emojis, ["🐝", "👍"])

        emojis_list = parse_emoji_inputs(emojis=["❤️", "🚀"])
        self.assertEqual(emojis_list, ["❤️", "🚀"])

        # Deduplication
        dup = parse_emoji_inputs(emoji="🐝", emojis=["🐝", "👍"])
        self.assertEqual(dup, ["🐝", "👍"])


class TestDiscordReactionsToolExecution(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.guild = MagicMock()
        self.guild.id = 123456
        self.guild.emojis = []

        self.bot_member = MagicMock()
        self.guild.me = self.bot_member

        self.user = MagicMock()
        self.user.id = 789012
        self.guild.get_member.return_value = self.user
        self.guild.fetch_member = AsyncMock(return_value=self.user)

        self.channel = MagicMock(spec=discord.TextChannel)
        self.channel.id = 333444
        self.channel.name = "general"
        self.channel.guild = self.guild

        # Setup permissions
        self.bot_perms = MagicMock()
        self.bot_perms.view_channel = True
        self.bot_perms.read_message_history = True
        self.bot_perms.add_reactions = True

        self.user_perms = MagicMock()
        self.user_perms.view_channel = True
        self.user_perms.read_message_history = True

        def permissions_for(member):
            if member == self.bot_member:
                return self.bot_perms
            return self.user_perms

        self.channel.permissions_for.side_effect = permissions_for
        self.guild.get_channel.return_value = self.channel

        self.message = MagicMock(spec=discord.Message)
        self.message.id = 999111
        self.message.jump_url = "https://discord.com/channels/123456/333444/999111"
        self.message.guild = self.guild
        self.message.channel = self.channel
        self.message.add_reaction = AsyncMock()
        self.message.remove_reaction = AsyncMock()
        self.channel.fetch_message = AsyncMock(return_value=self.message)

        self.context = {
            "discord_guild": self.guild,
            "discord_channel": self.channel,
            "channel_id": self.channel.id,
            "user_id": self.user.id,
            "message_id": self.message.id,
        }

    async def test_tool_discord_react_missing_context(self):
        res = await tool_discord_react(emoji="👍", _context=None)
        self.assertIn("error", res)

        res2 = await tool_discord_react(emoji="👍", _context={})
        self.assertIn("error", res2)

    async def test_tool_discord_react_invalid_action(self):
        res = await tool_discord_react(emoji="👍", action="invalid", _context=self.context)
        self.assertIn("error", res)
        self.assertIn("action must be 'add' or 'remove'", res["error"])

    async def test_tool_discord_react_missing_emoji(self):
        res = await tool_discord_react(message_id=self.message.id, emoji="", _context=self.context)
        self.assertIn("error", res)
        self.assertIn("emoji or emojis is required", res["error"])

    async def test_tool_discord_react_add_success(self):
        res = await tool_discord_react(
            message_id=self.message.id,
            emoji="🐝",
            action="add",
            _context=self.context,
        )
        self.assertTrue(res.get("success"))
        self.assertEqual(res["action"], "add")
        self.assertEqual(res["message_id"], self.message.id)
        self.assertEqual(res["channel_id"], self.channel.id)
        self.assertEqual(res["reactions"], ["🐝"])
        self.message.add_reaction.assert_awaited_once_with("🐝")

    async def test_tool_discord_react_remove_success(self):
        res = await tool_discord_react(
            message_id=self.message.id,
            emoji="🐝",
            action="remove",
            _context=self.context,
        )
        self.assertTrue(res.get("success"))
        self.assertEqual(res["action"], "remove")
        self.assertEqual(res["reactions"], ["🐝"])
        self.message.remove_reaction.assert_awaited_once_with("🐝", self.bot_member)

    async def test_tool_discord_react_via_message_url(self):
        target_url = "https://discord.com/channels/123456/333444/999111"
        res = await tool_discord_react(
            message_id=target_url,
            emoji="🚀",
            _context=self.context,
        )
        self.assertTrue(res.get("success"))
        self.assertEqual(res["message_id"], 999111)
        self.message.add_reaction.assert_awaited_once_with("🚀")

    async def test_tool_discord_react_context_default_message(self):
        # When message_id is omitted or 'current', defaults to context message
        res = await tool_discord_react(
            message_id=None,
            emoji="🎉",
            _context=self.context,
        )
        self.assertTrue(res.get("success"))
        self.assertEqual(res["message_id"], self.message.id)
        self.message.add_reaction.assert_awaited_once_with("🎉")

    async def test_tool_discord_react_bot_lacks_permission(self):
        self.bot_perms.add_reactions = False
        res = await tool_discord_react(
            message_id=self.message.id,
            emoji="👍",
            _context=self.context,
        )
        self.assertIn("error", res)
        self.assertIn("Add Reactions", res["error"])

    async def test_tool_discord_react_user_lacks_permission(self):
        self.user_perms.view_channel = False
        res = await tool_discord_react(
            message_id=self.message.id,
            emoji="👍",
            _context=self.context,
        )
        self.assertIn("error", res)
        self.assertIn("permission to view", res["error"])


class TestDiscordReactionsToolFiltering(unittest.TestCase):
    def test_intent_keywords_match_reaction_requests(self):
        queries = [
            "react with :bee: to that message",
            "add a reaction to message 12345",
            "attach 👍 emoji to the previous message",
            "upvote that message",
            "thumbs up that comment",
        ]
        for query in queries:
            filtered = filter_tools_by_intent(query, [DISCORD_REACT_TOOL])
            self.assertIn(DISCORD_REACT_TOOL, filtered, f"Query '{query}' did not match DISCORD_REACT_TOOL")

    def test_api_excludes_discord_react(self):
        tools = get_tools_with_embeddings(GITHUB_TOOLS, code_search_enabled=True)
        filtered = filter_api_tools(tools)
        names = {t["function"]["name"] for t in filtered}
        self.assertNotIn("discord_react", names)
        self.assertNotIn("discord_reaction", names)


if __name__ == "__main__":
    unittest.main()
