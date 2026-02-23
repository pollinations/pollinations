#!/usr/bin/env python3
"""
Tier 3: Weekly Publish

Publishes weekly content from the news branch. Two modes via PUBLISH_MODE env var:
  - "buffer": Stage Twitter + LinkedIn + Instagram to Buffer (called by NEWS_summary.yml after generation)
  - "direct": Deploy Reddit to VPS + Discord webhook (called by NEWS_publish.yml cron at 18:00 UTC Sunday)
  - "all" (default): Both

See social/PIPELINE.md for full architecture.
"""

import base64
import io
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Dict

import requests
from buffer_publish import (
    publish_instagram_post,
    publish_linkedin_post,
    publish_twitter_post,
)
from common import (
    DISCORD_CHUNK_SIZE,
    deploy_reddit_post,
    get_env,
    read_news_file,
)

# ── Constants ────────────────────────────────────────────────────────

WEEKLY_REL_DIR = "social/news/weekly"


# ── Helpers ──────────────────────────────────────────────────────────


def get_week_end() -> str:
    """Get the week_end date from env var or compute from WEEK_START_DATE.
    Matches generate_weekly.py which uses start + 6 days (Sun→Sat window).
    Falls back to most recent Saturday UTC if neither override is set."""
    override = get_env("WEEK_END_DATE", required=False)
    if override:
        return override
    # Match generate_weekly.py's logic: start + 6 days
    week_start = get_env("WEEK_START_DATE", required=False)
    if week_start:
        start = datetime.strptime(week_start, "%Y-%m-%d").date()
        return (start + timedelta(days=6)).strftime("%Y-%m-%d")
    today = datetime.now(timezone.utc).date()
    days_since_saturday = (today.weekday() - 5) % 7
    saturday = today - timedelta(days=days_since_saturday)
    return saturday.strftime("%Y-%m-%d")


def chunk_message(message: str, max_length: int = DISCORD_CHUNK_SIZE):
    """Split message into chunks at paragraph breaks."""
    if len(message) <= max_length:
        return [message]

    chunks = []
    remaining = message
    while remaining:
        if len(remaining) <= max_length:
            chunks.append(remaining)
            break
        chunk = remaining[:max_length]
        # Split at paragraph break
        split = chunk.rfind("\n\n")
        if split >= max_length * 0.5:
            split_point = split + 2
        else:
            split = chunk.rfind("\n")
            if split >= max_length * 0.5:
                split_point = split + 1
            else:
                split_point = max_length
        chunks.append(remaining[:split_point].rstrip())
        remaining = remaining[split_point:].lstrip()
    return chunks


def post_to_discord(webhook_url: str, message: str, image_url: str = None) -> bool:
    """Post weekly summary to Discord with optional image. Returns True on success."""
    # Download image if available
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

    # Ensure webhook waits for message
    if "?" not in webhook_url:
        webhook_url += "?wait=true"
    else:
        webhook_url += "&wait=true"

    chunks = chunk_message(message)
    for i, chunk in enumerate(chunks):
        # Attach image to the first chunk only
        if i == 0 and image_bytes:
            files = {
                "payload_json": (
                    None,
                    json.dumps({"content": chunk}),
                    "application/json",
                ),
                "files[0]": ("image.jpg", image_bytes, "image/jpeg"),
            }
            resp = requests.post(webhook_url, files=files, timeout=30)
        else:
            resp = requests.post(webhook_url, json={"content": chunk}, timeout=30)

        if resp.status_code in [200, 201, 204]:
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
            print(
                f"  Discord error on chunk {i + 1}: {resp.status_code} {resp.text[:200]}"
            )
            return False

        if i < len(chunks) - 1:
            time.sleep(1)

    print(
        f"  Discord: posted {len(chunks)} chunk(s)"
        + (" with image" if image_bytes else "")
    )
    return True


