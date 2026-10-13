"""Keyless diagnosis of public forum denial pages; these are not research evidence."""
import importlib.util
import json
import os
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("fetch_adapter", root / "operations/model-management/fetch.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
out = Path(os.environ["SOURCE_PROBE_OUT"])
out.mkdir(parents=True, exist_ok=True)
results = []
for url in [
    "https://www.reddit.com/r/LocalLLaMA/top/?t=week",
    "https://old.reddit.com/r/LocalLLaMA/top/?t=week",
    "https://www.quora.com/What-is-the-prognosis-for-OpenAIs-high-performing-GPT-5-6-Sol-model-in-light-of-its-price-compared-to-Chinese-models-like-Moonshots-Kimi-K3",
]:
    deadline = time.monotonic() + 25
    result = {"url": url, "paidCalls": 0}
    try:
        target = adapter._validate_url(url, deadline)
        response = adapter._pinned_fetch(target, deadline, raw=True)
        parser = adapter._TextParser()
        parser.feed(response.body.decode("utf-8", errors="replace"))
        parser.close()
        text = parser.text()
        result.update({"httpStatus": response.status, "diagnosticText": text[:450]})
    except Exception as error:
        result["error"] = type(error).__name__
    results.append(result)
    print(json.dumps(result), flush=True)
(out / "denial-diagnostics.json").write_text(json.dumps(results, indent=2), encoding="utf-8")