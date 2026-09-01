import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from src.api.humans import HumanService, format_transcript, harden_content, stream_completion, truncate_tokens


class FakeGateway:
    def __init__(self):
        self.thread_count = 0
        self.asks = []
        self.reply = SimpleNamespace(content="A human answer")

    async def create_thread(self):
        self.thread_count += 1
        return self.thread_count

    async def ask(self, thread_id, messages, timeout):
        self.asks.append((thread_id, messages, timeout))
        return self.reply


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

    async def test_returns_response_and_reuses_caller_history(self):
        first = await self.service.complete(
            caller_id="caller-a",
            messages=[{"role": "user", "content": "Hello humans"}],
            max_tokens=None,
            max_completion_tokens=None,
        )
        self.assertEqual(first["choices"][0]["message"]["content"], "A human answer")
        self.assertNotIn("_pollinations", first)

        await self.service.complete(
            caller_id="caller-a",
            messages=[
                {"role": "user", "content": "Hello humans"},
                {"role": "assistant", "content": "A human answer"},
                {"role": "user", "content": "Continue"},
            ],
            max_tokens=None,
            max_completion_tokens=None,
        )
        self.assertEqual(self.gateway.thread_count, 1)
        self.assertEqual(self.gateway.asks[1][1], [{"role": "user", "content": "Continue"}])

        await self.service.complete(
            caller_id="caller-b",
            messages=[
                {"role": "user", "content": "Hello humans"},
                {"role": "assistant", "content": "A human answer"},
                {"role": "user", "content": "Continue"},
            ],
            max_tokens=None,
            max_completion_tokens=None,
        )
        self.assertEqual(self.gateway.thread_count, 2)

    async def test_uses_smallest_completion_limit(self):
        self.gateway.reply.content = "one two three four five"
        response = await self.service.complete(
            caller_id="caller-a",
            messages=[{"role": "user", "content": "short answer"}],
            max_tokens=4,
            max_completion_tokens=2,
        )
        self.assertEqual(response["usage"]["completion_tokens"], 2)
        self.assertEqual(response["choices"][0]["finish_reason"], "length")

    def test_authorization(self):
        self.service.authorize("Bearer secret")
        with self.assertRaises(PermissionError):
            self.service.authorize("Bearer wrong")


class HumanRequestTests(unittest.TestCase):
    def test_hardens_and_chunks_discord_prompt(self):
        self.assertEqual(
            harden_content("**hi** <@123> https://example.com"),
            "\\*\\*hi\\*\\* [mention] [link removed]",
        )
        chunks = format_transcript([{"role": "user", "content": "x" * 4_000}])
        self.assertEqual(len(chunks), 3)
        self.assertTrue(all(len(chunk) <= 1_900 for chunk in chunks))

    def test_truncates_cl100k_tokens(self):
        self.assertEqual(truncate_tokens("hello world", 1), ("hello", 1, True))

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
