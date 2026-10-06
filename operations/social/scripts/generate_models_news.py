#!/usr/bin/env python3
"""Daily model announcements and weekly Discord report generator.

Snapshots public Pollinations model endpoints, diffs against the previous
snapshot stored on the `news` branch, and writes:

- operations/social/news/models/snapshots/YYYY-MM-DD.json (raw API responses)
- operations/social/news/models/diffs/YYYY-MM-DD.json (added/removed/changed)
- operations/social/news/models/YYYY-MM-DD/discord.json (AI-formatted Discord post)
- operations/social/news/models/models.md (cumulative changelog, AI-prepended section)

DAILY_ONLY=1 atomically commits the daily snapshot, diff and a versioned
model-announcements JSON comment in models.md (official models only).
The comment contains observed changes from seven calendar days including
today and declared changes/retirements through the next 30 days. Weekly
Discord summaries remain human-readable and use the last published receipt
as their baseline. Daily mode never formats or posts a Discord message.

Required env vars (matches existing operations/social/* conventions):
- GITHUB_TOKEN: token with contents:write for the news branch
- POLLINATIONS_TOKEN: bearer token for gen.pollinations.ai (weekly mode only)
- GITHUB_REPOSITORY: owner/repo (auto-set in Actions)
- MODEL_RETIREMENTS_PATH: JSON exported by model_retirements.ts

Optional:
- TARGET_DATE: YYYY-MM-DD override (default: today UTC)
- DRY_RUN: if set, skip GitHub commits and only print the planned output
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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

CATEGORIES: tuple[str, ...] = (
    "text",
    "image",
    "video",
    "audio",
    "embeddings",
    "3d",
    "realtime",
)
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


def fetch_all_snapshots() -> dict[str, list[dict[str, Any]]]:
    """GET /models returns every model in one call with a 'category' field.
    We bucket by that field into the known categories.

    No auth — authenticated requests filter by key permissions, which would
    create false 'removed' entries when keys differ between runs."""
    url = f"{GEN_BASE}/models"
    resp = requests.get(url, headers={"Accept": "application/json"}, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    # /v1/models wraps in {data:[...]}; /models returns a bare list.
    all_models: list[dict[str, Any]] = (
        list(payload["data"])
        if isinstance(payload, dict) and "data" in payload
        else list(payload)
        if isinstance(payload, list)
        else []
    )
    if not all_models:
        raise ValueError(f"Unexpected or empty response from {url}: {payload!r:.200}")

    result: dict[str, list[dict[str, Any]]] = {cat: [] for cat in CATEGORIES}
    unknown: list[str] = []
    for model in all_models:
        cat = model.get("category", "")
        # API returns "embedding" (singular); we bucket under "embeddings"
        if cat == "embedding":
            cat = "embeddings"
        if cat in result:
            result[cat].append(model)
        else:
            unknown.append(f"{model.get('name', '?')}({cat})")
    if unknown:
        print(f"  Warning: unrecognised categories, skipped: {unknown[:10]}")
    return result


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


def _path_exists_on_news(github_token: str, owner: str, repo: str, path: str) -> bool:
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
    news branch doesn't exist yet, or it exists but `operations/social/news/models/` was
    never created (no baseline can have been lost because none ever existed).

    Raises MissingPriorSnapshotError when `operations/social/news/models/` exists but
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
        msg = f"Unexpected payload listing {SNAPSHOT_PREFIX}: {type(entries).__name__}"
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


def _migrate_old_snapshot(
    snapshot: dict[str, list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    """One-time migration: old snapshots stored image+video together under 'image'
    (fetched from /image/models before the video split). If 'video' is absent but
    'image' is present, re-bucket by each model's 'category' field so the diff
    doesn't report all video models as removed from image."""
    if "video" in snapshot or "image" not in snapshot:
        return snapshot
    migrated = {k: list(v) for k, v in snapshot.items()}
    migrated["image"] = [m for m in snapshot["image"] if m.get("category") != "video"]
    migrated["video"] = [m for m in snapshot["image"] if m.get("category") == "video"]
    video_count = len(migrated["video"])
    if video_count:
        print(f"  Migrated {video_count} video model(s) out of old 'image' bucket.")
    return migrated


def _model_key(m: dict[str, Any]) -> str | None:
    """Return a stable identity key for a model, falling back to 'id' for
    older snapshots that predate the 'name' field."""
    return m.get("name") or m.get("id")


