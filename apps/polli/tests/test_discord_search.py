import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.discord.search import DiscordSearchClient, _thread_is_accessible, tool_discord_search


class FakePermissions:
    def __init__(self, *, view_channel=True, manage_threads=False, read_message_history=True):
        self.read_message_history = read_message_history
        self.view_channel = view_channel
        self.manage_threads = manage_threads


class FakeThread:
    def __init__(self, *, private=True, members=()):
        self.type = "private_thread" if private else "public_thread"
        self.members = list(members)
        self.parent = SimpleNamespace(permissions_for=lambda member: FakePermissions())

    def permissions_for(self, member):
        return FakePermissions()


class ThreadAuthorizationTests(unittest.TestCase):
    def test_public_api_never_reads_private_threads(self):
        self.assertFalse(_thread_is_accessible(FakeThread(), member=None))

    def test_private_thread_requires_membership(self):
        member = SimpleNamespace(id=1)
        self.assertFalse(_thread_is_accessible(FakeThread(members=[]), member))
        self.assertTrue(_thread_is_accessible(FakeThread(members=[SimpleNamespace(id=1)]), member))


class ApiScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_api_cannot_enumerate_members_or_roles(self):
        guild = SimpleNamespace(me=None, channels=[], threads=[], default_role=None, get_member=lambda _id: None)
        context = {"is_http_api": True, "discord_guild": guild}

        members = await tool_discord_search("members", 5, _context=context)
        roles = await tool_discord_search("roles", 5, _context=context)

        self.assertIn("only from Discord", members["error"])
        self.assertIn("only from Discord", roles["error"])

    async def test_api_message_search_is_limited_to_public_channels(self):
        public = SimpleNamespace(id=10, permissions_for=lambda _role: FakePermissions(view_channel=True))
        private = SimpleNamespace(id=20, permissions_for=lambda _role: FakePermissions(view_channel=False))
        guild = SimpleNamespace(
            id=1,
            me=object(),
            channels=[public, private],
            threads=[],
            default_role=object(),
            get_member=lambda _id: None,
        )
        context = {"is_http_api": True, "discord_guild": guild}

        search = AsyncMock(return_value={"success": True, "messages": []})
        with patch("src.discord.search.discord_search_client.search_messages", search):
            await tool_discord_search("messages", 5, query="hello", _context=context)

        call = search.await_args
        self.assertIsNotNone(call)
        assert call is not None
        self.assertEqual(call.kwargs["accessible_channel_ids"], {10})


class MemberCacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_role_lookup_returns_ten_of_thirty_two_after_chunking(self):
        role = SimpleNamespace(id=1, name="Worker Bee", members=[])
        members = [
            SimpleNamespace(
                id=i, name=f"member-{i}", display_name=f"Member {i}", nick=None, roles=[role], joined_at=None, bot=False
            )
            for i in range(32)
        ]
        role.members = members[:2]
        guild = SimpleNamespace(chunked=False, get_role=lambda role_id: role)

        async def chunk(*, cache):
            self.assertTrue(cache)
            guild.chunked = True
            role.members = members

        guild.chunk = chunk
        result = await DiscordSearchClient().search_members(guild, role_id=1, limit=10)
        self.assertEqual(result["returned"], 10)
        self.assertEqual(result["total"], 32)
        self.assertEqual(len(result["members"]), 10)

    async def test_incomplete_cache_is_not_reported_as_complete(self):
        async def chunk(*, cache):
            return []

        guild = SimpleNamespace(chunked=False, chunk=chunk, members=[])
        result = await DiscordSearchClient().search_members(guild)
        self.assertIn("complete member list", result["error"])
        self.assertNotIn("total", result)

    async def test_limited_name_search_does_not_claim_a_total(self):
        guild = SimpleNamespace(query_members=AsyncMock(return_value=[]))
        result = await DiscordSearchClient().search_members(guild, query="member", limit=10)
        self.assertIsNone(result["total"])
        self.assertEqual(result["returned"], 0)


class SearchClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_returns_only_authorized_counts(self):
        client = DiscordSearchClient()
        response = AsyncMock()
        response.status = 200
        response.json.return_value = {
            "total_results": 99,
            "messages": [
                [
                    {"id": "1", "channel_id": "10", "guild_id": "1", "content": "public"},
                    {"id": "2", "channel_id": "20", "guild_id": "1", "content": "private"},
                ]
            ],
        }
        context = AsyncMock()
        context.__aenter__.return_value = response
        session = SimpleNamespace(get=lambda *_args, **_kwargs: context)
        client.get_session = AsyncMock(return_value=session)

        result = await client.search_messages(1, "hello", limit=10, accessible_channel_ids={10})

        self.assertEqual(result["returned"], 1)
        self.assertNotIn("total_results", result)
        self.assertEqual([message["content"] for message in result["messages"]], ["public"])

    async def test_search_uses_requested_guild_for_links_and_reports_empty_scope(self):
        client = DiscordSearchClient()
        response = AsyncMock()
        response.status = 200
        response.json.return_value = {
            "messages": [[{"id": "1", "channel_id": "10", "content": "test"}]],
        }
        context = AsyncMock()
        context.__aenter__.return_value = response
        client.get_session = AsyncMock(return_value=SimpleNamespace(get=lambda *args, **kwargs: context))

        result = await client.search_messages(123, "test", channel_id=10, accessible_channel_ids={10})
        self.assertEqual(result["messages"][0]["jump_url"], "https://discord.com/channels/123/10/1")
        self.assertEqual(result["scope"], {"guild_id": "123", "channel_id": "10"})

        response.json.return_value = {"messages": []}
        result = await client.search_messages(123, "test", channel_id=10, accessible_channel_ids={10})
        self.assertIn("not proof", result["note"])
        self.assertIn("index", result["note"])

    async def test_429_retries_using_retry_after(self):
        client = DiscordSearchClient()
        limited = AsyncMock()
        limited.status = 429
        limited.json.return_value = {"retry_after": 0}
        ok = AsyncMock()
        ok.status = 200
        ok.json.return_value = {"messages": []}
        contexts = []
        for response in (limited, ok):
            context = AsyncMock()
            context.__aenter__.return_value = response
            contexts.append(context)
        session = SimpleNamespace(get=lambda *_args, **_kwargs: contexts.pop(0))
        client.get_session = AsyncMock(return_value=session)

        result = await client.search_messages(1, "hello", accessible_channel_ids=set())

        self.assertTrue(result["success"])
        self.assertEqual(contexts, [])


if __name__ == "__main__":
    unittest.main()
