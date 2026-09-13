"""Live regression tests against gen.pollinations.ai.

Opt-in: set POLLI_LIVE=1 to run (they make real network calls and cost quota).
"""

from __future__ import annotations

import os

import pytest

from floret.registry import warm_registry
from floret.tools import gen

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
    assert "floret" in text.lower() or "hello" in text.lower()


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


async def test_media_hosting_roundtrip():
    """upload_media must yield a public URL that serves the exact bytes back."""
    import base64

    from floret.tools import media

    payload = b"floret media hosting roundtrip probe"
    source = "data:text/plain;base64," + base64.b64encode(payload).decode()
    url = await media.upload_media(source)
    assert url.startswith("https://media.pollinations.ai/")

    import httpx

    async with httpx.AsyncClient() as client:  # deliberately unauthenticated
        r = await client.get(url)
    assert r.status_code == 200
    assert r.content == payload


async def test_chained_video_via_frame_extraction():
    """Generation -> public source -> FFmpeg MCP -> next clip -> hosted final."""
    from floret.tools import media
    from floret.toolset import dispatch

    await warm_registry()
    k1 = (await gen.generate_image("a red cube on a white table", model="flux"))[0]
    clip1 = await media.upload_media(
        await gen.generate_video(
            "the red cube slowly melts", model="wan-fast", image=k1
        )
    )
    frame = await dispatch(
        "runFfmpeg",
        {
            "sources": [clip1],
            "args": ["-sseof", "-0.1", "-i", "input0", "-update", "1", "-q:v", "1"],
            "outputExtension": "jpg",
        },
    )
    assert not frame.brain.startswith("ERROR"), frame.brain
    frame_url = frame.artifacts[0]["url"]
    clip2 = await media.upload_media(
        await gen.generate_video(
            "the puddle evaporates into red mist", model="wan-fast", image=frame_url
        )
    )
    stitched = await dispatch(
        "runFfmpeg",
        {
            "sources": [clip1, clip2],
            "args": [
                "-i",
                "input0",
                "-i",
                "input1",
                "-filter_complex",
                "[1:v]trim=start_frame=1,setpts=PTS-STARTPTS[v1];[0:v][v1]concat=n=2:v=1:a=0[out]",
                "-map",
                "[out]",
                "-c:v",
                "libx264",
            ],
            "outputExtension": "mp4",
        },
    )
    assert not stitched.brain.startswith("ERROR"), stitched.brain
    assert stitched.artifacts[0]["url"].startswith("https://media.pollinations.ai/")


async def test_agent_events_stream_live():
    """The SSE backbone: events must arrive incrementally, ending in final."""
    await warm_registry()
    from floret.agent import run_agent_events

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
    from floret.agent import run_agent

    r = await run_agent(
        [{"role": "user", "content": "Explain rain: short text plus 2 images."}]
    )
    imgs = [a for a in r["artifacts"] if a["type"] == "image"]
    assert len(imgs) >= 2
    assert r["text"]