def diff_models(
    previous: dict[str, list[dict[str, Any]]] | None,
    current: dict[str, list[dict[str, Any]]],
) -> Diff:
    added: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}
    removed: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}
    changed: dict[str, list[dict[str, Any]]] = {c: [] for c in CATEGORIES}

    if previous is None:
        # First run: treat the snapshot as baseline with no announced changes.
        return Diff(added=added, removed=removed, changed=changed)

    for cat in CATEGORIES:
        curr_raw = current.get(cat, [])
        curr_by_name = {_model_key(m): m for m in curr_raw if _model_key(m)}

        # Category absent from previous snapshot = newly tracked (e.g. 'video'
        # added after this code change). Treat as no baseline — don't flood the
        # diff by announcing every existing model as "added".
        if cat not in previous:
            print(
                f"  Info: '{cat}' not in previous snapshot — skipping (new category)."
            )
            continue

        prev_raw = previous[cat]
        prev_by_name = {_model_key(m): m for m in prev_raw if _model_key(m)}

        # Old snapshot has raw models but none resolved to a key — structural
        # mismatch (e.g. old format used a different field). Skip rather than
        # reporting every current model as "added".
        if prev_raw and not prev_by_name:
            print(
                f"  Warning: previous snapshot for '{cat}' has {len(prev_raw)} models "
                "but none have a resolvable key — skipping diff for this category."
            )
            continue

        for name, model in curr_by_name.items():
            if name not in prev_by_name:
                added[cat].append(model)
            elif announcement_changes(prev_by_name[name], model):
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


# This machine-readable block lives in the existing Markdown changelog.
# Values come directly from the public catalog, never from the AI summary.
FEED_PATTERN = re.compile(r"<!-- model-announcements (.*?) -->", re.DOTALL)
ANNOUNCEMENT_FIELDS = (
    "paid_only",
    "pricing",
    "pricing_units",
    "pricing_variants",
    "pricing_adjustments",
    "input_modalities",
    "output_modalities",
    "capabilities",
    "supported_parameters",
    "supported_endpoints",
    "supports_structured_output",
    "context_length",
    "max_completion_tokens",
    "max_reference_images",
    "max_reference_videos",
    "resolutions",
    "video_capabilities",
    "min_duration",
    "max_duration",
    "allowed_durations",
    "voices",
    "required_safety",
    "per_user_rpm",
)


def announcement_values(model: dict[str, Any]) -> dict[str, Any]:
    values = {key: model[key] for key in ANNOUNCEMENT_FIELDS if key in model}
    values.setdefault("paid_only", False)
    return values


def announcement_changes(before: dict[str, Any], after: dict[str, Any]) -> dict:
    before, after = announcement_values(before), announcement_values(after)
    changes = {}
    for key in ANNOUNCEMENT_FIELDS:
        old, new = before.get(key), after.get(key)
        # Catalog ordering carries no user-visible meaning.
        if isinstance(old, list) and isinstance(new, list):
            if sorted(json.dumps(v, sort_keys=True) for v in old) == sorted(
                json.dumps(v, sort_keys=True) for v in new
            ):
                continue
        if old != new:
            changes[key] = {"before": old, "after": new}
    return changes


def official_model(model: dict[str, Any]) -> bool:
    return bool(_model_key(model)) and not (
        model.get("community") or str(_model_key(model)).startswith("community/")
    )


def update_announcements(
    existing_md: str, diff: Diff, current: dict, retirements: list[dict], date_str: str
) -> str:
    today = datetime.strptime(date_str, "%Y-%m-%d").date()
    # Seven calendar days including today; future notices cover the next 30.
    start = (today - timedelta(days=6)).isoformat()
    end = (today + timedelta(days=30)).isoformat()
    match = FEED_PATTERN.search(existing_md)
    prior = json.loads(match.group(1)) if match else {"events": []}
    # Replacing today's entries makes retries idempotent. Future events are
    # rebuilt from current declarations, so cancelled notices disappear.
    events = [
        event
        for event in prior["events"]
        if start <= event["date"] < date_str and not event.get("scheduled")
    ]
    for category in CATEGORIES:
        for action, models in (
            ("New", diff.added[category]),
            ("Removed", diff.removed[category]),
            ("Updated", diff.changed[category]),
        ):
            for entry in models:
                model = entry["after"] if action == "Updated" else entry
                if not official_model(model):
                    continue
                event = {
                    "date": date_str,
                    "model": _model_key(model),
                    "title": model.get("title") or _model_key(model),
                    "category": model["category"],
                    "action": action,
                }
                if action == "Updated":
                    event["changes"] = announcement_changes(entry["before"], model)
                    if not event["changes"]:
                        continue
                    if "pricing" in event["changes"]:
                        event["pricing_units"] = model.get("pricing_units", {})
                else:
                    event[
                        "after" if action == "New" else "before"
                    ] = announcement_values(model)
                events.append(event)
    for models in current.values():
        for model in models:
            pending = model.get("pending_change")
            if not official_model(model) or not pending:
                continue
            date = pending["effective_at"][:10]
            changes = announcement_changes(model, {**model, **pending})
            if date_str <= date <= end and changes:
                events.append(
                    {
                        "date": date,
                        "model": _model_key(model),
                        "title": model.get("title") or _model_key(model),
                        "category": model["category"],
                        "action": "Updating",
                        "scheduled": True,
                        "changes": changes,
                    }
                )
    for retirement in retirements:
        if date_str <= retirement["date"] <= end:
            events.append({**retirement, "action": "Retiring", "scheduled": True})
    events.sort(key=lambda event: (event["date"], event["model"], event["action"]))
    feed = {
        "version": 1,
        "updated_at": date_str,
        "past_days": 7,
        "future_days": 30,
        "events": events,
    }
    # Escape HTML delimiters inside data without altering decoded values.
    encoded = json.dumps(feed, ensure_ascii=False, separators=(",", ":")).replace(
        ">", "\\u003e"
    )
    block = f"<!-- model-announcements {encoded} -->"
    if match:
        return FEED_PATTERN.sub(lambda _: block, existing_md, count=1)
    heading = "# Pollinations Model Changelog"
    body = existing_md.removeprefix(heading).lstrip()
    return f"{heading}\n\n{block}\n\n{body}"


