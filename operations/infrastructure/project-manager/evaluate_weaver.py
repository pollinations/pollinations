"""Read-only evaluation of frozen item evidence. No GitHub client or write path."""

import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from project_manager import AI_MODEL, MODEL_WORK, PRIORITIES, WEAVER_DIR, area_names, ask_ai, classification_answer, item_prompt, read_brief


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def case_digest(case):
    return digest(json.dumps(case, ensure_ascii=False, sort_keys=True))


def baseline_record(case, trials, run):
    misses = {}
    for i, t in enumerate(trials, 1):
        if t.get("error") or t.get("differences"):
            misses[str(i)] = {k: t[k] for k in ("error", "differences") if t.get(k)}
    return {"case_sha256": case_digest(case), "run": run, "trials": len(trials), "misses": misses}


def coverage_gaps(cases):
    tags = {tag for case in cases for tag in case["coverage"]}
    missing = {"blocked", "billing", "workaround", "question", "promotion", "bot-correction",
               "untrusted-instructions", "outside-queues"} - tags
    queues = {case["expected"]["model_work"] for case in cases}
    missing.update(set(MODEL_WORK) - queues)
    for priority in PRIORITIES:
        sources = {c["source"] for c in cases if c["evidence"]["kind"] == "issue" and c["expected"]["priority"] == priority}
        if len(sources) < 2:
            missing.add(f"two distinct {priority} issues")
    return sorted(missing)


def trial(case, brief, model, seen):
    started = time.monotonic()
    calls = []
    result = {"calls": calls}
    try:
        raw = ask_ai(brief, item_prompt(**case["evidence"]), hosted_model=model, metrics=calls, fresh=True)
        if raw is None:
            result["error"] = "invalid JSON" if any(c.get("error") == "invalid JSON" for c in calls) else "unavailable"
        else:
            # Score the returned fields, including nulls, before the writer drops PR priority.
            result["actual"] = {k: raw.get(k) for k in case["expected"]}
            missing = [k for k in case["expected"] if k not in raw]
            if missing:
                result["error"] = "missing fields: " + ", ".join(missing)
            result["differences"] = {k: v for k, v in result["actual"].items() if v != case["expected"][k]}
            classification_answer(raw, area_names(brief), case["evidence"]["kind"] == "pull request", hosted=bool(model))
    except (ValueError, SystemExit) as error:
        result["error"] = str(error)
    if raw_call := next((c for c in reversed(calls) if c.get("http_status") == 200), None):
        completion_id = raw_call.get("completion_id")
        if not completion_id or completion_id in seen or raw_call.get("cache") == "HIT":
            result["error"] = "fresh generation could not be verified"
        seen.add(completion_id)
    result["seconds"] = round(time.monotonic() - started, 2)
    return result


def estimate_cost(report):
    # Rate this text-only preview at its catalog price; report the basis separately from a billed amount.
    try:
        response = requests.get("https://gen.pollinations.ai/text/models",
                                headers={"Authorization": "Bearer " + os.environ["POLLINATIONS_TOKEN"]}, timeout=30)
        response.raise_for_status()
        rates = next(m["pricing"] for m in response.json() if m["name"] == report["model"])
        report["catalog_pricing"] = rates
        for case in report["cases"].values():
            for t in case["trials"]:
                for call in t["calls"]:
                    if "usage" not in call or call.get("cache") == "HIT":
                        continue
                    usage = call["usage"]
                    details = usage.get("prompt_tokens_details") or {}
                    cached = details.get("cached_tokens") or 0
                    written = details.get("cache_write_tokens") or 0
                    uncached = usage["prompt_tokens"] - cached - written
                    if uncached >= 0:
                        call["estimated_pollen"] = (
                            uncached * float(rates["promptTextTokens"]) + cached * float(rates["promptCachedTokens"])
                            + written * float(rates["promptCacheWriteTokens"])
                            + usage["completion_tokens"] * float(rates["completionTextTokens"]))
    except (requests.RequestException, StopIteration, KeyError, TypeError, ValueError):
        print("Catalog estimate unavailable; retain usage and request IDs for reconciliation.")


