"""Live regression tests against gen.pollinations.ai.

Opt-in: set POLLI_LIVE=1 to run (they make real network calls and cost quota).
"""

from __future__ import annotations

import os

import pytest

from polli_agent.registry import warm_registry
from polli_agent.tools import gen

pytestmark = pytest.mark.skipif(
    os.getenv("POLLI_LIVE") != "1", reason="set POLLI_LIVE=1 to run live tests"
)


async def test_tts_reads_script_verbatim():
    """The headline fix: audio must speak the exact script, not answer it."""
    script = "The mitochondria is the powerhouse of the cell."
    res = await gen.text_to_speech(script)
    assert res["data_uri"].startswith("data:audio")
    assert res["transcript"].strip().rstrip(".") == script.rstrip(".")


async def test_transcribe_roundtrip():
    res = await gen.text_to_speech("Hello from Polli.")
    text = await gen.transcribe(res["data_uri"])
    assert "polli" in text.lower() or "hello" in text.lower()


async def test_web_search_returns_facts():
    ans = await gen.web_search("Capital of France in one word?")
    assert "paris" in ans.lower()


async def test_edit_image_transforms_the_source():
    """img2img must return a hosted URL whose bytes are a real edited image."""
    await warm_registry()
    base = (
        await gen.generate_image(
            "a plain solid blue circle on a plain white background",
            model="flux",
            width=768,
            height=768,
            seed=7,
        )
    )[0]
    out = await gen.edit_image("add a thick red border ring", image_url=base)
    assert out.startswith("https://media.pollinations.ai/")
    raw = await gen._fetch_bytes(out)
    assert raw[:3] == b"\xff\xd8\xff"  # real JPEG
    assert len(raw) > 10_000


async def test_media_hosting_roundtrip(tmp_path, monkeypatch):
    """upload_media must yield a public URL that serves the exact bytes back."""
    from polli_agent.tools import media

    monkeypatch.setattr(media.settings, "temp_dir", str(tmp_path))
    payload = b"polli media hosting roundtrip probe"
    workdir = tmp_path / "workspace"
    workdir.mkdir()
    (workdir / "probe.txt").write_bytes(payload)

    url = await media.upload_media("probe.txt")
    assert url.startswith("https://media.pollinations.ai/")

    import httpx

    async with httpx.AsyncClient() as client:  # deliberately unauthenticated
        r = await client.get(url)
    assert r.status_code == 200
    assert r.content == payload


async def test_chained_video_via_frame_extraction(tmp_path, monkeypatch):
    """The full recipe: keyframes -> clip1 -> real last frame -> clip2 -> stitch."""
    import shutil

    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not on PATH")

    from polli_agent.tools import media
    from polli_agent.tools.shell import bash

    monkeypatch.setattr(media.settings, "temp_dir", str(tmp_path))
    await warm_registry()

    k1, k2 = [
        (await gen.generate_image(p, model="flux", width=512, height=512, seed=11))[0]
        for p in (
            "a red cube on a white table, studio lighting",
            "a red cube melting into a puddle on a white table, studio lighting",
        )
    ]

    clip1_url = await gen.generate_video(
        "the red cube slowly melts", model="wan-fast", image=k1, end_image=k2
    )
    clip1 = await media.fetch_media(clip1_url, "clip1.mp4")

    out = await bash(
        f"ffmpeg -y -sseof -0.5 -i {clip1} -update 1 -q:v 1 last.jpg && ls last.jpg"
    )
    assert "exit_code: 0" in out

    frame_url = await media.upload_media("last.jpg")
    assert frame_url.startswith("https://media.pollinations.ai/")

    clip2_url = await gen.generate_video(
        "the puddle evaporates into red mist", model="wan-fast", image=frame_url
    )
    await media.fetch_media(clip2_url, "clip2.mp4")

    # Drop clip2's first frame (duplicate of clip1's last) and concatenate.
    # Double quotes + a Python-written concat list keep this portable (the
    # production container runs POSIX sh; local dev may be cmd.exe).
    trim = await bash(
        'ffmpeg -y -i clip2.mp4 -vf "select=gte(n\\,1),setpts=N/FRAME_RATE/TB" '
        "-an clip2_trim.mp4",
        timeout=300,
    )
    assert "exit_code: 0" in trim

    workdir = tmp_path / "workspace"
    (workdir / "list.txt").write_text("file 'clip1.mp4'\nfile 'clip2_trim.mp4'\n")
    stitch = await bash(
        "ffmpeg -y -f concat -safe 0 -i list.txt -c:v libx264 -an final.mp4",
        timeout=300,
    )
    assert "exit_code: 0" in stitch

    final_url = await media.upload_media("final.mp4")
    assert final_url.startswith("https://media.pollinations.ai/")


async def test_agent_events_stream_live():
    """The SSE backbone: events must arrive incrementally, ending in final."""
    await warm_registry()
    from polli_agent.agent import run_agent_events

    events = []
    async for ev in run_agent_events(
        [{"role": "user", "content": "Make one image of a sunflower, then say done."}]
    ):
        events.append(ev)

    assert events[-1]["type"] == "final"
    assert any(e["type"] == "tool_start" for e in events)
    assert events[-1]["text"]


async def test_agent_end_to_end_multi_image():
    """Real brain loop must chain to multiple images + text."""
    await warm_registry()
    from polli_agent.agent import run_agent

    r = await run_agent(
        [{"role": "user", "content": "Explain rain: short text plus 2 images."}]
    )
    imgs = [a for a in r["artifacts"] if a["type"] == "image"]
    assert len(imgs) >= 2
    assert r["text"]
