#!/usr/bin/env python3
"""Weekly model-changes report generator.

Snapshots public Pollinations model endpoints, diffs against the previous
snapshot stored on the `news` branch, and writes:

- social/news/models/snapshots/YYYY-MM-DD.json (raw API responses)
- social/news/models/diffs/YYYY-MM-DD.json (added/removed/changed)
- social/news/models/YYYY-MM-DD/discord.json (AI-formatted Discord post)
- social/news/models/models.md (cumulative changelog, AI-prepended section)

If the diff is empty, the script exits silently with code 0 — no commit, no
post. The publish step keys off the existence of discord.json on the news
branch.

Required env vars (matches existing social/* conventions):
- GITHUB_TOKEN: token with contents:write for the news branch
- POLLINATIONS_TOKEN: bearer token for gen.pollinations.ai
- GITHUB_REPOSITORY: owner/repo (auto-set in Actions)

Optional:
- TARGET_DATE: YYYY-MM-DD override (default: today UTC)
- DRY_RUN: if set, skip GitHub commits and only print the planned output
"""

from __future__ import annotations

import base64
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import requests

from common import (
    GISTS_BRANCH,
    GITHUB_API_BASE,
    OWNER,
    REPO,
    _github_headers,
    call_pollinations_api,
    get_env,
    get_file_sha,
    github_api_request,
    load_prompt,
    parse_json_response,
)

CATEGORIES: tuple[str, ...] = ("text", "image", "audio", "embeddings")
GEN_BASE = "https://gen.pollinations.ai"
MODELS_DIR = "social/news/models"
MODELS_MD_PATH = f"{MODELS_DIR}/models.md"
SNAPSHOT_PREFIX = f"{MODELS_DIR}/snapshots"
DIFF_PREFIX = f"{MODELS_DIR}/diffs"


@dataclass(frozen=True)
class Diff:
    added: dict[str, list[dict[str, Any]]]
    removed: dict[str, list[dict[str, Any]]]
    changed: dict[str, list[dict[str, Any]]]

    def is_empty(self) -> bool:
        return not any(
            self.added[c] or self.removed[c] or self.changed[c] for c in CATEGORIES
        )

    def to_json(self) -> dict[str, Any]:
        return {"added": self.added, "removed": self.removed, "changed": self.changed}


def fetch_models(category: str) -> list[dict[str, Any]]:
    """GET /{category}/models without auth — auth filters models by key permissions,
    which would create false 'removed' entries when keys differ. Unauth returns the
    full public superset including paid_only entries."""
    url = f"{GEN_BASE}/{category}/models"
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    # /v1/models wraps in {data:[...]}. The rich endpoints return a bare list.
    if isinstance(payload, dict) and "data" in payload:
        return list(payload["data"])
    if isinstance(payload, list):
        return payload
    raise ValueError(f"Unexpected shape from {url}: {type(payload).__name__}")


def fetch_all_snapshots() -> dict[str, list[dict[str, Any]]]:
    return {cat: fetch_models(cat) for cat in CATEGORIES}


def find_previous_snapshot_date(
    github_token: str, owner: str, repo: str, before: str
) -> str | None:
    """List snapshots/ on news branch via Contents API, return latest date strictly before `before`."""
    headers = _github_headers(github_token)
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{SNAPSHOT_PREFIX}?ref={GISTS_BRANCH}"
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        print(f"  Could not list snapshots: {resp.status_code} {resp.text[:200]}")
        return None
    entries = resp.json()
    if not isinstance(entries, list):
        return None
    dates = sorted(
        e["name"].removesuffix(".json")
        for e in entries
        if e.get("type") == "file" and e["name"].endswith(".json")
    )
    earlier = [d for d in dates if d < before]
    return earlier[-1] if earlier else None


def load_snapshot_from_news(
    github_token: str, owner: str, repo: str, date_str: str
) -> dict[str, list[dict[str, Any]]] | None:
    headers = _github_headers(github_token)
    url = (
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/"
        f"{SNAPSHOT_PREFIX}/{date_str}.json?ref={GISTS_BRANCH}"
    )
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code != 200:
        return None
    content = base64.b64decode(resp.json()["content"]).decode()
    return json.loads(content)


def load_models_md(github_token: str, owner: str, repo: str) -> str:
    headers = _github_headers(github_token)
    url = (
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/"
        f"{MODELS_MD_PATH}?ref={GISTS_BRANCH}"
    )
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code != 200:
        return ""
    return base64.b64decode(resp.json()["content"]).decode()


# Fields ignored when comparing models. Pricing fluctuates frequently and is
# not user-facing model news; description text gets edited for clarity without
# any underlying capability change.
_DIFF_IGNORED_FIELDS: frozenset[str] = frozenset({"pricing", "description"})


def _normalize_for_diff(model: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in model.items() if k not in _DIFF_IGNORED_FIELDS}


def diff_models(
    previous: dict[str, list[dict[str, Any]]] | None,
    current: dict[str, list[dict[str, Any]]],
) -> Diff:
    added: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}
    removed: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}
    changed: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}

    if previous is None:
        # First run: do not flood the diff with every existing model. Treat
        # the very first snapshot as a baseline with no announced changes.
        return Diff(added=added, removed=removed, changed=changed)

    for cat in CATEGORIES:
        prev_by_name = {
            m.get("name"): m for m in previous.get(cat, []) if m.get("name")
        }
        curr_by_name = {m.get("name"): m for m in current.get(cat, []) if m.get("name")}

        for name, model in curr_by_name.items():
            if name not in prev_by_name:
                added[cat].append(model)
            elif _normalize_for_diff(prev_by_name[name]) != _normalize_for_diff(model):
                changed[cat].append({"before": prev_by_name[name], "after": model})

        for name, model in prev_by_name.items():
            if name not in curr_by_name:
                removed[cat].append(model)

    return Diff(added=added, removed=removed, changed=changed)


