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
    MODELS_NEWS_DIR,
    OWNER,
    REPO,
    _github_headers,
    call_pollinations_api,
    get_env,
    get_file_sha,
    github_api_request,
    load_prompt,
    models_news_staging_dir,
    parse_json_response,
)

CATEGORIES: tuple[str, ...] = ("text", "image", "audio", "embeddings")
GEN_BASE = "https://gen.pollinations.ai"
MODELS_DIR = MODELS_NEWS_DIR
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


class GithubProbeError(RuntimeError):
    """Raised when a GET probe against the news branch returns an unexpected
    (non-200, non-404) status — we can't tell whether the resource exists, so
    we must fail closed rather than guess. Treating unknown as 'absent' would
    silently disable the baseline-loss guard during a GitHub API outage."""


def _news_branch_exists(github_token: str, owner: str, repo: str) -> bool:
    """True on confirmed 200, False on confirmed 404, raises on anything else."""
    headers = _github_headers(github_token)
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/{GISTS_BRANCH}"
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code == 200:
        return True
    if resp.status_code == 404:
        return False
    raise GithubProbeError(
        f"unexpected status probing {GISTS_BRANCH} ref: "
        f"{resp.status_code} {resp.text[:200]}"
    )


def _path_exists_on_news(
    github_token: str, owner: str, repo: str, path: str
) -> bool:
    """True on confirmed 200, False on confirmed 404, raises on anything else."""
    headers = _github_headers(github_token)
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}?ref={GISTS_BRANCH}"
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code == 200:
        return True
    if resp.status_code == 404:
        return False
    raise GithubProbeError(
        f"unexpected status probing {path} on {GISTS_BRANCH}: "
        f"{resp.status_code} {resp.text[:200]}"
    )


class MissingPriorSnapshotError(RuntimeError):
    """Raised when the news branch exists but no prior snapshot can be found."""


def find_previous_snapshot_date(
    github_token: str, owner: str, repo: str, before: str
) -> str | None:
    """List snapshots/ on news branch via Contents API, return latest date strictly before `before`.

    Returns None when this is the first run for the models report — either the
    news branch doesn't exist yet, or it exists but `social/news/models/` was
    never created (no baseline can have been lost because none ever existed).

    Raises MissingPriorSnapshotError when `social/news/models/` exists but
    `snapshots/` is missing/empty — that means a baseline was wiped and
    silently rebuilding it would skip announcing any pending changes.
    Set ALLOW_BASELINE_REBUILD=1 to override (e.g. after an intentional reset).
    """
    headers = _github_headers(github_token)
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{SNAPSHOT_PREFIX}?ref={GISTS_BRANCH}"
    resp = github_api_request("GET", url, headers=headers)

    # Probes raise GithubProbeError on any non-200/non-404 — propagate up so
    # main() exits non-zero rather than silently treating an API outage as
    # "fresh repo, safe to bootstrap" and dropping a week of changes.
    branch_exists = _news_branch_exists(github_token, owner, repo)
    allow_rebuild = bool(os.environ.get("ALLOW_BASELINE_REBUILD"))
    # Distinguish "never initialized" (parent dir absent → safe bootstrap)
    # from "baseline wiped" (parent dir present, snapshots/ gone → dangerous).
    # Only consult this when the branch itself exists.
    models_dir_exists = (
        _path_exists_on_news(github_token, owner, repo, MODELS_DIR)
        if branch_exists
        else False
    )
    needs_guard = bool(branch_exists and models_dir_exists and not allow_rebuild)

    if resp.status_code == 404:
        if needs_guard:
            raise MissingPriorSnapshotError(
                f"{MODELS_DIR}/ exists on {GISTS_BRANCH} but {SNAPSHOT_PREFIX}/ "
                "is missing — refusing to rebuild baseline. Set "
                "ALLOW_BASELINE_REBUILD=1 to proceed if this is intentional."
            )
        return None
    if resp.status_code != 200:
        msg = (
            f"Could not list {SNAPSHOT_PREFIX} on {GISTS_BRANCH}: "
            f"{resp.status_code} {resp.text[:200]}"
        )
        if needs_guard:
            raise MissingPriorSnapshotError(msg)
        print(f"  {msg}")
        return None
    entries = resp.json()
    if not isinstance(entries, list):
        msg = (
            f"Unexpected payload listing {SNAPSHOT_PREFIX}: "
            f"{type(entries).__name__}"
        )
        if needs_guard:
            raise MissingPriorSnapshotError(msg)
        print(f"  {msg}")
        return None
    dates = sorted(
        e["name"].removesuffix(".json")
        for e in entries
        if e.get("type") == "file" and e["name"].endswith(".json")
    )
    if not dates and needs_guard:
        raise MissingPriorSnapshotError(
            f"{SNAPSHOT_PREFIX}/ exists on {GISTS_BRANCH} but is empty — "
            "refusing to rebuild baseline. Set ALLOW_BASELINE_REBUILD=1 "
            "to proceed if this is intentional."
        )
    earlier = [d for d in dates if d < before]
    # Snapshots exist but all are >= target date — almost certainly a rerun
    # for an old date; fine to treat as baseline since the same-or-future
    # snapshot will be overwritten.
    return earlier[-1] if earlier else None


