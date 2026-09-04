import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.discord.search import DiscordSearchClient, _thread_is_accessible, tool_discord_search


class FakePermissions:
    def __init__(self, *, view_channel=True, manage_threads=False):
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
