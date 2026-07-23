"""Response-shaping tests for the OpenAI-compatible content blocks."""

from __future__ import annotations

import base64

import pytest

from polli_agent import api
from polli_agent.tools import media

_FAKE_B64 = base64.b64encode(b"ID3fake-audio-payload" * 500).decode()


def _audio_artifact() -> dict:
    return {
        "type": "audio",
        "b64": _FAKE_B64,
        "data_uri": f"data:audio/mpeg;base64,{_FAKE_B64}",
        "format": "mp3",
        "transcript": "Black holes bend spacetime.",
    }


@pytest.fixture
def _hosting_down(monkeypatch):
    """Simulate media.pollinations.ai being unavailable to exercise fallbacks."""

    async def fail(source, filename=None):
        raise RuntimeError("hosting down")

    monkeypatch.setattr(media, "upload_media", fail)


async def test_audio_prefers_media_hosting(monkeypatch):
    async def fake_upload(source, filename=None):
        return "https://media.pollinations.ai/aud1"

    monkeypatch.setattr(media, "upload_media", fake_upload)

    markdown, parts = await api._build_content("Here you go.", [_audio_artifact()])

    assert "https://media.pollinations.ai/aud1" in markdown
    audio = [p for p in parts if p["type"] == "audio_url"][0]
    assert audio["audio_url"]["url"] == "https://media.pollinations.ai/aud1"


async def test_base64_never_leaks_into_markdown(monkeypatch, _hosting_down):
    """The data URI belongs in the audio content part, never inline in the text."""
    monkeypatch.setattr(api.settings, "public_base_url", "")

    markdown, parts = await api._build_content("Here you go.", [_audio_artifact()])

    assert "data:audio" not in markdown
    assert _FAKE_B64 not in markdown
    assert len(markdown) < 500  # would be ~14 KB if the payload leaked
    # ...but the playable payload IS present in the audio part.
    audio_parts = [p for p in parts if p["type"] == "audio_url"]
    assert len(audio_parts) == 1
    assert audio_parts[0]["audio_url"]["url"].startswith("data:audio/mpeg;base64,")


async def test_served_url_used_in_markdown_when_public_base_set(
    monkeypatch, tmp_path, _hosting_down
):
    monkeypatch.setattr(api.settings, "public_base_url", "https://polli.example")
    monkeypatch.setattr(api.settings, "temp_dir", str(tmp_path))

    markdown, parts = await api._build_content("Here you go.", [_audio_artifact()])

    assert "https://polli.example/files/" in markdown
    assert "data:audio" not in markdown
    audio = [p for p in parts if p["type"] == "audio_url"][0]
    assert audio["audio_url"]["url"].startswith("https://polli.example/files/")


async def test_images_and_video_embed_as_parts_and_markdown(monkeypatch):
    monkeypatch.setattr(api.settings, "public_base_url", "")
    artifacts = [
        {"type": "image", "url": "https://x/img1.jpg"},
        {"type": "image", "url": "https://x/img2.jpg"},
        {"type": "video", "url": "https://x/vid.mp4"},
    ]
    markdown, parts = await api._build_content("Explainer.", artifacts)

    kinds = [p["type"] for p in parts]
    assert kinds == ["text", "image_url", "image_url", "video_url"]
    assert markdown.count("![image](") == 2
    assert "[video](https://x/vid.mp4)" in markdown


async def test_data_uri_image_never_inlined_in_markdown(monkeypatch):
    """A data-URI image (hosting fallback) must not bloat the text part."""
    monkeypatch.setattr(api.settings, "public_base_url", "")
    data_uri = f"data:image/jpeg;base64,{_FAKE_B64}"

    markdown, parts = await api._build_content(
        "Edited it.", [{"type": "image", "url": data_uri}]
    )

    assert "data:image" not in markdown
    assert _FAKE_B64 not in markdown
    assert len(markdown) < 200
    img = [p for p in parts if p["type"] == "image_url"][0]
    assert img["image_url"]["url"] == data_uri


async def test_text_only_response_has_single_part(monkeypatch):
    monkeypatch.setattr(api.settings, "public_base_url", "")
    markdown, parts = await api._build_content("Just words.", [])
    assert parts == [{"type": "text", "text": "Just words."}]
    assert markdown == "Just words."
