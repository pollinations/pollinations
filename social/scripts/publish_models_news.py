#!/usr/bin/env python3
"""Post the weekly model-changes report to Discord, then atomically commit
all generated artifacts to the news branch.

The generator stages discord.json, diff.json, models.md and snapshot.json in
$RUNNER_TEMP/models-news-{date}/. This script:

  1. Reads discord.json from staging.
  2. Posts the text to DISCORD_MODELS_WEBHOOK_URL.
  3. On success, commits all four files to the news branch in ONE tree
     commit via the Git Data API. Either everything appears together or
     nothing does — the website never shows a changelog entry without a
     matching baseline snapshot, and a publish failure can never silently
     advance the baseline and lose a week.

Falls back to reading discord.json from the news branch when no staging dir
is present (e.g. operator-driven re-publish for an already-committed date).
In that mode no commit happens — only the Discord post.

Required env vars:
- DISCORD_MODELS_WEBHOOK_URL: Discord webhook for the model-news channel
- GITHUB_TOKEN: contents:write on the news branch

Optional:
- TARGET_DATE: YYYY-MM-DD (default: today UTC)
- GITHUB_REPOSITORY: owner/repo (default: pollinations/pollinations)
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests

from common import (
    GISTS_BRANCH,
    GITHUB_API_BASE,
    OWNER,
    REPO,
    _github_headers,
    get_env,
    github_api_request,
    models_news_staged_files,
    models_news_staging_dir,
    read_news_file,
)

# Hard limit matches the prompt instruction (1900) and leaves headroom under
# Discord's 2000-char ceiling for the role-mention substitution and any
# zero-width formatting Discord adds.
DISCORD_CHAR_LIMIT = 1900


def _safe_truncate(text: str, limit: int) -> str:
    """Truncate to <= limit characters without cutting mid-token.

    - Walks back to the last whitespace before the cut so we don't split a
      word, URL, or `<@&123>` role mention.
    - Drops a trailing partial code span (odd count of backticks) by
      rewinding to before the last backtick.
    - Drops any trailing partial `<...>` (e.g. `<@&12`) so Discord doesn't
      render broken markup.
    - Appends "…" as a visible truncation marker.
    """
    if len(text) <= limit:
        return text
    cut = limit - 1  # leave room for the ellipsis
    head = text[:cut]
    # Prefer a newline boundary, then any whitespace. Always walk back to it
    # if one exists — a token that spans the cut (URL, role mention, code
    # span) is far more visible damage than dropping a line of bullet text.
    boundary = max(head.rfind("\n"), head.rfind(" "))
    if boundary > 0:
        head = head[:boundary]
    head = head.rstrip()
    # Strip a dangling unmatched '<' (broken mention or HTML-ish tag).
    last_lt = head.rfind("<")
    last_gt = head.rfind(">")
    if last_lt > last_gt:
        head = head[:last_lt].rstrip()
    # Close or drop a dangling unmatched code span.
    if head.count("`") % 2 == 1:
        last_backtick = head.rfind("`")
        head = head[:last_backtick].rstrip()
    return head + "…"


def post_to_discord(webhook_url: str, content: str) -> bool:
    """POST to Discord webhook. Truncates safely if the AI overran the prompt's
    1900-char cap so we never split a role mention or code span."""
    content = _safe_truncate(content, DISCORD_CHAR_LIMIT)
    resp = requests.post(
        webhook_url,
        json={"content": content, "allowed_mentions": {"parse": ["roles"]}},
        timeout=30,
    )
    if 200 <= resp.status_code < 300:
        print("  Discord post sent.")
        return True
    print(
        f"  Discord post failed: {resp.status_code} {resp.text[:200]}", file=sys.stderr
    )
    return False


class PartialStagingError(RuntimeError):
    """Raised when some — but not all — staged artifacts are present. Treating
    this as 'no staging' would silently fall through to a republish path
    using stale data on the news branch."""


def _load_staged_artifacts(date_str: str) -> dict[str, str] | None:
    """Read the four artifacts from the workspace staging dir.

    Returns the full dict when every file is present, None when none are
    present (genuine "no staging — operator republish path"), and raises
    PartialStagingError on a mixed state (a file failed to write or got
    cleaned up between generator and publisher)."""
    out_dir = models_news_staging_dir(date_str)
    out: dict[str, str] = {}
    missing: list[str] = []
    for filename, _ in models_news_staged_files(date_str):
        path = os.path.join(out_dir, filename)
        if not os.path.exists(path):
            missing.append(filename)
            continue
        with open(path, encoding="utf-8") as fh:
            out[filename] = fh.read()
    if not out:
        return None
    if missing:
        raise PartialStagingError(
            f"staging dir {out_dir} is missing {missing} but contains "
            f"{list(out)} — refusing to publish a partial update."
        )
    return out


def _ensure_branch(github_token: str, owner: str, repo: str) -> str:
    """Return the head commit SHA of the news branch. If the branch doesn't
    exist yet, create it from main and return that SHA."""
    headers = _github_headers(github_token)
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/{GISTS_BRANCH}",
        headers=headers,
    )
    if resp.status_code == 200:
        return resp.json()["object"]["sha"]
    if resp.status_code != 404:
        raise RuntimeError(
            f"unable to read {GISTS_BRANCH} ref: {resp.status_code} {resp.text[:200]}"
        )
    main_resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/main",
        headers=headers,
    )
    if main_resp.status_code != 200:
        raise RuntimeError(
            f"unable to read main ref: {main_resp.status_code} {main_resp.text[:200]}"
        )
    main_sha = main_resp.json()["object"]["sha"]
    create_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={"ref": f"refs/heads/{GISTS_BRANCH}", "sha": main_sha},
    )
    if create_resp.status_code not in (200, 201):
        raise RuntimeError(
            f"failed to create {GISTS_BRANCH}: "
            f"{create_resp.status_code} {create_resp.text[:200]}"
        )
    return main_sha


_REF_RETRY_ATTEMPTS = 3
_REF_RETRY_BASE_SLEEP = 1.0


def _create_blobs(
    github_token: str,
    owner: str,
    repo: str,
    date_str: str,
    artifacts: dict[str, str],
) -> list[dict[str, Any]] | None:
    """Create one git blob per artifact and return tree-item dicts. Blobs are
    content-addressed so they're created once and reused across ref-update
    retries (no need to redo this work on a non-fast-forward conflict)."""
    headers = _github_headers(github_token)
    items: list[dict[str, Any]] = []
    for filename, news_path in models_news_staged_files(date_str):
        content = artifacts[filename]
        blob_resp = github_api_request(
            "POST",
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/blobs",
            headers=headers,
            json={
                "content": base64.b64encode(content.encode("utf-8")).decode(),
                "encoding": "base64",
            },
        )
        if blob_resp.status_code not in (200, 201):
            print(
                f"  Failed to create blob for {news_path}: "
                f"{blob_resp.status_code} {blob_resp.text[:200]}",
                file=sys.stderr,
            )
            return None
        items.append(
            {
                "path": news_path,
                "mode": "100644",
                "type": "blob",
                "sha": blob_resp.json()["sha"],
            }
        )
    return items


def _attempt_tree_commit(
    github_token: str,
    owner: str,
    repo: str,
    date_str: str,
    tree_items: list[dict[str, Any]],
) -> tuple[bool, bool]:
    """Single attempt: read parent → create tree → create commit → advance ref.

    Returns (success, retryable_conflict). retryable_conflict is True iff the
    ref update failed because the branch advanced under us — caller should
    rebuild on top of the new parent and try again."""
    headers = _github_headers(github_token)
    try:
        parent_sha = _ensure_branch(github_token, owner, repo)
    except RuntimeError as exc:
        print(f"  {exc}", file=sys.stderr)
        return False, False

    parent_commit = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/commits/{parent_sha}",
        headers=headers,
    )
    if parent_commit.status_code != 200:
        print(
            f"  Failed to read parent commit {parent_sha}: "
            f"{parent_commit.status_code} {parent_commit.text[:200]}",
            file=sys.stderr,
        )
        return False, False
    base_tree = parent_commit.json()["tree"]["sha"]

    tree_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees",
        headers=headers,
        json={"base_tree": base_tree, "tree": tree_items},
    )
    if tree_resp.status_code not in (200, 201):
        print(
            f"  Failed to create tree: {tree_resp.status_code} {tree_resp.text[:200]}",
            file=sys.stderr,
        )
        return False, False
    new_tree = tree_resp.json()["sha"]

    commit_resp = github_api_request(
        "POST",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/commits",
        headers=headers,
        json={
            "message": f"chore(news): models report {date_str}",
            "tree": new_tree,
            "parents": [parent_sha],
        },
    )
    if commit_resp.status_code not in (200, 201):
        print(
            f"  Failed to create commit: "
            f"{commit_resp.status_code} {commit_resp.text[:200]}",
            file=sys.stderr,
        )
        return False, False
    new_commit = commit_resp.json()["sha"]

    ref_resp = github_api_request(
        "PATCH",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs/heads/{GISTS_BRANCH}",
        headers=headers,
        json={"sha": new_commit, "force": False},
    )
    if ref_resp.status_code in (200, 201):
        print(
            f"  Committed {len(tree_items)} files in {new_commit[:7]} on {GISTS_BRANCH}"
        )
        return True, False

    # Non-fast-forward / stale-parent conflicts: GitHub returns 422 ("Update
    # is not a fast forward") and occasionally 409. Treat both as retryable.
    retryable = ref_resp.status_code in (409, 422)
    print(
        f"  Failed to advance {GISTS_BRANCH} to {new_commit}: "
        f"{ref_resp.status_code} {ref_resp.text[:200]}"
        + (" (retryable)" if retryable else ""),
        file=sys.stderr,
    )
    return False, retryable


def commit_artifacts_atomically(
    github_token: str,
    owner: str,
    repo: str,
    date_str: str,
    artifacts: dict[str, str],
) -> bool:
    """Commit all four artifacts to the news branch in a single tree commit.

    All-or-nothing: GitHub either advances the ref to a commit containing
    every file, or fails before the ref moves. Other writers (daily/weekly
    social scripts) also push to news, so a non-fast-forward race is
    expected from time to time — retry on that specific failure with a
    fresh parent + tree."""
    tree_items = _create_blobs(github_token, owner, repo, date_str, artifacts)
    if tree_items is None:
        return False

    for attempt in range(1, _REF_RETRY_ATTEMPTS + 1):
        ok, retryable = _attempt_tree_commit(
            github_token, owner, repo, date_str, tree_items
        )
        if ok:
            return True
        if not retryable or attempt == _REF_RETRY_ATTEMPTS:
            return False
        sleep_for = _REF_RETRY_BASE_SLEEP * attempt
        print(
            f"  Retrying tree commit in {sleep_for:.1f}s "
            f"(attempt {attempt + 1}/{_REF_RETRY_ATTEMPTS})"
        )
        time.sleep(sleep_for)
    return False


def main() -> int:
    target_date = os.environ.get("TARGET_DATE") or datetime.now(timezone.utc).strftime(
        "%Y-%m-%d"
    )
    webhook_url = get_env("DISCORD_MODELS_WEBHOOK_URL", required=True)
    github_token = get_env("GITHUB_TOKEN", required=True)
    repo_full = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
    owner, repo = repo_full.split("/", 1)
    republish = bool(os.environ.get("REPUBLISH"))

    try:
        artifacts = _load_staged_artifacts(target_date)
    except PartialStagingError as exc:
        print(f"  {exc}", file=sys.stderr)
        return 1

    if artifacts is not None:
        print(f"  Loaded {len(artifacts)} staged artifacts for {target_date}.")
        discord = json.loads(artifacts["discord.json"])
    elif republish:
        # Operator-driven republish path: no staging dir on this runner, and
        # REPUBLISH=1 was set explicitly. Read discord.json from the news
        # branch and post only — no commit.
        file_path = f"social/news/models/{target_date}/discord.json"
        print(f"REPUBLISH=1; loading {file_path} from {GISTS_BRANCH} branch.")
        discord = read_news_file(file_path, github_token, owner, repo)
        if not discord:
            print("  No discord.json for this date — nothing to republish.")
            return 0
    else:
        # No staging and REPUBLISH not set — most likely the generator
        # exited with empty diff (silent skip). Don't fall through to news
        # branch silently; that path can post stale Discord content.
        print(
            "  No staged artifacts for "
            f"{target_date} and REPUBLISH not set — nothing to publish."
        )
        return 0

    text = (discord.get("text") or "").strip()
    if not text:
        print("  discord.json has empty text — silent skip.")
        return 0

    if not post_to_discord(webhook_url, text):
        return 1

    # Discord post succeeded. Now commit everything atomically (only when we
    # actually have staged artifacts — operator republish doesn't re-commit).
    if artifacts is None:
        return 0
    if not commit_artifacts_atomically(
        github_token, owner, repo, target_date, artifacts
    ):
        # Discord already posted; the next run will diff against the still-old
        # baseline and re-announce the same changes. Manual intervention may
        # be needed if that double-post is unwanted.
        print(
            "  WARNING: Discord posted but commit failed — next run will "
            "re-announce these changes. Investigate before next Wednesday.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
