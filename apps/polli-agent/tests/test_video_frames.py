"""The video frame contract: `image=start|end`, not an `end_image` param."""

from __future__ import annotations

import urllib.parse

from polli_agent.tools import gen


def _params(url: str) -> dict[str, list[str]]:
    return urllib.parse.parse_qs(urllib.parse.urlparse(url).query)


async def test_start_and_end_frame_join_into_one_image_param():
    url = await gen.generate_video(
        "a flower blooming",
        model="wan-fast",
        image="https://x/start.jpg",
        end_image="https://x/end.jpg",
    )
    q = _params(url)
    # There is no `end_image` query param in the real API.
    assert "end_image" not in q
    assert q["image"] == ["https://x/start.jpg|https://x/end.jpg"]


async def test_start_frame_only_passes_single_image():
    url = await gen.generate_video("pan out", model="wan", image="https://x/start.jpg")
    q = _params(url)
    assert q["image"] == ["https://x/start.jpg"]


async def test_end_frame_forces_a_model_that_supports_it():
    """`wan` silently drops the end frame — never let it be used with end_image."""
    url = await gen.generate_video(
        "morph", model="wan", image="https://x/a.jpg", end_image="https://x/b.jpg"
    )
    q = _params(url)
    assert q["model"][0] in gen.END_FRAME_MODELS


async def test_text_to_video_has_no_image_param():
    url = await gen.generate_video("a wave", model="wan-fast")
    assert "image" not in _params(url)


async def test_veo_image_to_video_duration_snaps_to_supported():
    """veo img2vid only accepts 4/6/8s; duration=5 is a guaranteed 400."""
    url = await gen.generate_video(
        "boat drifts", model="veo", image="https://x/a.jpg", duration=5
    )
    assert _params(url)["duration"] == ["4"]

    url = await gen.generate_video(
        "boat drifts", model="veo", image="https://x/a.jpg", duration=7
    )
    assert _params(url)["duration"] == ["6"]

    # Text-to-video and other models keep the caller's duration.
    url = await gen.generate_video("boat drifts", model="veo", duration=5)
    assert _params(url)["duration"] == ["5"]
    url = await gen.generate_video(
        "boat", model="wan-fast", image="https://x/a.jpg", duration=5
    )
    assert _params(url)["duration"] == ["5"]
