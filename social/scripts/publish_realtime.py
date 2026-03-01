#!/usr/bin/env python3
"""
Discord Real-Time Post — Per-PR Announcement

Reads the gist JSON committed by generate_realtime.py and posts
a Discord announcement using shared format + platform voice.

See social/PIPELINE.md for full architecture.
"""

import base64
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

import requests
from common import (
    DISCORD_CHAR_LIMIT,
    GISTS_BRANCH,
    GITHUB_API_BASE,
    call_pollinations_api,
    get_env,
    get_repo_root,
    gist_path_for_pr,
    github_api_request,
    load_format,
    load_prompt,
)

# ── Helpers ──────────────────────────────────────────────────────────


def fetch_gist(
    pr_number: int, merged_at: str, github_token: str, owner: str, repo: str
) -> Optional[Dict]:
    """Read gist JSON from local checkout or GitHub API."""
    # Try local first
    repo_root = get_repo_root()
    file_path = gist_path_for_pr(pr_number, merged_at)
    local_path = Path(repo_root) / file_path

    if local_path.exists():
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"  Warning: could not read local gist: {e}")

    # Fall back to GitHub API (read from news branch)
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{file_path}?ref={GISTS_BRANCH}",
        headers=headers,
    )
    if resp.status_code == 200:
        content = base64.b64decode(resp.json()["content"]).decode()
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

    return None


def fetch_pr_merged_at(repo_full: str, pr_number: str, github_token: str) -> str:
    """Fetch merged_at timestamp for a PR from GitHub API."""
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
    }
    resp = github_api_request(
        "GET",
        f"{GITHUB_API_BASE}/repos/{repo_full}/pulls/{pr_number}",
        headers=headers,
    )
    if resp.status_code == 200:
        return resp.json().get("merged_at", "")
    return ""


# ── Main ─────────────────────────────────────────────────────────────


def main():
    print("=== Discord Real-Time Post ===")

    # Environment
    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    discord_webhook = get_env("DISCORD_REALTIME_WEBHOOK_URL")
    pr_number = get_env("PR_NUMBER")
    repo_full_name = get_env("REPO_FULL_NAME")

    owner, repo = repo_full_name.split("/")

    # ── Fetch gist ────────────────────────────────────────────────────
    print(f"\n[1/2] Reading gist for PR #{pr_number}...")

    merged_at = fetch_pr_merged_at(repo_full_name, pr_number, github_token)
    if not merged_at:
        print("  Could not determine merged_at — skipping")
        return

    gist = fetch_gist(int(pr_number), merged_at, github_token, owner, repo)
    if not gist:
        print("  Gist not found — skipping Discord post")
        return

    print(f"  Gist loaded: {gist['title']}")

    # ── Generate Discord message ──────────────────────────────────────
    print("\n[2/2] Generating Discord message...")

    ai = gist.get("gist", {})
    summary = ai.get("summary", gist["title"])
    impact = ai.get("impact", "")
    keywords = ", ".join(ai.get("keywords", []))

    # Voice = platform tone (system prompt), Task = format with data (user prompt)
    voice = load_prompt("tone/discord")
    task = (
        load_format("realtime")
        .replace("{summary}", summary)
        .replace("{impact}", impact)
        .replace("{keywords}", keywords)
    )

    snippet = call_pollinations_api(
        voice, task, pollinations_token, temperature=0.7, exit_on_failure=False
    )

    if not snippet:
        snippet = summary
    lines = snippet.split('\n', 1)
    if lines:
        lines[0] = f"### {lines[0]}"
        snippet = '\n\n'.join(lines)
    pr_url = gist["url"]
    author = gist["author"]

    timestamp_str = ""
    if merged_at:
        try:
            if merged_at.endswith("Z"):
                dt = datetime.fromisoformat(merged_at.replace("Z", "+00:00"))
            else:
                dt = datetime.fromisoformat(merged_at)
            unix_ts = int(dt.timestamp())
            timestamp_str = f" <t:{unix_ts}:F>"
        except Exception:
            pass

    pr_link = f"[PR #{pr_number}](<{pr_url}>)"
    author_link = f"[{author}](<https://github.com/{author}>)"
    footer = f"\n\n{pr_link} | By {author_link}{timestamp_str}"

    message = snippet + footer

    if len(message) > DISCORD_CHAR_LIMIT:
        available = DISCORD_CHAR_LIMIT - len(footer) - 3
        message = snippet[:available] + "..." + footer

    # Download image for embed if available
    image_url = gist.get("image", {}).get("url")
    image_bytes = None
    if image_url:
        try:
            resp = requests.get(image_url, timeout=30)
            if resp.status_code == 200 and "image" in resp.headers.get(
                "content-type", ""
            ):
                image_bytes = resp.content
        except Exception as e:
            print(f"  Could not download image for Discord: {e}")

    # Post to Discord
    if "?" not in discord_webhook:
        discord_webhook += "?wait=true"
    else:
        discord_webhook += "&wait=true"

    try:
        if image_bytes:
            files = {
                "payload_json": (
                    None,
                    json.dumps({"content": message}),
                    "application/json",
                ),
                "files[0]": ("image.jpg", image_bytes, "image/jpeg"),
            }
            resp = requests.post(discord_webhook, files=files, timeout=30)
        else:
            resp = requests.post(discord_webhook, json={"content": message}, timeout=30)

        if resp.status_code in [200, 201, 204]:
            print("  Discord post sent")
            try:
                data = resp.json()
                channel_id, msg_id = data.get("channel_id"), data.get("id")
                import os

                token = os.environ.get("DISCORD_TOKEN")
                if token and channel_id and msg_id:
                    requests.post(
                        f"https://discord.com/api/v10/channels/{channel_id}/messages/{msg_id}/crosspost",
                        headers={
                            "Authorization": f"Bot {token}",
                            "Content-Type": "application/json",
                        },
                        timeout=10,
                    )
            except Exception:
                pass
        else:
            print(f"  Discord webhook error: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  Discord post failed: {e}")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
