import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from src.api.humans import (
    HumanService,
    conversation_identity,
    conversation_thread_name,
    discord_preview,
    format_transcript,
    harden_content,
    stream_completion,
    truncate_tokens,
)


class FakeGateway:
    def __init__(self):
        self.thread_count = 0
        self.thread_names = []
        self.asks = []
        self.cleanup_calls = []
        self.reply = SimpleNamespace(content="A human answer")

    async def create_thread(self, name):
        self.thread_count += 1
        self.thread_names.append(name)
        return self.thread_count

    async def ask(self, thread_id, messages, timeout):
        self.asks.append((thread_id, messages, timeout))
        return self.reply

    async def verify_session(self, code, timeout):
        return "Discord human"

    async def delete_inactive_threads(self, inactive_for):
        self.cleanup_calls.append(inactive_for)


class WaitingGateway(FakeGateway):
    def __init__(self):
        super().__init__()
        self.waiting = asyncio.Event()

    async def ask(self, thread_id, messages, timeout):
        self.waiting.set()
        await asyncio.Event().wait()


class HumanModelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.gateway = FakeGateway()
        self.service = HumanService(
            api_token="secret",
            database_path=Path(self.temporary_directory.name) / "human.sqlite",
            gateway=self.gateway,
            response_timeout=270,
        )
        await self.service.start()

    async def asyncTearDown(self):
        await self.service.close()
        self.temporary_directory.cleanup()

    async def test_returns_response_and_reuses_message_history(self):
        search_context = "<details><summary>Web search: Hello humans</summary>generated context"
        first = await self.service.complete(
            messages=[
                {"role": "user", "content": search_context},
                {"role": "user", "content": "Hello humans"},
            ],
            max_tokens=None,
            max_completion_tokens=None,
        )
        self.assertEqual(first["choices"][0]["message"]["content"], "A human answer")
        self.assertNotIn("_pollinations", first)
        self.assertEqual(self.gateway.thread_names, ["Hello humans"])

        await self.service.complete(
            messages=[
                {"role": "user", "content": "Hello humans"},
                {"role": "user", "content": search_context},
                {"role": "assistant", "content": "A human answer"},
                {"role": "user", "content": "An unanswered prompt"},
                {"role": "user", "content": "Continue"},
            ],
            max_tokens=None,
            max_completion_tokens=None,
        )
        self.assertEqual(self.gateway.thread_count, 1)
        self.assertEqual(
            self.gateway.asks[1][1],
            [
                {"role": "user", "content": "An unanswered prompt"},
                {"role": "user", "content": "Continue"},
            ],
        )

        await self.service.complete(
            messages=[
                {"role": "user", "content": "Hello humans"},
                {"role": "assistant", "content": "A human answer"},
                {"role": "user", "content": "Continue"},
            ],
            max_tokens=None,
            max_completion_tokens=None,
        )
        self.assertEqual(self.gateway.thread_count, 1)

    async def test_uses_smallest_completion_limit(self):
        self.gateway.reply.content = "one two three four five"
        response = await self.service.complete(
            messages=[{"role": "user", "content": "short answer"}],
            max_tokens=4,
            max_completion_tokens=2,
        )
        self.assertEqual(response["usage"]["completion_tokens"], 2)
        self.assertEqual(response["choices"][0]["finish_reason"], "length")

    async def test_accepts_web_response(self):
        gateway = WaitingGateway()
        self.service.gateway = gateway
        completion = asyncio.create_task(
            self.service.complete(
                messages=[{"role": "user", "content": "A web question"}],
                max_tokens=None,
                max_completion_tokens=None,
            )
        )
        await gateway.waiting.wait()
        pending = self.service.pending_requests()
        self.assertEqual(len(pending), 1)
        self.assertTrue(self.service.respond(pending[0]["id"], "A web answer"))
        response = await completion
        self.assertEqual(response["choices"][0]["message"]["content"], "A web answer")
        self.assertEqual(self.service.pending_requests(), [])

    async def test_returns_web_link_after_timeout(self):
        self.service.gateway = WaitingGateway()
        self.service.response_timeout = 0.01
        response = await self.service.complete(
            messages=[{"role": "user", "content": "An unanswered question"}],
            max_tokens=None,
            max_completion_tokens=None,
            response_url="https://example.com/humans",
        )
        self.assertEqual(
            response["choices"][0]["message"]["content"],
            "No human responded within two minutes. Become the human at https://example.com/humans",
        )
        self.assertEqual(response["choices"][0]["finish_reason"], "stop")
        self.assertGreater(response["usage"]["completion_tokens"], 0)

    async def test_verifies_web_session_through_discord(self):
        session_id, code = self.service.create_session()
        self.assertTrue(code)
        await asyncio.sleep(0)
        self.assertEqual(
            self.service.session_status(session_id),
            {"authorized": True, "name": "Discord human", "code": None},
        )

    def test_authorization(self):
        self.service.authorize("Bearer secret")
        with self.assertRaises(PermissionError):
            self.service.authorize("Bearer wrong")


class HumanRequestTests(unittest.TestCase):
    def test_names_thread_from_latest_user_message(self):
        self.assertEqual(
            conversation_thread_name(
                [
                    {"role": "user", "content": "Earlier message"},
                    {"role": "assistant", "content": "Earlier answer"},
                    {"role": "user", "content": "  What should we build next?\n"},
                ]
            ),
            "What should we build next?",
        )

    def test_hardens_and_chunks_discord_prompt(self):
        self.assertEqual(
            harden_content("**hi** <@123> https://example.com"),
            "\\*\\*hi\\*\\* [mention] [link removed]",
        )
        long_content = "a" * 300 + "hidden middle" + "z" * 300
        self.assertEqual(
            discord_preview(long_content),
            "a" * 280 + "\n...\n" + "z" * 280,
        )
        chunks = format_transcript([{"role": "user", "content": long_content}])
        self.assertEqual(chunks, ["USER: " + "a" * 280 + "\n...\n" + "z" * 280])

    def test_truncates_cl100k_tokens(self):
        self.assertEqual(truncate_tokens("hello world", 1), ("hello", 1, True))

    def test_conversation_identity_ignores_volatile_context(self):
        self.assertEqual(
            conversation_identity(
                [
                    {"role": "system", "content": "Changing instructions"},
                    {"role": "user", "content": "Hello"},
                    {"role": "user", "content": "<details><summary>Web search: Hello</summary>results"},
                    {"role": "assistant", "content": "Hi there"},
                ]
            ),
            [["user", "Hello"], ["assistant", "Hi there"]],
        )

    def test_wraps_completed_reply_as_openai_stream(self):
        completion = {
            "id": "chatcmpl-human",
            "object": "chat.completion",
            "created": 1,
            "model": "humans",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "A human answer"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 4, "completion_tokens": 3, "total_tokens": 7},
        }

        events = list(stream_completion(completion))
        parsed = [json.loads(event.removeprefix("data: ")) for event in events[:-1]]
        self.assertEqual(parsed[0]["choices"][0]["delta"], {"role": "assistant"})
        self.assertEqual(parsed[1]["choices"][0]["delta"], {"content": "A human answer"})
        self.assertEqual(parsed[2]["choices"][0]["finish_reason"], "stop")
        self.assertEqual(parsed[3]["choices"], [])
        self.assertEqual(parsed[3]["usage"], completion["usage"])
        self.assertEqual(events[-1], "data: [DONE]\n\n")


if __name__ == "__main__":
    unittest.main()
