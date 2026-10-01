"""Media uploads preserve a usable content type for generation URLs."""

import asyncio

import httpx
import pytest

from floret.tools import gen, media


@pytest.mark.parametrize("prompt", ["a%20blue%20circle.", "version%202.0%20logo"])
async def test_generated_url_with_period_uploads_as_image(
    monkeypatch, prompt: str
) -> None:
    payload = b"\xff\xd8\xff" + b"image bytes"
    uploads: list[bytes] = []

    def transport(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(
                200, content=payload, headers={"Content-Type": "image/jpeg"}
            )
        uploads.append(request.content)
        return httpx.Response(200, json={"url": "https://media.pollinations.ai/result"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        monkeypatch.setitem(gen._clients, id(asyncio.get_running_loop()), client)
        result = await media.upload_media(
            f"https://example.com/image/{prompt}?model=flux"
        )

    assert result == "https://media.pollinations.ai/result"
    assert len(uploads) == 1
    assert b"Content-Type: image/jpeg\r\n" in uploads[0]
    assert b'.jpg"' in uploads[0]
    assert payload in uploads[0]
