"""_fetch_bytes retries transient 5xx but never retries client errors."""

from __future__ import annotations

import httpx
import pytest

from polli_agent.tools import gen


class _FakeClient:
    def __init__(self, statuses: list[int]) -> None:
        self._statuses = list(statuses)
        self.calls = 0

    async def get(self, url, headers=None):
        self.calls += 1
        code = self._statuses.pop(0)
        request = httpx.Request("GET", url)
        response = httpx.Response(code, content=b"payload", request=request)
        if code >= 400:
            raise httpx.HTTPStatusError("boom", request=request, response=response)
        return response


async def test_retries_transient_502_then_succeeds(monkeypatch):
    fake = _FakeClient([502, 502, 200])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    data = await gen._fetch_bytes("https://x/img.jpg", attempts=3)
    assert data == b"payload"
    assert fake.calls == 3


async def test_does_not_retry_401(monkeypatch):
    """A client error will not fix itself — fail fast, don't burn attempts."""
    fake = _FakeClient([401, 200])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    with pytest.raises(RuntimeError, match="401"):
        await gen._fetch_bytes("https://x/img.jpg", attempts=3)
    assert fake.calls == 1


async def test_client_error_surfaces_response_body(monkeypatch):
    """4xx bodies explain the fix (e.g. supported durations) — the brain needs them."""
    fake = _FakeClient([400])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    with pytest.raises(RuntimeError, match="payload"):
        await gen._fetch_bytes("https://x/video/boat", attempts=3)
    assert fake.calls == 1


async def test_raises_after_exhausting_attempts(monkeypatch):
    fake = _FakeClient([502, 502, 502])
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    with pytest.raises(RuntimeError, match="after 3 attempts"):
        await gen._fetch_bytes("https://x/img.jpg", attempts=3)
    assert fake.calls == 3