def load_snapshot_from_news(
    github_token: str, owner: str, repo: str, date_str: str
) -> dict[str, list[dict[str, Any]]]:
    """Load a known-existing snapshot. Raises MissingPriorSnapshotError if the
    fetch fails — the caller has already confirmed this date exists via the
    directory listing, so a failure here means a transient API error or a
    race, and silently rebuilding the baseline would drop a week of changes."""
    headers = _github_headers(github_token)
    url = (
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/"
        f"{SNAPSHOT_PREFIX}/{date_str}.json?ref={GISTS_BRANCH}"
    )
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code != 200:
        raise MissingPriorSnapshotError(
            f"failed to load {SNAPSHOT_PREFIX}/{date_str}.json from "
            f"{GISTS_BRANCH}: {resp.status_code} {resp.text[:200]}"
        )
    content = base64.b64decode(resp.json()["content"]).decode()
    return json.loads(content)


def load_models_md(github_token: str, owner: str, repo: str) -> str:
    """Return the existing changelog body, or "" if the file genuinely doesn't
    exist yet (404). Any other failure is fatal — silently returning "" on a
    transient GitHub error would make the next atomic commit overwrite the
    full changelog with only this week's section."""
    headers = _github_headers(github_token)
    url = (
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/"
        f"{MODELS_MD_PATH}?ref={GISTS_BRANCH}"
    )
    resp = github_api_request("GET", url, headers=headers)
    if resp.status_code == 404:
        return ""
    if resp.status_code != 200:
        raise RuntimeError(
            f"failed to read {MODELS_MD_PATH} from {GISTS_BRANCH}: "
            f"{resp.status_code} {resp.text[:200]}"
        )
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
    force_republish = bool(os.environ.get("FORCE_REPUBLISH"))

    print(f"Snapshotting models for {target_date} ({owner}/{repo})")

    # Idempotency guard: if discord.json for this date is already on news,
    # a previous run already announced these changes. A rerun would post
    # Discord again and prepend a duplicate `## {date}` section to models.md.
    # FORCE_REPUBLISH=1 overrides (e.g. resending after a Discord outage).
    try:
        already_published = _path_exists_on_news(
            github_token, owner, repo, f"{MODELS_DIR}/{target_date}/discord.json"
        )
    except GithubProbeError as exc:
        print(f"  Could not check for existing report: {exc}", file=sys.stderr)
        return 1
    if already_published and not force_republish:
        print(
            f"  Report for {target_date} already published on {GISTS_BRANCH} — "
            "skipping. Set FORCE_REPUBLISH=1 to override."
        )
        return 0

    try:
        current = fetch_all_snapshots()
    except (requests.RequestException, ValueError) as exc:
        print(f"  Failed to fetch model lists: {exc}", file=sys.stderr)
        return 1

    try:
        previous_date = find_previous_snapshot_date(
            github_token, owner, repo, target_date
        )
        previous = (
            load_snapshot_from_news(github_token, owner, repo, previous_date)
            if previous_date
            else None
        )
    except (MissingPriorSnapshotError, GithubProbeError) as exc:
        print(f"  {exc}", file=sys.stderr)
        return 1
    print(f"  Previous snapshot: {previous_date or '(none)'}")

    diff = diff_models(previous, current)
    snapshot_json = json.dumps(current, indent=2, ensure_ascii=False)
    if diff.is_empty():
        print("  No model changes — skipping report.")
        # No publish step runs, so it's safe to advance the baseline now.
        if not dry_run and not commit_text_to_news(
            github_token,
            owner,
            repo,
            f"{SNAPSHOT_PREFIX}/{target_date}.json",
            snapshot_json,
            f"chore(news): models snapshot {target_date} (no changes)",
        ):
            print(
                f"  Failed to commit baseline snapshot for {target_date}",
                file=sys.stderr,
            )
            return 1
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
    try:
        existing_md = load_models_md(github_token, owner, repo)
    except RuntimeError as exc:
        print(f"  {exc}", file=sys.stderr)
        return 1
    # Strip any existing top-level changelog heading so we don't accumulate
    # duplicates each week — the H1 is re-added below.
    body = existing_md.lstrip()
    if body.startswith("# Pollinations Model Changelog"):
        body = body.split("\n", 1)[1].lstrip() if "\n" in body else ""
    new_md = (
        "# Pollinations Model Changelog\n\n"
        + report["models_md_section"].rstrip()
        + ("\n\n" + body if body else "\n")
    )

    if dry_run:
        print("--- DRY RUN: models.md head ---")
        print(new_md[:1500])
        print("--- DRY RUN: discord.json ---")
        print(json.dumps(discord, indent=2, ensure_ascii=False))
        return 0

    # Nothing is committed to the news branch here. All four artifacts are
    # staged in the workspace; the publish step posts Discord and, only on
    # success, commits them atomically in a single tree commit. A publish
    # failure (or run cancellation) leaves the news branch untouched so the
    # next run re-detects and re-announces the same changes.
    contents: dict[str, str] = {
        "discord.json": json.dumps(discord, indent=2, ensure_ascii=False),
        "diff.json": json.dumps(diff.to_json(), indent=2, ensure_ascii=False),
        "models.md": new_md,
        "snapshot.json": snapshot_json,
    }
    out_dir = models_news_staging_dir(target_date)
    for filename, body in contents.items():
        with open(os.path.join(out_dir, filename), "w", encoding="utf-8") as fh:
            fh.write(body)
    print(f"  Staged {len(contents)} artifacts in {out_dir} (commit deferred to publish)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
