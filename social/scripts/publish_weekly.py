#!/usr/bin/env python3
"""
Tier 3: Weekly Publish

Publishes weekly content from the news branch. Two modes via PUBLISH_MODE env var:
  - "buffer": Stage Twitter + LinkedIn + Instagram to Buffer (called by news-generate-summary.yml after generation)
  - "direct": Deploy Reddit to VPS + Discord webhook (called by news-publish-social.yml cron at 18:00 UTC Sunday)
  - "all" (default): Both

See social/PIPELINE.md for full architecture.
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from buffer_publish import (
    publish_instagram_post,
    publish_linkedin_post,
    publish_twitter_post,
    stage_buffer_posts,
)
from common import (
    DISCORD_CHUNK_SIZE,
    deploy_reddit_news_post,
    get_env,
    get_post_image_urls,
    read_news_file,
)

# ── Helpers ──────────────────────────────────────────────────────────


def get_weekly_date() -> str:
    """Get the Sunday publish date from env vars or current UTC date.

    If WEEK_START_DATE is provided, weekly artifacts live under start + 7 days.
    Otherwise use the most recent Sunday UTC.
    """
    override = get_env("WEEKLY_DATE", required=False)
    if override:
        return override
    # Match generate_weekly.py's logic: publish_date = week_start + 7 days
    week_start = get_env("WEEK_START_DATE", required=False)
    if week_start:
        start = datetime.strptime(week_start, "%Y-%m-%d").date()
        return (start + timedelta(days=7)).strftime("%Y-%m-%d")
    today = datetime.now(timezone.utc).date()
    days_since_sunday = (today.weekday() + 1) % 7
    sunday = today - timedelta(days=days_since_sunday)
    return sunday.strftime("%Y-%m-%d")


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


# ── Main ─────────────────────────────────────────────────────────────


def main():
    print("=== Tier 3: Weekly Publish ===")

    github_token = get_env("GITHUB_TOKEN")
    repo_full = get_env("GITHUB_REPOSITORY")
    publish_mode = get_env("PUBLISH_MODE", required=False) or "all"

    owner, repo = repo_full.split("/")
    weekly_date = get_weekly_date()

    print(f"  Weekly publish date: {weekly_date}")
    print(f"  Mode: {publish_mode}")

    weekly_dir = os.path.join("social", "news", "weekly", weekly_date)
    results = {}

    # ── Buffer staging (Twitter + LinkedIn + Instagram) ───────────
    if publish_mode in ("buffer", "all"):
        buffer_token = get_env("BUFFER_ACCESS_TOKEN")
        print("\n[Buffer] Staging to Buffer...")
        buffer_results = stage_buffer_posts(
            weekly_dir,
            {
                "twitter": publish_twitter_post,
                "linkedin": publish_linkedin_post,
                "instagram": publish_instagram_post,
            },
            buffer_token,
            github_token,
            owner,
            repo,
        )
        results.update(buffer_results)
        for platform, success in buffer_results.items():
            status = "OK" if success else "FAILED"
            print(f"  {platform}: {status}")

    # ── Direct channels (Reddit + Discord) ────────────────────────
    if publish_mode in ("direct", "all"):
        print("\n[Direct] Publishing direct channels...")

        reddit_result = deploy_reddit_news_post(
            weekly_dir, github_token, owner, repo
        )
        if reddit_result is not None:
            results["reddit"] = reddit_result

        # Discord
        discord_webhook = get_env("DISCORD_WEEKLY_WEBHOOK_URL", required=False)
        if discord_webhook:
            discord_path = os.path.join(weekly_dir, "discord.json")
            discord_data = read_news_file(discord_path, github_token, owner, repo)

            discord_text = ""
            if discord_data:
                discord_text = (discord_data.get("text") or "").strip()

            if discord_data and discord_text:
                print("  Discord...")
                image_urls = get_post_image_urls(discord_data)
                discord_image = image_urls[0] if image_urls else None
                results["discord"] = post_to_discord(
                    discord_webhook, discord_text, discord_image
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
