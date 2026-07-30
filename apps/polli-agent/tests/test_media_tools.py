"""Unit tests for media hosting tools (upload_media / fetch_media), no network."""

from __future__ import annotations

import base64

import pytest

from polli_agent import toolset
from polli_agent.tools import media


class _FakeResponse:
    def __init__(self, json_data=None, content=b""):
        self._json = json_data or {}
        self.content = content

    def raise_for_status(self):
        return None

    def json(self):
        return self._json


class _FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls: list[dict] = []

    async def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return self.response


async def test_upload_media_data_uri(monkeypatch):
    payload = b"fake jpeg bytes"
    b64 = base64.b64encode(payload).decode()
    fake = _FakeClient(_FakeResponse({"url": "https://media.pollinations.ai/abc123"}))
    monkeypatch.setattr(media, "_http_client", lambda: fake)

    url = await media.upload_media(f"data:image/jpeg;base64,{b64}")

    assert url == "https://media.pollinations.ai/abc123"
    call = fake.calls[0]
    assert call["url"].endswith("/upload")
    sent_name, sent_bytes, sent_mime = call["files"]["file"]
    assert sent_bytes == payload
    assert sent_mime == "image/jpeg"


async def test_upload_media_workspace_file(monkeypatch, tmp_path):
    monkeypatch.setattr(media.settings, "temp_dir", str(tmp_path))
    workdir = tmp_path / "workspace"
    workdir.mkdir()
    (workdir / "frame.png").write_bytes(b"png bytes")

    fake = _FakeClient(_FakeResponse({"url": "https://media.pollinations.ai/f1"}))
    monkeypatch.setattr(media, "_http_client", lambda: fake)

    url = await media.upload_media("frame.png")

    assert url == "https://media.pollinations.ai/f1"
    assert fake.calls[0]["files"]["file"][1] == b"png bytes"


async def test_upload_media_rejects_path_escape(monkeypatch, tmp_path):
    monkeypatch.setattr(media.settings, "temp_dir", str(tmp_path))
    with pytest.raises(ValueError):
        await media.upload_media("../outside.txt")


async def test_fetch_media_saves_into_workspace(monkeypatch, tmp_path):
    monkeypatch.setattr(media.settings, "temp_dir", str(tmp_path))

    async def fake_fetch(url):
        return b"video bytes"

    monkeypatch.setattr(media, "_fetch_bytes", fake_fetch)

    path = await media.fetch_media("https://gen.pollinations.ai/video/x", "clip1.mp4")

    assert path == "clip1.mp4"
    assert (tmp_path / "workspace" / "clip1.mp4").read_bytes() == b"video bytes"


async def test_toolset_dispatches_media_tools(monkeypatch):
    names = {t["function"]["name"] for t in toolset.TOOL_SCHEMAS}
    assert {"upload_media", "fetch_media"} <= names

    async def fake_upload(source, filename=None):
        return "https://media.pollinations.ai/up1"

    async def fake_fetch(url, filename=None):
        return "clip1.mp4"

    monkeypatch.setattr(toolset.media, "upload_media", fake_upload)
    monkeypatch.setattr(toolset.media, "fetch_media", fake_fetch)

    up = await toolset.dispatch("upload_media", {"source": "frame.png"})
    assert "https://media.pollinations.ai/up1" in up.brain

    down = await toolset.dispatch(
        "fetch_media", {"url": "https://gen.pollinations.ai/video/x"}
    )
    assert "clip1.mp4" in down.brain


async def test_uploaded_video_and_audio_become_artifacts(monkeypatch):
    """A hosted deliverable must attach to the reply even if the brain forgets it."""

    async def fake_upload(source, filename=None):
        return f"https://media.pollinations.ai/{source}"

    monkeypatch.setattr(toolset.media, "upload_media", fake_upload)

    vid = await toolset.dispatch("upload_media", {"source": "final.mp4"})
    assert [a["type"] for a in vid.artifacts] == ["video"]

    aud = await toolset.dispatch("upload_media", {"source": "mix.mp3"})
    assert [a["type"] for a in aud.artifacts] == ["audio"]

    # Frame images are intermediates — do not spam the reply with them.
    img = await toolset.dispatch("upload_media", {"source": "last1.jpg"})
    assert img.artifacts == []


async def test_generate_video_rehosts_unfetchable_frames(monkeypatch):
    """gen.pollinations.ai and data: frame refs must be re-hosted publicly.

    The video service cannot fetch Pollinations generation URLs (522), so passing
    them through verbatim produces a guaranteed 400.
    """
    import urllib.parse

    from polli_agent.tools import gen

    uploads = []

    async def fake_upload(source, filename=None):
        uploads.append(source)
        return f"https://media.pollinations.ai/h{len(uploads)}"

    monkeypatch.setattr(media, "upload_media", fake_upload)

    url = await gen.generate_video(
        "melt",
        model="wan-fast",
        image="https://gen.pollinations.ai/image/cube?model=flux",
        end_image="https://i.example.com/external.jpg",
    )

    query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    frames = query["image"][0].split("|")
    assert frames == [
        "https://media.pollinations.ai/h1",
        "https://i.example.com/external.jpg",  # already public: untouched
    ]
    assert uploads == ["https://gen.pollinations.ai/image/cube?model=flux"]


async def test_edit_image_returns_hosted_url(monkeypatch):
    """edit_image must upload its result and return a plain URL, not a data URI."""
    from polli_agent.tools import gen

    edit_resp = _FakeResponse(
        {"data": [{"b64_json": base64.b64encode(b"edited").decode()}]}
    )
    fake = _FakeClient(edit_resp)
    monkeypatch.setattr(gen, "_http_client", lambda: fake)

    async def fake_upload(source, filename=None):
        assert source.startswith("data:image/")
        return "https://media.pollinations.ai/edited1"

    monkeypatch.setattr(media, "upload_media", fake_upload)

    out = await gen.edit_image("add border", image_url="data:image/jpeg;base64,QQ==")
    assert out == "https://media.pollinations.ai/edited1"
