import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.discord.search import DiscordSearchClient, _thread_is_accessible, tool_discord_search


class FakePermissions:
    def __init__(self, *, view_channel=True, read_message_history=True, manage_threads=False):
        self.view_channel = view_channel
        self.read_message_history = read_message_history
        self.manage_threads = manage_threads


class FakeThread:
    def __init__(self, *, private=True, members=(), permissions=None, guild=None):
        self.id: int = 0
        self.name: str = ""
        self.type = "private_thread" if private else "public_thread"
        self.members = list(members)
        self.guild = guild
        self._permissions = permissions or FakePermissions()

    def permissions_for(self, _member):
        return self._permissions


class ThreadAuthorizationTests(unittest.TestCase):
    def test_private_thread_requires_membership_and_read_history(self):
        member = SimpleNamespace(id=1)
        self.assertFalse(_thread_is_accessible(FakeThread(members=[]), member))
        self.assertTrue(_thread_is_accessible(FakeThread(members=[member]), member))
        self.assertFalse(
            _thread_is_accessible(
                FakeThread(members=[member], permissions=FakePermissions(read_message_history=False)), member
            )
        )


class MemberCacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_name_and_role_filters_are_combined(self):
        wanted = SimpleNamespace(id=9)
        matching = SimpleNamespace(
            id=1, name="anna", display_name="Anna", nick=None, roles=[wanted], joined_at=None, bot=False
        )
        excluded = SimpleNamespace(
            id=2, name="annb", display_name="Ann B", nick=None, roles=[], joined_at=None, bot=False
        )
        wanted.name = "wanted"
        matching.roles = [SimpleNamespace(id=0, name="@everyone"), wanted]
        excluded.roles = [SimpleNamespace(id=0, name="@everyone")]
        guild = SimpleNamespace(chunked=True, members=[matching, excluded], query_members=AsyncMock(return_value=[]))
        result = await DiscordSearchClient().search_members(guild, query="ann", role_id=9, limit=10)
        self.assertEqual([member["id"] for member in result["members"]], ["1"])
        self.assertIsNone(result["total"])


class HandlerValidationAndScopeTests(unittest.IsolatedAsyncioTestCase):
    def guild(self, channels=(), threads=()):
        return SimpleNamespace(
            id=1,
            me=None,
            channels=list(channels),
            threads=list(threads),
            default_role=object(),
            get_member=lambda _id: None,
            get_channel=lambda identifier: next((c for c in channels if c.id == identifier), None),
            get_thread=lambda identifier: next((t for t in threads if t.id == identifier), None),
        )

    async def test_invalid_ids_dates_and_offset_fail_at_boundary(self):
        context = {"discord_guild": self.guild()}
        for kwargs in ({"channel_id": "nope"}, {"before": "not-a-snowflake"}, {"offset": -1}):
            result = await tool_discord_search("messages", 5, query="x", _context=context, **kwargs)
            self.assertIn("error", result)

    async def test_unresolved_explicit_channel_name_never_searches_guild(self):
        channel = SimpleNamespace(id=10, name="general", permissions_for=lambda _role: FakePermissions())
        guild = self.guild([channel])
        guild.me = object()
        guild.get_member = lambda _id: object()
        context = {"discord_guild": guild, "user_id": 1}
        with patch("src.discord.search.discord_search_client.search_messages", AsyncMock()) as search:
            result = await tool_discord_search("messages", 5, query="x", channel_name="missing", _context=context)
        self.assertIn("not found", result["error"])
        search.assert_not_awaited()

    async def test_http_ignores_member_identity_for_private_thread(self):
        member = SimpleNamespace(id=1)
        thread = FakeThread(members=[member])
        thread.id = 55
        thread.name = "private"
        context = {"is_http_api": True, "discord_guild": self.guild(threads=[thread]), "user_id": 1}
        with patch("src.discord.search.discord.Thread", FakeThread):
            result = await tool_discord_search("thread_history", 5, thread_id=55, _context=context)
        self.assertIn("permission", result["error"])

    async def test_cached_thread_resolves_as_context_channel(self):
        thread = FakeThread(private=False)
        thread.id = 55
        thread.name = "cached"
        guild = self.guild(threads=[thread])
        guild.me = object()
        guild.get_member = lambda _id: object()
        guild.get_channel = lambda _id: None
        with patch("src.discord.search.discord.Thread", FakeThread):
            with patch(
                "src.discord.search.discord_search_client.get_message_context",
                AsyncMock(return_value={"success": True}),
            ) as context:
                result = await tool_discord_search(
                    "context", 5, channel_id=55, message_id=10, _context={"discord_guild": guild, "user_id": 1}
                )
        self.assertTrue(result["success"])
        self.assertIs(context.await_args.kwargs["channel"], thread)

    async def test_history_requires_read_message_history(self):
        channel = SimpleNamespace(
            id=10, name="private", permissions_for=lambda _member: FakePermissions(read_message_history=False)
        )
        guild = self.guild([channel])
        guild.me = object()
        guild.get_member = lambda _id: object()
        context = {"discord_guild": guild, "channel_id": 10, "user_id": 1}
        result = await tool_discord_search("history", 5, _context=context)
        self.assertIn("permission", result["error"])


class SearchClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_short_page_does_not_claim_no_more_results(self):
        client = DiscordSearchClient()
        response = AsyncMock(status=200)
        response.json.return_value = {
            "total_results": 99,
            "messages": [[{"id": "1", "channel_id": "10", "content": "public"}]],
        }
        request = AsyncMock()
        request.__aenter__.return_value = response
        client.get_session = AsyncMock(return_value=SimpleNamespace(get=lambda *_args, **_kwargs: request))
        result = await client.search_messages(1, "hello", limit=10, accessible_channel_ids={10})
        self.assertIsNone(result["has_more"])

    async def test_429_waits_for_full_retry_after_and_cancellation_propagates(self):
        client = DiscordSearchClient()
        limited = AsyncMock(status=429)
        limited.json.return_value = {"retry_after": 11}
        request = AsyncMock()
        request.__aenter__.return_value = limited
        client.get_session = AsyncMock(return_value=SimpleNamespace(get=lambda *_args, **_kwargs: request))
        with patch("src.discord.search.asyncio.sleep", AsyncMock(side_effect=asyncio.CancelledError)) as sleep:
            with self.assertRaises(asyncio.CancelledError):
                await client.search_messages(1, "hello")
        sleep.assert_awaited_once_with(11.0)


class ThreadHistoryRegressionTests(unittest.IsolatedAsyncioTestCase):
    async def test_oldest_first_history_does_not_advertise_an_older_page(self):
        client = DiscordSearchClient()
        first = SimpleNamespace(
            id=10,
            content="first",
            author=SimpleNamespace(id=1, name="one"),
            created_at=SimpleNamespace(isoformat=lambda: "first"),
            attachments=[],
            jump_url="first-url",
        )
        second = SimpleNamespace(
            id=20,
            content="second",
            author=SimpleNamespace(id=2, name="two"),
            created_at=SimpleNamespace(isoformat=lambda: "second"),
            attachments=[],
            jump_url="second-url",
        )
        history_calls = []

        async def history(**kwargs):
            history_calls.append(kwargs)
            for message in (first, second):
                yield message

        thread = SimpleNamespace(
            id=55,
            name="thread",
            parent=SimpleNamespace(name="parent"),
            owner_id=None,
            created_at=None,
            archived=False,
            locked=False,
            message_count=999,
            history=history,
        )
        result = await client.get_thread_history(thread, limit=2, before=99, oldest_first=True)

        self.assertTrue(history_calls[0]["oldest_first"])
        self.assertEqual(history_calls[0]["before"].id, 99)
        self.assertEqual([message["id"] for message in result["messages"]], ["10", "20"])
        self.assertIsNone(result["oldest_id"])
        self.assertEqual(result["reported_message_count"], 999)
        self.assertEqual(result["retrieved_message_count"], 2)
        self.assertNotIn("total_messages", result)
        self.assertIsNone(result["has_more"])
        self.assertNotIn("before=", result["note"])

    async def test_history_desc_and_asc_use_truthful_pagination(self):
        client = DiscordSearchClient()
        messages = [
            SimpleNamespace(
                id=message_id,
                content=str(message_id),
                author=SimpleNamespace(id=message_id, name=str(message_id)),
                created_at=SimpleNamespace(isoformat=lambda: "time"),
                attachments=[],
                jump_url="url",
            )
            for message_id in (30, 20)
        ]
        calls = []

        async def history(**kwargs):
            calls.append(kwargs)
            for message in messages:
                yield message

        thread = SimpleNamespace(
            id=55,
            name="thread",
            parent=None,
            owner_id=None,
            created_at=None,
            archived=False,
            locked=False,
            message_count=2,
            history=history,
        )
        descending = await client.get_thread_history(thread, limit=2)
        ascending = await client.get_thread_history(thread, limit=2, oldest_first=True)

        self.assertFalse(calls[0]["oldest_first"])
        self.assertTrue(calls[1]["oldest_first"])
        self.assertTrue(descending["has_more"])
        self.assertIn("before=20", descending["note"])
        self.assertIsNone(ascending["has_more"])
        self.assertNotIn("before=", ascending["note"])