def render_ai_report(
    diff: Diff, date_str: str, previous_date: str | None, pollinations_token: str
) -> dict[str, str] | None:
    system_prompt = load_prompt("models_news")
    user_prompt = json.dumps(
        {
            "date": date_str,
            "previous_date": previous_date,
            "diff": diff.to_json(),
        },
        indent=2,
        ensure_ascii=False,
    )
    raw = call_pollinations_api(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        token=pollinations_token,
        temperature=0.4,
        exit_on_failure=False,
    )
    if not raw:
        return None
    parsed = parse_json_response(raw)
    if not parsed or "models_md_section" not in parsed or "discord_text" not in parsed:
        print(f"  AI response missing required keys: {raw[:300]}")
        return None
    return parsed


def commit_text_to_news(
    github_token: str,
    owner: str,
    repo: str,
    file_path: str,
    content: str,
    message: str,
) -> bool:
    encoded = base64.b64encode(content.encode("utf-8")).decode()
    sha = get_file_sha(github_token, owner, repo, file_path, GISTS_BRANCH)
    payload: dict[str, Any] = {
        "message": message,
        "content": encoded,
        "branch": GISTS_BRANCH,
    }
    if sha:
        payload["sha"] = sha
    resp = github_api_request(
        "PUT",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}",
        headers=_github_headers(github_token),
        json=payload,
    )
    if resp.status_code in (200, 201):
        print(f"  Committed {file_path} on {GISTS_BRANCH}")
        return True
    print(f"  Failed to commit {file_path}: {resp.status_code} {resp.text[:200]}")
    return False


def discord_payload(
    discord_text: str, date_str: str, previous_date: str | None, role_id: str | None
) -> dict[str, Any]:
    text = discord_text
    if role_id:
        text = text.replace("<@&MODEL_ROLE_ID>", f"<@&{role_id}>")
    else:
        text = text.replace("<@&MODEL_ROLE_ID>", "").lstrip()
    return {
        "platform": "discord",
        "scope": "models_weekly",
        "date": date_str,
        "previous_date": previous_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "text": text,
    }


def main() -> int:
    target_date = os.environ.get("TARGET_DATE") or datetime.now(timezone.utc).strftime(
        "%Y-%m-%d"
    )
    dry_run = bool(os.environ.get("DRY_RUN"))

    github_token = get_env("GITHUB_TOKEN", required=True)
    pollinations_token = get_env("POLLINATIONS_TOKEN", required=True)
    repo_full = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
    owner, repo = repo_full.split("/", 1)
    role_id = os.environ.get("DISCORD_MODELS_ROLE_ID")

    print(f"Snapshotting models for {target_date} ({owner}/{repo})")

    try:
        current = fetch_all_snapshots()
    except (requests.RequestException, ValueError) as exc:
        print(f"  Failed to fetch model lists: {exc}", file=sys.stderr)
        return 1

    previous_date = find_previous_snapshot_date(github_token, owner, repo, target_date)
    previous = (
        load_snapshot_from_news(github_token, owner, repo, previous_date)
        if previous_date
        else None
    )
    print(f"  Previous snapshot: {previous_date or '(none)'}")

    diff = diff_models(previous, current)
    if diff.is_empty():
        print("  No model changes — skipping report.")
        # Still record the snapshot so future diffs have a baseline.
        if not dry_run:
            commit_text_to_news(
                github_token,
                owner,
                repo,
                f"{SNAPSHOT_PREFIX}/{target_date}.json",
                json.dumps(current, indent=2, ensure_ascii=False),
                f"chore(news): models snapshot {target_date} (no changes)",
            )
        return 0

    print(
        "  Diff: "
        + ", ".join(
            f"{c}=+{len(diff.added[c])}/-{len(diff.removed[c])}/~{len(diff.changed[c])}"
            for c in CATEGORIES
        )
    )

    report = render_ai_report(diff, target_date, previous_date, pollinations_token)
    if not report:
        print("  AI formatting failed — aborting.", file=sys.stderr)
        return 1

    discord = discord_payload(
        report["discord_text"], target_date, previous_date, role_id
    )
    existing_md = load_models_md(github_token, owner, repo)
    new_md = report["models_md_section"].rstrip() + "\n\n" + existing_md.lstrip()
    if not new_md.startswith("# Pollinations Model Changelog"):
        new_md = "# Pollinations Model Changelog\n\n" + new_md

    if dry_run:
        print("--- DRY RUN: models.md head ---")
        print(new_md[:1500])
        print("--- DRY RUN: discord.json ---")
        print(json.dumps(discord, indent=2, ensure_ascii=False))
        return 0

    ok = all(
        [
            commit_text_to_news(
                github_token,
                owner,
                repo,
                f"{SNAPSHOT_PREFIX}/{target_date}.json",
                json.dumps(current, indent=2, ensure_ascii=False),
                f"chore(news): models snapshot {target_date}",
            ),
            commit_text_to_news(
                github_token,
                owner,
                repo,
                f"{DIFF_PREFIX}/{target_date}.json",
                json.dumps(diff.to_json(), indent=2, ensure_ascii=False),
                f"chore(news): models diff {target_date}",
            ),
            commit_text_to_news(
                github_token,
                owner,
                repo,
                MODELS_MD_PATH,
                new_md,
                f"chore(news): update models.md for {target_date}",
            ),
            commit_text_to_news(
                github_token,
                owner,
                repo,
                f"{MODELS_DIR}/{target_date}/discord.json",
                json.dumps(discord, indent=2, ensure_ascii=False),
                f"chore(news): models discord post {target_date}",
            ),
        ]
    )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
