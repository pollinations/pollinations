"""Live smoke suite against gen.pollinations.ai. Run: python scripts/test_combos.py"""

from __future__ import annotations

import asyncio
import logging

from polli_agent.registry import warm_registry
from polli_agent.tools import gen

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("combos")


async def check_tts_verbatim() -> bool:
    script = "The mitochondria is the powerhouse of the cell."
    res = await gen.text_to_speech(script)
    ok = res["transcript"].strip().rstrip(".") == script.rstrip(".")
    logger.info("TTS verbatim: %s (transcript=%r)", ok, res["transcript"])
    assert res["data_uri"].startswith("data:audio")
    return ok


async def check_transcribe_roundtrip() -> bool:
    res = await gen.text_to_speech("Hello from Polli.")
    text = await gen.transcribe(res["data_uri"])
    ok = "polli" in text.lower() or "hello" in text.lower()
    logger.info("Transcribe round-trip: %s (%r)", ok, text)
    return ok


async def check_image() -> bool:
    urls = await gen.generate_image("a red cube on white", n=2)
    logger.info("Images: %s", urls)
    return len(urls) == 2 and all(u.startswith("http") for u in urls)


async def check_video() -> bool:
    url = await gen.generate_video("a wave rolling", duration=4)
    logger.info("Video: %s", url)
    return url.startswith("http")


async def check_search() -> bool:
    ans = await gen.web_search("What is the capital of France? One word.")
    logger.info("Search: %r", ans[:80])
    return "paris" in ans.lower()


async def main() -> None:
    await warm_registry()
    checks = [
        ("tts_verbatim", check_tts_verbatim),
        ("transcribe_roundtrip", check_transcribe_roundtrip),
        ("image_batch", check_image),
        ("video", check_video),
        ("web_search", check_search),
    ]
    results = {}
    for name, fn in checks:
        try:
            results[name] = await fn()
        except Exception:
            logger.exception("%s errored", name)
            results[name] = False
    print("\n=== RESULTS ===")
    for name, ok in results.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    assert all(results.values()), "some live checks failed"


if __name__ == "__main__":
    asyncio.run(main())
