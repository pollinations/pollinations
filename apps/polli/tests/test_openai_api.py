import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from src.ai.client import PollinationsClient
from src.api.server import create_api_app


class FakePollinationsClient:
    async def process_with_tools(self, **kwargs):
        return {
            "response": "Hello world",
            "tool_calls": [],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        }

    async def stream_with_tools(self, **kwargs):
        yield {"type": "content.delta", "delta": "Hello"}
        yield {"type": "internal.tool", "name": "code_search"}
        yield {"type": "content.delta", "delta": " world"}
        yield {
            "type": "completed",
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        }


class OpenAIAPITests(unittest.TestCase):
    def setUp(self):
        config = SimpleNamespace(
            api=SimpleNamespace(cors_origins=[]),
            bot=SimpleNamespace(name="Polli"),
        )
        self.client = TestClient(create_api_app(FakePollinationsClient(), config))
        self.headers = {"Authorization": "Bearer test"}

    def test_chat_stream_emits_standard_deltas_and_hides_internal_tools(self):
        with self.client.stream(
            "POST",
            "/v1/chat/completions",
            headers=self.headers,
            json={"model": "polli", "messages": [{"role": "user", "content": "Hi"}], "stream": True},
        ) as response:
            body = "".join(response.iter_text())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")
        self.assertNotIn("code_search", body)
        self.assertIn('"object":"chat.completion.chunk"', body)
        self.assertIn('"delta":{"role":"assistant","content":""}', body)
        self.assertIn('"delta":{"content":"Hello"}', body)
        self.assertIn('"finish_reason":"stop"', body)
        self.assertTrue(body.endswith("data: [DONE]\n\n"))

    def test_responses_stream_emits_openai_lifecycle(self):
        with self.client.stream(
            "POST",
            "/v1/responses",
            headers=self.headers,
            json={"model": "polli", "input": "Hi", "stream": True},
        ) as response:
            body = "".join(response.iter_text())

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("code_search", body)
        events = [
            json.loads(block.split("data: ", 1)[1])
            for block in body.strip().split("\n\n")
            if not block.endswith("[DONE]")
        ]
        self.assertEqual(
            [event["type"] for event in events],
            [
                "response.created",
                "response.output_item.added",
                "response.content_part.added",
                "response.output_text.delta",
                "response.output_text.delta",
                "response.output_text.done",
                "response.content_part.done",
                "response.output_item.done",
                "response.completed",
            ],
        )
        self.assertEqual(events[-1]["response"]["output"][0]["content"][0]["text"], "Hello world")

    def test_responses_non_stream_returns_response_object(self):
        response = self.client.post(
            "/v1/responses",
            headers=self.headers,
            json={"model": "polli", "input": [{"role": "user", "content": "Hi"}]},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["object"], "response")
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["output"][0]["content"][0]["text"], "Hello world")

    def test_errors_use_openai_shape(self):
        response = self.client.post(
            "/v1/chat/completions",
            json={"model": "polli", "messages": [{"role": "user", "content": "Hi"}]},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["type"], "invalid_request_error")

    def test_models_lists_polli(self):
        response = self.client.get("/v1/models", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["object"], "list")
        self.assertEqual(response.json()["data"][0]["id"], "polli")

    def test_validation_errors_use_openai_shape(self):
        response = self.client.post(
            "/v1/chat/completions",
            headers=self.headers,
            json={"model": "other", "messages": []},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["type"], "invalid_request_error")

    def test_chat_stream_tool_call_has_index(self):
        class ToolClient(FakePollinationsClient):
            async def stream_with_tools(self, **kwargs):
                yield {
                    "type": "client.tool_call.delta",
                    "tool_call": {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "weather", "arguments": "{}"},
                    },
                }
                yield {"type": "completed", "finish_reason": "tool_calls", "usage": {}}

        config = SimpleNamespace(api=SimpleNamespace(cors_origins=[]), bot=SimpleNamespace(name="Polli"))
        client = TestClient(create_api_app(ToolClient(), config))
        with client.stream(
            "POST",
            "/v1/chat/completions",
            headers=self.headers,
            json={"model": "polli", "messages": [{"role": "user", "content": "Hi"}], "stream": True},
        ) as response:
            body = "".join(response.iter_text())

        chunks = [json.loads(block[6:]) for block in body.strip().split("\n\n") if block.startswith("data: {")]
        tool_delta = next(
            chunk for chunk in chunks if chunk["choices"] and chunk["choices"][0]["delta"].get("tool_calls")
        )
        self.assertEqual(tool_delta["choices"][0]["delta"]["tool_calls"][0]["index"], 0)

    def test_responses_non_stream_returns_function_call(self):
        class ToolClient(FakePollinationsClient):
            async def process_with_tools(self, **kwargs):
                return {
                    "response": "",
                    "client_tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "weather", "arguments": "{}"},
                        }
                    ],
                    "usage": {},
                    "finish_reason": "tool_calls",
                }

        config = SimpleNamespace(api=SimpleNamespace(cors_origins=[]), bot=SimpleNamespace(name="Polli"))
        client = TestClient(create_api_app(ToolClient(), config))
        response = client.post(
            "/v1/responses",
            headers=self.headers,
            json={
                "model": "polli",
                "input": "Hi",
                "tools": [{"type": "function", "name": "weather", "parameters": {"type": "object"}}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["output"][0]["type"], "function_call")
        self.assertEqual(response.json()["output"][0]["name"], "weather")

    def test_responses_stream_keeps_output_item_id(self):
        with self.client.stream(
            "POST",
            "/v1/responses",
            headers=self.headers,
            json={"model": "polli", "input": "Hi", "stream": True},
        ) as response:
            body = "".join(response.iter_text())

        events = [json.loads(block[6:]) for block in body.strip().split("\n\n") if block.startswith("data: {")]
        added = next(event for event in events if event["type"] == "response.output_item.added")
        completed = next(event for event in events if event["type"] == "response.completed")
        self.assertEqual(added["item"]["id"], completed["response"]["output"][0]["id"])


class FakeHTTPResponse:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def json(self):
        return self.payload


class StreamingClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_buffered_request_omits_seed_by_default(self):
        client = PollinationsClient()
        response = FakeHTTPResponse({"choices": [{"message": {"content": "ok", "tool_calls": []}}], "usage": {}})
        session = SimpleNamespace(post=MagicMock(return_value=response))
        client.get_session = AsyncMock(return_value=session)

        await client._call_api_with_tools([{"role": "user", "content": "hi"}])

        payload = session.post.call_args.kwargs["json"]
        self.assertNotIn("seed", payload)

    async def test_buffered_request_preserves_explicit_seed(self):
        client = PollinationsClient()
        response = FakeHTTPResponse({"choices": [{"message": {"content": "ok", "tool_calls": []}}], "usage": {}})
        session = SimpleNamespace(post=MagicMock(return_value=response))
        client.get_session = AsyncMock(return_value=session)

        await client._call_api_with_tools([{"role": "user", "content": "hi"}], api_params={"seed": 7})

        payload = session.post.call_args.kwargs["json"]
        self.assertEqual(payload["seed"], 7)

    async def test_internal_tool_round_content_is_not_streamed(self):
        client = PollinationsClient()
        client.register_tool_handler("internal", AsyncMock(return_value={"ok": True}))
        internal_call = {
            "id": "call_internal",
            "type": "function",
            "function": {"name": "internal", "arguments": "{}"},
        }
        selection = AsyncMock(
            side_effect=[
                {
                    "content": "I will run a tool",
                    "tool_calls": [internal_call],
                    "content_blocks": [],
                    "usage": {},
                },
                {"content": "draft", "tool_calls": [], "content_blocks": [], "usage": {}},
            ]
        )

        async def final_stream(*_args, event_handler, **_kwargs):
            await event_handler({"type": "content.delta", "delta": "final"})
            return {"content": "final", "tool_calls": [], "content_blocks": [], "usage": {}}

        with (
            patch.object(client, "_call_api_with_tools", selection),
            patch.object(client, "_call_api_with_tools_stream", AsyncMock(side_effect=final_stream)),
            patch(
                "src.ai.client.get_tools_with_embeddings",
                return_value=[{"type": "function", "function": {"name": "internal"}}],
            ),
            patch("src.ai.client.filter_api_tools", side_effect=lambda tools: tools),
        ):
            events = [
                event
                async for event in client.stream_with_tools(
                    user_message="search",
                    discord_username="tester",
                    mode="api",
                )
            ]

        deltas = [event["delta"] for event in events if event["type"] == "content.delta"]
        self.assertEqual(deltas, ["final"])

    async def test_client_tool_calls_are_returned_without_execution(self):
        client = PollinationsClient()
        caller_tool = {
            "type": "function",
            "function": {"name": "get_weather", "parameters": {"type": "object"}},
        }
        tool_call = {
            "id": "call_weather",
            "type": "function",
            "function": {"name": "get_weather", "arguments": '{"city":"Paris"}'},
        }
        upstream = AsyncMock(
            return_value={
                "content": "",
                "tool_calls": [tool_call],
                "content_blocks": [],
                "usage": {},
            }
        )

        with (
            patch.object(client, "_call_api_with_tools", upstream),
            patch("src.ai.client.get_tools_with_embeddings", return_value=[]),
            patch("src.ai.client.filter_api_tools", side_effect=lambda tools: tools),
        ):
            result = await client.process_with_tools(
                user_message="weather",
                discord_username="tester",
                mode="api",
                api_params={"tools": [caller_tool]},
            )

        self.assertEqual(result["client_tool_calls"], [tool_call])
        self.assertEqual(result["finish_reason"], "tool_calls")

    async def test_upstream_tokens_arrive_before_request_completes(self):
        client = PollinationsClient()
        release = asyncio.Event()

        async def process(**kwargs):
            await kwargs["event_handler"]({"type": "content.delta", "delta": "first"})
            await release.wait()
            return {"response": "first second", "usage": {}}

        with patch.object(client, "process_with_tools", AsyncMock(side_effect=process)):
            stream = client.stream_with_tools()
            first = await anext(stream)
            self.assertEqual(first, {"type": "content.delta", "delta": "first"})
            release.set()
            completed = await anext(stream)
            self.assertEqual(completed["type"], "completed")


if __name__ == "__main__":
    unittest.main()
