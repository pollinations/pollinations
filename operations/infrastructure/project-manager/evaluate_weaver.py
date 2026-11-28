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


def trial_misses(trials):
    misses = {}
    for i, t in enumerate(trials, 1):
        if t.get("error") or t.get("differences"):
            misses[str(i)] = {k: t[k] for k in ("error", "differences") if t.get(k)}
    return misses


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
    for raw_call in (c for c in calls if c.get("http_status") == 200):
        if raw_call.get("error"):
            result["error"] = raw_call["error"]
        completion_id = raw_call.get("completion_id")
        if not completion_id or completion_id in seen or raw_call.get("cache") == "HIT":
            result["error"] = "fresh generation could not be verified"
        seen.add(completion_id)
    result["seconds"] = round(time.monotonic() - started, 2)
    return result


def preview_verdict(mode, reports):
    """Return the observed paired scores and the reason a run cannot pass."""
    cases = [case for report in reports.values() for case in report["cases"].values()]
    if any("error" in t for case in cases for t in case["trials"]):
        return {}, "Invalid or unavailable trials. See the artifact."
    if mode not in {"shortened", "hosted"}:
        return {}, None

    baseline = reports["baseline"]["cases"]
    candidate = reports[mode]["cases"]
    if baseline.keys() != candidate.keys():
        return {}, "Baseline and candidate must classify the same cases."
    scores = {group: {"baseline": 0, "candidate": 0, "trials_per_arm": 0}
              for group in ("development", "holdout")}
    for case_id, original in baseline.items():
        proposed = candidate[case_id]
        count = len(original["trials"])
        group = original["group"]
        if (count == 0 or len(proposed["trials"]) != count or proposed["group"] != group
                or proposed["expected"] != original["expected"]):
            return {}, f"Incomplete or mismatched pair for {case_id}."
        if group != "diagnostic":
            scores[group]["baseline"] += original["matches"]
            scores[group]["candidate"] += proposed["matches"]
            scores[group]["trials_per_arm"] += count
    if any(s["trials_per_arm"] == 0 for s in scores.values()):
        return scores, "Both scored sets require paired trials."
    below = [name for name, s in scores.items() if s["candidate"] < s["baseline"]]
    return scores, ("Candidate scored below the original on " + ", ".join(below)) if below else None


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


def measure(case, arms, repetitions):
    """Alternate which prompt goes first; share the completion-ID check across both arms."""
    seen = set()
    results = {name: [] for name in arms}
    for i in range(repetitions):
        for name in (list(arms) if i % 2 == 0 else reversed(arms)):
            brief, model = arms[name]
            results[name].append(trial(case, brief, model, seen))
    return results


def main():
    mode = sys.argv[1]
    if mode not in {"baseline", "shortened", "hosted"}:
        raise SystemExit("Unknown Weaver preview")
    if not os.getenv("POLLINATIONS_TOKEN"):
        raise SystemExit("Missing Pollinations credential")
    cases = json.loads((WEAVER_DIR / "classification-cases.json").read_text())
    if gaps := coverage_gaps([c for c in cases if not c.get("diagnostic_only")]):
        raise SystemExit("Missing development coverage: " + ", ".join(gaps))
    holdout = []
    if mode != "baseline":
        holdout = json.loads((WEAVER_DIR / "holdout-cases.json").read_text())
        if not holdout or {c["source"] for c in cases} & {c["source"] for c in holdout}:
            raise SystemExit("Holdout sources must be new")
        cases += holdout

    candidate = (WEAVER_DIR / "system-prompt.md").read_text().strip()
    arms = {"baseline": (read_brief(), None)}
    if mode == "hosted":
        model = os.getenv("PREVIEW_WEAVER_MODEL")
        if model != "community/pollinations-ai/weaver":
            raise SystemExit("Provide the callable ID verified by the owner readback")
        arms["hosted"] = (candidate, model)
    elif mode != "baseline":
        arms["shortened"] = (candidate, None)
    reports = {name: {"model": model or AI_MODEL, "prompt_sha256": digest(brief), "cases": {}}
               for name, (brief, model) in arms.items()}
    repetitions = 3
    holdout_ids = {c["id"] for c in holdout}
    summaries = []
    with ThreadPoolExecutor(max_workers=4) as workers:
        jobs = [(case, workers.submit(measure, case, arms, repetitions)) for case in cases]
        for case, job in jobs:
            for name, trials in job.result().items():
                errors = sum("error" in t for t in trials)
                misses = trial_misses(trials)
                matches = len(trials) - len(misses)
                group = "holdout" if case["id"] in holdout_ids else "development"
                if case.get("diagnostic_only"):
                    group = "diagnostic"
                reports[name]["cases"][case["id"]] = {
                    "group": group, "expected": case["expected"], "matches": matches, "trials": trials,
                    "misses": misses,
                }
                summaries.append(f"| {case['id']} | {group} | {name} | {matches}/{len(trials)} | {errors} |")
    for report in reports.values():
        estimate_cost(report)
    scores, failure = preview_verdict(mode, reports)
    output = {"mode": mode, "commit": os.getenv("GITHUB_SHA"), "cases_sha256": case_digest(cases), "arms": reports,
              "paired_scores": scores, "failure": failure}
    Path(os.environ["WEAVER_RESULT"]).write_text(json.dumps(output, indent=2) + "\n")
    summary = "\n".join(["| Case | Set | Prompt | Exact | Invalid |", "|---|---|---|---:|---:|", *summaries])
    for group, score in scores.items():
        n = score["trials_per_arm"]
        summary += f"\n\n{group}: original {score['baseline']}/{n}, {mode} {score['candidate']}/{n}."
    if failure:
        summary += "\n\n" + failure
    print(summary)
    if path := os.getenv("GITHUB_STEP_SUMMARY"):
        with open(path, "a") as stream:
            print(summary, file=stream)
    if failure:
        raise SystemExit(failure)


if __name__ == "__main__":
    main()