class RegressionCoverageTests(unittest.IsolatedAsyncioTestCase):
    async def test_malformed_grouped_payload_returns_sanitized_error(self):
        client = DiscordSearchClient()
        response = AsyncMock(status=200)
        response.json.return_value = {"messages": {"not": "a list"}}
        request = AsyncMock()
        request.__aenter__.return_value = response
        client.get_session = AsyncMock(return_value=SimpleNamespace(get=lambda *_args, **_kwargs: request))
        result = await client.search_messages(1, "x")
        self.assertEqual(result["error"], "Discord search returned an invalid response.")

    async def test_filtered_results_hide_upstream_pagination(self):
        client = DiscordSearchClient()
        response = AsyncMock(status=200)
        response.json.return_value = {
            "total_results": 999,
            "messages": [[{"id": "1", "channel_id": "20", "content": "private"}]],
        }
        request = AsyncMock()
        request.__aenter__.return_value = response
        client.get_session = AsyncMock(return_value=SimpleNamespace(get=lambda *_args, **_kwargs: request))
        result = await client.search_messages(1, "x", accessible_channel_ids={10})
        self.assertEqual(result["returned"], 0)
        self.assertIsNone(result["has_more"])
        self.assertNotIn("total_results", result)

    async def test_invalid_action_and_id_do_not_reach_network(self):
        context = {"discord_guild": SimpleNamespace()}
        invalid_action = await tool_discord_search("nope", 5, _context=context)
        invalid_id = await tool_discord_search("messages", 5, query="x", channel_id="12junk", _context=context)
        self.assertIn("action", invalid_action["error"])
        self.assertIn("channel_id", invalid_id["error"])

    async def test_http_privileged_requester_cannot_expand_regular_channel_scope(self):
        requester = object()
        everyone = object()
        bot_member = object()
        channel = SimpleNamespace(
            id=10,
            name="private",
            permissions_for=lambda member: (
                FakePermissions() if member in (requester, bot_member) else FakePermissions(view_channel=False)
            ),
        )
        guild = SimpleNamespace(
            id=1,
            me=bot_member,
            channels=[channel],
            threads=[],
            default_role=everyone,
            get_member=lambda _id: requester,
            get_channel=lambda _id: channel,
        )
        with patch("src.discord.search.discord_search_client.search_messages", AsyncMock()) as search:
            result = await tool_discord_search(
                "messages",
                5,
                query="x",
                channel_id=10,
                _context={"discord_guild": guild, "is_http_api": True, "user_id": 1},
            )
        self.assertIn("permission", result["error"])
        search.assert_not_awaited()

    async def test_authorized_fetched_channel_is_in_postfilter_scope(self):
        bot_member = object()
        requester = object()
        channel = SimpleNamespace(id=10, name="archived", permissions_for=lambda _member: FakePermissions())
        bot = SimpleNamespace(fetch_channel=AsyncMock(return_value=channel))
        guild = SimpleNamespace(
            id=1,
            me=bot_member,
            channels=[],
            threads=[],
            default_role=object(),
            get_member=lambda _id: requester,
            get_channel=lambda _id: None,
        )
        with patch(
            "src.discord.search.discord_search_client.search_messages", AsyncMock(return_value={"success": True})
        ) as search:
            await tool_discord_search(
                "messages",
                5,
                query="x",
                channel_id=10,
                _context={"discord_guild": guild, "discord_bot": bot, "user_id": 1},
            )
        call = search.await_args
        self.assertIsNotNone(call)
        assert call is not None
        self.assertIn(10, call.kwargs["accessible_channel_ids"])

    async def test_missing_requester_denies_public_thread_and_roles_before_helpers(self):
        thread = FakeThread(private=False)
        thread.id = 55
        thread.name = "public-thread"
        guild = SimpleNamespace(
            id=1,
            me=object(),
            channels=[],
            threads=[thread],
            default_role=object(),
            get_member=lambda _id: None,
            get_thread=lambda _id: thread,
            fetch_member=AsyncMock(side_effect=RuntimeError("missing")),
        )
        context = {"discord_guild": guild, "user_id": 1}
        with (
            patch("src.discord.search.discord.Thread", FakeThread),
            patch("src.discord.search.discord_search_client.get_thread_history", AsyncMock()) as history,
            patch("src.discord.search.discord_search_client.search_roles", AsyncMock()) as roles,
        ):
            thread_result = await tool_discord_search("thread_history", 5, thread_id=55, _context=context)
            role_result = await tool_discord_search("roles", 5, _context=context)
        self.assertEqual(thread_result["error"], "Unable to verify your Discord membership for this server.")
        self.assertEqual(role_result["error"], "Unable to verify your Discord membership for this server.")
        history.assert_not_awaited()
        roles.assert_not_awaited()

    async def test_role_name_filters_roles_without_query(self):
        role = SimpleNamespace(
            id=9,
            name="Moderator",
            color="blue",
            position=1,
            mentionable=True,
            members=[],
            mention="<@&9>",
        )
        guild = SimpleNamespace(
            id=1,
            me=object(),
            channels=[],
            threads=[],
            roles=[SimpleNamespace(name="@everyone"), role],
            default_role=object(),
            chunked=True,
            members=[],
            get_member=lambda _id: object(),
        )
        result = await tool_discord_search("roles", 5, role_name="mod", _context={"discord_guild": guild, "user_id": 1})
        self.assertEqual([item["id"] for item in result["roles"]], ["9"])

    async def test_missing_bot_member_fails_closed_before_search(self):
        channel = SimpleNamespace(id=10, name="public", permissions_for=lambda _member: FakePermissions())
        guild = SimpleNamespace(
            id=1,
            me=None,
            channels=[channel],
            threads=[],
            default_role=object(),
            get_member=lambda _id: object(),
            get_channel=lambda _id: channel,
        )
        with patch("src.discord.search.discord_search_client.search_messages", AsyncMock()) as search:
            result = await tool_discord_search(
                "messages", 5, query="x", channel_id=10, _context={"discord_guild": guild, "user_id": 1}
            )
        self.assertIn("permission", result["error"])
        search.assert_not_awaited()

    async def test_archived_fetched_thread_and_cross_guild_target_fail_before_history(self):
        guild = SimpleNamespace(
            id=1, me=object(), channels=[], threads=[], default_role=object(), get_member=lambda _id: None
        )
        foreign = SimpleNamespace(id=2)
        archived = FakeThread(private=True, permissions=FakePermissions(view_channel=False), guild=guild)
        archived.id = 55
        archived.name = "archived"
        foreign_thread = FakeThread(private=False, guild=foreign)
        foreign_thread.id = 56
        bot = SimpleNamespace(fetch_channel=AsyncMock(side_effect=[archived, foreign_thread]))
        guild.fetch_channel = bot.fetch_channel
        guild.get_thread = lambda _id: None
        requester = object()
        guild.get_member = lambda _id: requester
        context = {"discord_guild": guild, "discord_bot": bot, "user_id": 1}
        with (
            patch("src.discord.search.discord.Thread", FakeThread),
            patch("src.discord.search.discord_search_client.get_thread_history", AsyncMock()) as history,
        ):
            denied = await tool_discord_search("thread_history", 5, thread_id=55, _context=context)
            foreign_result = await tool_discord_search("thread_history", 5, thread_id=56, _context=context)
        self.assertIn("permission", denied["error"])
        self.assertIn("not found", foreign_result["error"])
        history.assert_not_awaited()

    async def test_name_and_role_uses_complete_cache_not_limited_name_page(self):
        role = SimpleNamespace(id=9, name="Wanted")
        other = SimpleNamespace(id=0, name="@everyone")
        match = SimpleNamespace(
            id=2, name="annb", display_name="Ann B", nick=None, roles=[other, role], joined_at=None, bot=False
        )
        guild = SimpleNamespace(chunked=True, members=[match], query_members=AsyncMock(return_value=[]))
        result = await DiscordSearchClient().search_members(guild, query="ann", role_id=9, limit=10)
        self.assertEqual([member["id"] for member in result["members"]], ["2"])
        guild.query_members.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