def stage_buffer_posts(
    weekly_dir: str, buffer_token: str, github_token: str, owner: str, repo: str
) -> Dict[str, bool]:
    """Stage Twitter + LinkedIn + Instagram to Buffer. Returns {platform: success}."""
    results = {}

    for platform, filename, publish_fn in [
        ("twitter", "twitter.json", publish_twitter_post),
        ("linkedin", "linkedin.json", publish_linkedin_post),
        ("instagram", "instagram.json", publish_instagram_post),
    ]:
        post_path = os.path.join(weekly_dir, filename)
        post_data = read_news_file(post_path, github_token, owner, repo)

        if not post_data:
            print(f"  No {filename} found — skipping {platform}")
            continue

        print(f"\n  Staging {platform}...")
        try:
            results[platform] = publish_fn(post_data, buffer_token)
        except Exception as e:
            print(f"  Error staging {platform}: {e}")
            results[platform] = False

    return results


# ── Main ─────────────────────────────────────────────────────────────


def main():
    print("=== Tier 3: Weekly Publish ===")

    github_token = get_env("GITHUB_TOKEN")
    repo_full = get_env("GITHUB_REPOSITORY")
    publish_mode = get_env("PUBLISH_MODE", required=False) or "all"

    owner, repo = repo_full.split("/")
    week_end = get_week_end()

    print(f"  Week ending: {week_end}")
    print(f"  Mode: {publish_mode}")

    weekly_dir = os.path.join("social", "news", "weekly", week_end)
    results = {}

    # ── Buffer staging (Twitter + LinkedIn + Instagram) ───────────
    if publish_mode in ("buffer", "all"):
        buffer_token = get_env("BUFFER_ACCESS_TOKEN")
        print("\n[Buffer] Staging to Buffer...")
        buffer_results = stage_buffer_posts(
            weekly_dir, buffer_token, github_token, owner, repo
        )
        results.update(buffer_results)
        for platform, success in buffer_results.items():
            status = "OK" if success else "FAILED"
            print(f"  {platform}: {status}")

    # ── Direct channels (Reddit + Discord) ────────────────────────
    if publish_mode in ("direct", "all"):
        print("\n[Direct] Publishing direct channels...")

        # Reddit (VPS/Devvit deployment)
        vps_host = get_env("REDDIT_VPS_HOST", required=False)
        vps_user = get_env("REDDIT_VPS_USER", required=False)
        vps_ssh_key_raw = get_env("REDDIT_VPS_SSH_KEY", required=False)
        vps_ssh_key = vps_ssh_key_raw.strip() if vps_ssh_key_raw else None

        if vps_host and vps_user and vps_ssh_key:
            import paramiko

            private_key_str = base64.b64decode(vps_ssh_key).decode("utf-8")
            key_file = io.StringIO(private_key_str)
            pkey = paramiko.Ed25519Key.from_private_key(key_file)

            reddit_path = os.path.join(weekly_dir, "reddit.json")
            reddit_data = read_news_file(reddit_path, github_token, owner, repo)

            if reddit_data:
                print("  Reddit...")
                results["reddit"] = deploy_reddit_post(
                    reddit_data, vps_host, vps_user, pkey
                )
            else:
                print("  No reddit.json — skipping")
        else:
            print("  Reddit VPS credentials not configured — skipping")

        # Discord
        discord_webhook = get_env("DISCORD_WEEKLY_WEBHOOK_URL", required=False)
        if discord_webhook:
            discord_path = os.path.join(weekly_dir, "discord.json")
            discord_data = read_news_file(discord_path, github_token, owner, repo)

            if discord_data and discord_data.get("message"):
                print("  Discord...")
                discord_image = discord_data.get("image", {}).get("url")
                results["discord"] = post_to_discord(
                    discord_webhook, discord_data["message"], discord_image
                )
            else:
                print("  No discord.json — skipping")
        else:
            print("  Discord webhook not configured — skipping")

    # Summary
    failed = [p for p, s in results.items() if not s]
    if failed:
        print(f"\n=== Done with failures: {', '.join(failed)} ===")
        sys.exit(1)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
