#!/usr/bin/env python3
"""Post the weekly model-changes report to Discord.

Reads social/news/models/{date}/discord.json (local overlay first, news branch
fallback) and POSTs the text to DISCORD_MODELS_WEBHOOK_URL. If the file does
not exist (no changes that week), exits 0 silently.

Required env vars:
- DISCORD_MODELS_WEBHOOK_URL: Discord webhook for the model-news channel
- GITHUB_TOKEN: needed only to read from the news branch when local overlay missing

Optional:
- TARGET_DATE: YYYY-MM-DD (default: today UTC)
- GITHUB_REPOSITORY: owner/repo (default: pollinations/pollinations)
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import requests

from common import OWNER, REPO, get_env, read_news_file

MODELS_DIR = "social/news/models"
DISCORD_CHAR_LIMIT = 2000


def post_to_discord(webhook_url: str, content: str) -> bool:
    """POST to Discord webhook. Truncates if the AI exceeded the 2000-char cap."""
    if len(content) > DISCORD_CHAR_LIMIT:
        content = content[: DISCORD_CHAR_LIMIT - 1] + "…"
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


def main() -> int:
    target_date = os.environ.get("TARGET_DATE") or datetime.now(timezone.utc).strftime(
        "%Y-%m-%d"
    )
    webhook_url = get_env("DISCORD_MODELS_WEBHOOK_URL", required=True)
    github_token = get_env("GITHUB_TOKEN", required=True)
    repo_full = os.environ.get("GITHUB_REPOSITORY", f"{OWNER}/{REPO}")
    owner, repo = repo_full.split("/", 1)

    file_path = f"{MODELS_DIR}/{target_date}/discord.json"
    print(f"Looking for {file_path} (local overlay or news branch)...")
    discord = read_news_file(file_path, github_token, owner, repo)
    if not discord:
        print("  No discord.json for this date — silent skip.")
        return 0

    text = (discord.get("text") or "").strip()
    if not text:
        print("  discord.json has empty text — silent skip.")
        return 0

    return 0 if post_to_discord(webhook_url, text) else 1


if __name__ == "__main__":
    sys.exit(main())
