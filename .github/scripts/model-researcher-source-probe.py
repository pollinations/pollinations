"""Keyless public-source diagnostic; failed reads are results, not acceptance."""
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("fetch_adapter", root / "operations/model-management/fetch.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
adapter.HTTP_DEADLINE_SECONDS = 25
adapter.MAX_HTTP_ATTEMPTS = 2
out = Path(os.environ["SOURCE_PROBE_OUT"])
out.mkdir(parents=True, exist_ok=True)
os.environ["FETCH_CACHE_DIR"] = str(out / "pages")
targets = [
    "https://www.reddit.com/r/LocalLLaMA/top/?t=week",
    "https://old.reddit.com/r/LocalLLaMA/top/?t=week",
    "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=week",
    "https://old.reddit.com/r/LocalLLaMA/top/.rss?t=week",
    "https://www.reddit.com/r/LocalLLaMA/top.json?t=week&limit=25",
    "https://www.reddit.com/r/StableDiffusion/top/.rss?t=week",
    "https://www.quora.com/What-is-the-prognosis-for-OpenAIs-high-performing-GPT-5-6-Sol-model-in-light-of-its-price-compared-to-Chinese-models-like-Moonshots-Kimi-K3",
    "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=20",
    "https://huggingface.co/api/models?sort=downloads&direction=-1&limit=20",
]
results = []
for url in targets:
    started = time.monotonic()
    result = adapter._read_http(url, 18000, include_links=True)
    result["elapsedSeconds"] = round(time.monotonic() - started, 2)
    result["requestedUrl"] = url
    results.append(result)
    (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: result.get(key) for key in ["requestedUrl", "url", "status", "method", "error", "elapsedSeconds"]}), flush=True)
print(json.dumps({"successful": sum(row["status"] == "fetched" for row in results), "attempted": len(results), "paidCalls": 0}), flush=True)