def main():
    mode = sys.argv[1]
    if mode not in {"baseline", "shortened", "hosted"}:
        raise SystemExit("Choose baseline, shortened or hosted")
    cases_path = WEAVER_DIR / "classification-cases.json"
    cases = json.loads(cases_path.read_text())
    fingerprint = digest(json.dumps(cases, ensure_ascii=False, sort_keys=True))
    original = read_brief()
    brief = original if mode == "baseline" else (WEAVER_DIR / "system-prompt.md").read_text().strip()
    model = os.environ["PREVIEW_WEAVER_MODEL"] if mode == "hosted" else None
    if mode == "hosted" and model != "community/pollinations-ai/weaver":
        raise SystemExit("Provide the callable ID verified by the owner readback")
    if not os.getenv("POLLINATIONS_TOKEN"):
        raise SystemExit("Missing Pollinations credential")
    report = {"mode": mode, "commit": os.getenv("GITHUB_SHA"), "model": model or AI_MODEL,
              "cases_sha256": fingerprint, "prompt_sha256": digest(brief), "cases": {}}
    index_path = WEAVER_DIR / "calibration.json"
    calibration = json.loads(index_path.read_text()) if index_path.exists() else {}
    if calibration and (calibration["prompt_sha256"] != digest(original) or calibration["model"] != AI_MODEL):
        raise SystemExit("The baseline policy or model changed. Archive the old calibration before starting a new one.")
    records = calibration.get("cases", {})
    if records and calibration.get("sampling") != "fresh":
        raise SystemExit("Cached responses cannot qualify cases")
    fresh = [c for c in cases if records.get(c["id"], {}).get("case_sha256") != case_digest(c)]
    if mode != "baseline" and fresh:
        raise SystemExit("Calibrate the new or revised cases before scoring candidates")
    if mode != "baseline":
        report["excluded"] = {c["id"]: records[c["id"]] for c in cases if records[c["id"]]["misses"]}
    if mode == "baseline":
        selected = fresh
    else:
        selected = [c for c in cases if records[c["id"]]["trials"] == 3 and not records[c["id"]]["misses"]]
    if gaps := coverage_gaps(cases if mode == "baseline" else selected):
        raise SystemExit("Missing calibrated coverage: " + ", ".join(gaps))

    def measure(case):
        seen = set()
        return case, [trial(case, brief, model, seen) for _ in range(3)]

    with ThreadPoolExecutor(max_workers=4) as workers:
        for case, attempts in workers.map(measure, selected):
            matches = sum("error" not in t and not t["differences"] for t in attempts)
            report["cases"][case["id"]] = {"expected": case["expected"], "matches": matches, "trials": attempts}
            print(f'{case["id"]}: {matches}/3 expected answers', flush=True)

    estimate_cost(report)
    output = Path(os.environ["WEAVER_RESULT"])
    output.write_text(json.dumps(report, indent=2) + "\n")
    if mode == "baseline":
        for c in selected:
            records[c["id"]] = baseline_record(c, report["cases"][c["id"]]["trials"], os.environ.get("GITHUB_RUN_ID"))
        output.with_name("calibration.json").write_text(json.dumps(
            {**calibration, "sampling": "fresh", "model": AI_MODEL, "prompt_sha256": digest(original), "cases": records}, indent=2) + "\n")
        passed = [c for c in cases if records[c["id"]]["trials"] == 3 and not records[c["id"]]["misses"]]
    else:
        passed = [c for c in selected if report["cases"][c["id"]]["matches"] == 3]
        cases = selected
    gaps = coverage_gaps(passed)
    summary = f"{mode}: {len(passed)} of {len(cases)} cases matched on all three runs."
    if gaps:
        summary += " Missing coverage: " + ", ".join(gaps) + "."
    print(summary)
    if path := os.getenv("GITHUB_STEP_SUMMARY"):
        with open(path, "a") as stream:
            print(summary, file=stream)
    if mode != "baseline" and len(passed) != len(cases):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
