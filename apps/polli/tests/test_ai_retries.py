import unittest
from unittest.mock import AsyncMock, patch

from src.ai.client import PollinationsClient
from src.core.config import config


class FakeRequest:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self.response

    async def __aexit__(self, *_args):
        return False


class FakeResponse:
    status = 200

    async def json(self):
        return {"choices": [{"message": {"content": "ok"}}], "usage": {}}


class FakeSession:
    def __init__(self):
        self.payloads = []

    def post(self, _url, *, json, **_kwargs):
        self.payloads.append(json)
        if len(self.payloads) == 1:
            return FakeRequest(error=TimeoutError())
        return FakeRequest(response=FakeResponse())


class RetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_switches_model_and_changes_implicit_seed(self):
        client = PollinationsClient()
        session = FakeSession()

        with (
            patch.object(client, "get_session", AsyncMock(return_value=session)),
            patch("src.ai.client.asyncio.sleep", AsyncMock()),
            patch("src.ai.client.random.randint", side_effect=[101, 202]),
        ):
            result = await client._call_api_with_tools(
                [{"role": "user", "content": "hello"}],
                tools=None,
                timeout=1,
            )

        self.assertEqual(result["content"], "ok")
        self.assertEqual(
            [payload["model"] for payload in session.payloads],
            [config.ai.model, config.ai.fallback_model],
        )
        self.assertEqual([payload["seed"] for payload in session.payloads], [101, 202])

    async def test_explicit_seed_is_stable_across_retry(self):
        client = PollinationsClient()
        session = FakeSession()

        with (
            patch.object(client, "get_session", AsyncMock(return_value=session)),
            patch("src.ai.client.asyncio.sleep", AsyncMock()),
        ):
            await client._call_api_with_tools(
                [{"role": "user", "content": "hello"}],
                tools=None,
                timeout=1,
                api_params={"seed": 7},
            )

        self.assertEqual([payload["seed"] for payload in session.payloads], [7, 7])


if __name__ == "__main__":
    unittest.main()