def daily_artifacts(
    github_token: str, owner: str, repo: str, target_date: str, current: dict
) -> dict[str, str]:
    previous_date = find_previous_snapshot_date(github_token, owner, repo, target_date)
    previous = (
        _migrate_old_snapshot(
            load_snapshot_from_news(github_token, owner, repo, previous_date)
        )
        if previous_date
        else None
    )
    diff = diff_models(previous, current)
    existing_md = load_models_md(github_token, owner, repo)
    with open(os.environ["MODEL_RETIREMENTS_PATH"], encoding="utf-8") as file:
        retirements = json.load(file)
    return {
        "models.md": update_announcements(
            existing_md, diff, current, retirements, target_date
        ),
        "snapshot.json": json.dumps(current, indent=2, ensure_ascii=False),
        "diff.json": json.dumps(diff.to_json(), indent=2, ensure_ascii=False),
    }


def collect_daily(
    github_token: str, owner: str, repo: str, target_date: str, dry_run: bool
) -> int:
    from publish_models_news import commit_artifacts_atomically

    artifacts = daily_artifacts(
        github_token, owner, repo, target_date, fetch_all_snapshots()
    )
    if dry_run:
        print(
            f"Daily feed: {len(FEED_PATTERN.search(artifacts['models.md']).group(1))} bytes; no writes."
        )
        return 0
    # No Discord artifact is produced by collection.
    return (
        0
        if commit_artifacts_atomically(
            github_token, owner, repo, target_date, artifacts
        )
        else 1
    )


def find_previous_report_date(
    github_token: str, owner: str, repo: str, target_date: str
) -> str | None:
    # Daily snapshots must not advance the weekly Discord baseline. Use the
    # last successfully published receipt, including after a failed week.
    response = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{MODELS_DIR}?ref={GISTS_BRANCH}",
        headers=_github_headers(github_token),
    )
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise GithubProbeError(
            f"Could not list model reports: HTTP {response.status_code}"
        )
    dates = sorted(
        entry["name"]
        for entry in response.json()
        if entry.get("type") == "dir"
        and re.fullmatch(r"\d{4}-\d{2}-\d{2}", entry["name"])
        and entry["name"] < target_date
    )
    for date in reversed(dates):
        if _path_exists_on_news(
            github_token, owner, repo, f"{MODELS_DIR}/{date}/discord.json"
        ):
            return date
    return None


def main() -> int:
    target_date = os.environ.get("TARGET_DATE") or datetime.now(timezone.utc).strftime(
        "%Y-%m-%d"
    )
    dry_run = bool(os.environ.get("DRY_RUN"))

    github_token = get_env("GITHUB_TOKEN", required=True)
    repo_full = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
    owner, repo = repo_full.split("/", 1)
    if os.environ.get("DAILY_ONLY"):
        try:
            return collect_daily(github_token, owner, repo, target_date, dry_run)
        except (
            requests.RequestException,
            ValueError,
            RuntimeError,
            OSError,
            KeyError,
        ) as exc:
            print(f"  Daily collection failed: {exc}", file=sys.stderr)
            return 1
    pollinations_token = get_env("POLLINATIONS_TOKEN", required=True)
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
        previous_date = find_previous_report_date(
            github_token, owner, repo, target_date
        )
        if previous_date is None:
            previous_date = find_previous_snapshot_date(
                github_token, owner, repo, target_date
            )
        previous = (
            _migrate_old_snapshot(
                load_snapshot_from_news(github_token, owner, repo, previous_date)
            )
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
        artifacts = daily_artifacts(github_token, owner, repo, target_date, current)
        existing_md = artifacts["models.md"]
    except (RuntimeError, ValueError, OSError, KeyError) as exc:
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
    # success, commits all four atomically. Daily collection also commits its
    # three artifacts independently of Discord availability.
    contents: dict[str, str] = {
        **artifacts,
        "discord.json": json.dumps(discord, indent=2, ensure_ascii=False),
        "models.md": new_md,
    }
    out_dir = models_news_staging_dir(target_date)
    for filename, body in contents.items():
        with open(os.path.join(out_dir, filename), "w", encoding="utf-8") as fh:
            fh.write(body)
    print(
        f"  Staged {len(contents)} artifacts in {out_dir} (commit deferred to publish)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
