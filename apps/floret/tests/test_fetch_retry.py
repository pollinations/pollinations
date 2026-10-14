"""_fetch_bytes retries transient 5xx but never retries client errors."""

from __future__ import annotations

import httpx
import pytest

from floret.tools import gen


def _mock_client(statuses: list[int]) -> tuple[httpx.AsyncClient, list[httpx.Request]]:
    remaining = list(statuses)
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(remaining.pop(0), content=b"payload")

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), requests


async def test_retries_transient_502_then_succeeds(monkeypatch):
    fake, requests = _mock_client([502, 502, 200])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    data = await gen._fetch_bytes("https://x/img.jpg", attempts=3)
    assert data == b"payload"
    assert len(requests) == 3
    await fake.aclose()


async def test_does_not_retry_401(monkeypatch):
    """A client error will not fix itself — fail fast, don't burn attempts."""
    fake, requests = _mock_client([401, 200])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    with pytest.raises(RuntimeError, match="401"):
        await gen._fetch_bytes("https://x/img.jpg", attempts=3)
    assert len(requests) == 1
    await fake.aclose()


async def test_client_error_surfaces_response_body(monkeypatch):
    """4xx bodies explain the fix (e.g. supported durations) — the brain needs them."""
    fake, requests = _mock_client([400])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    with pytest.raises(RuntimeError, match="payload"):
        await gen._fetch_bytes("https://x/video/boat", attempts=3)
    assert len(requests) == 1
    await fake.aclose()


async def test_raises_after_exhausting_attempts(monkeypatch):
    fake, requests = _mock_client([502, 502, 502])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    with pytest.raises(RuntimeError, match="after 3 attempts"):
        await gen._fetch_bytes("https://x/img.jpg", attempts=3)
    assert len(requests) == 3
    await fake.aclose()


async def test_auth_is_sent_only_to_exact_configured_origin(monkeypatch):
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=b"ok")

    fake = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(gen, "_http_client", lambda: fake)
    monkeypatch.setattr(gen, "_base", lambda: "https://gen.example:443")
    monkeypatch.setattr(gen, "_key", lambda: "test-key")

    await gen._fetch_bytes("https://gen.example/image/x", attempts=1)
    await gen._fetch_bytes("https://gen.example.invalid/image/x", attempts=1)
    await gen._fetch_bytes("http://gen.example/image/x", attempts=1)

    assert requests[0].headers["Authorization"] == "Bearer test-key"
    assert all("Authorization" not in request.headers for request in requests[1:])
    await fake.aclose()


@pytest.mark.parametrize("status", [400, 502])
async def test_error_body_reader_stops_after_diagnostic_prefix(monkeypatch, status):
    consumed = []

    class LazyBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            for index in range(4):
                consumed.append(index)
                yield bytes([65 + index]) * 300

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, stream=LazyBody())

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(gen, "_http_client", lambda: client)

    with pytest.raises(RuntimeError):
        await gen._fetch_bytes("https://x/error", attempts=1)
    assert consumed == [0]
    await client.aclose()


async def test_bounded_fetch_rejects_known_oversized_content_length(monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"Content-Length": "5"}, content=b"12345")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(gen, "_http_client", lambda: client)

    with pytest.raises(ValueError, match="upload limit"):
        await gen._fetch_bytes("https://x/file", attempts=1, max_bytes=4)
    await client.aclose()


async def test_bounded_fetch_counts_streamed_bytes_without_length(monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"12345")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(gen, "_http_client", lambda: client)

    with pytest.raises(ValueError, match="upload limit"):
        await gen._fetch_bytes("https://x/file", attempts=1, max_bytes=4)
    await client.aclose()
