#!/usr/bin/env python3
"""Save a merged PR's Discord post for the deploy-time sender (#17406).

    python pr_post.py write

Reads the gist like discord_pr.py, builds the message and verifies the picture,
and writes operations/social/news/pr-posts/PR-{N}.json on the news branch.
Nothing is posted here: deploy_posts.py sends the saved posts once the PR's
production deploy has passed. A none-tier gist saves nothing.

Regenerating (a gist rerun or a manual dispatch) keeps the file's delivery
state; a record that is sent or claimed by the sender is never rewritten.
"""

import sys
from datetime import UTC, datetime

import requests

from common import (
    GISTS_BRANCH,
    GITHUB_API_BASE,
    NEWS_REL_DIR,
    _github_headers,
    get_env,
    read_news_file,
    update_news_file,
)
from discord_pr import build_message, fetch_gist, fetch_pr_merged_at

DELIVERY_FIELDS = ("delivery", "sent_at", "deployed_at", "deploy_sha")


def post_path(pr_number) -> str:
    return f"{NEWS_REL_DIR}/pr-posts/PR-{pr_number}.json"


def suppress_pending(pr_number, github_token: str, owner: str, repo: str) -> None:
    """A regeneration flipped the PR to none-tier: remove a saved post that
    was never sent, so the deploy sender doesn't ship it anyway. An
    unresolved attempt or a sent record is left for a person."""
    path = post_path(pr_number)
    current, sha = read_news_file(path, github_token, owner, repo)
    if not current:
        return
    state = (current.get("delivery") or {}).get("state")
    if state in ("attempt", "done"):
        print(f"  WARNING: PR #{pr_number} is now none-tier but its record is "
              f"{state}: left for a person to settle")
        return
    resp = requests.delete(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}",
        headers=_github_headers(github_token),
        json={
            "message": f"news: drop PR #{pr_number} post (none-tier)",
            "sha": sha,
            "branch": GISTS_BRANCH,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  FATAL: could not drop the saved post (HTTP {resp.status_code})")
        sys.exit(1)
    print(f"  Dropped the unsent saved post for PR #{pr_number}")


def write() -> None:
    print("=== Save the PR's Discord post ===")

    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    pr_number = get_env("PR_NUMBER")
    repo_full_name = get_env("REPO_FULL_NAME")
    owner, repo = repo_full_name.split("/")

    merged_at = fetch_pr_merged_at(repo_full_name, pr_number, github_token)
    if not merged_at:
        print("  FATAL: Could not determine merged_at")
        sys.exit(1)

    gist = fetch_gist(int(pr_number), merged_at, github_token, owner, repo)
    if not gist:
        print("  FATAL: Gist not found")
        sys.exit(1)

    tier = gist.get("gist", {}).get("publish_tier")
    if tier == "none":
        print(f"  PR #{pr_number} is none-tier: no post is saved")
        suppress_pending(pr_number, github_token, owner, repo)
        return

    print(f"  Building the message for PR #{pr_number} ({tier})...")
    message, image_url, _ = build_message(gist, pr_number, merged_at, pollinations_token)

    fresh = {
        "pr_number": int(pr_number),
        "message": message,
        "image_url": image_url,
        "merged_at": merged_at,
        "merge_commit_sha": gist.get("merge_commit_sha"),
        "publish_tier": tier,
        "generated_at": datetime.now(UTC).isoformat(),
    }

    def build(current):
        state = ((current or {}).get("delivery") or {}).get("state")
        if state in ("done", "attempt"):
            # Sent, or claimed by the sender right now: the whole record is
            # frozen, so the permanent record can never drift from the text
            # Discord got (or is about to get).
            print(f"  PR #{pr_number} is {state}: the record is never rewritten")
            return None
        kept = {key: current[key] for key in DELIVERY_FIELDS if current and key in current}
        return {**fresh, **kept}

    outcome, _ = update_news_file(
        post_path(pr_number),
        build,
        github_token,
        f"news: save PR #{pr_number} Discord post",
        owner=owner,
        repo=repo,
    )
    if outcome == "gave up":
        print("  FATAL: could not save the post (conflicts)")
        sys.exit(1)
    print(f"  Saved {post_path(pr_number)}" if outcome == "landed" else "  Nothing to save")
    print("\n=== Done ===")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] != "write":
        sys.exit(__doc__)
    write()


if __name__ == "__main__":
    main()
