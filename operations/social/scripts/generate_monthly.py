#!/usr/bin/env python3
"""Generate one canonical monthly build-diary summary and cover image.

The monthly archive is website-only. It reads canonical daily summaries and
writes exactly two artifacts to the news branch; it does not create or publish
social posts.
"""

import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from common import (
    GISTS_BRANCH,
    IMAGE_SIZE,
    MONTHLY_REL_DIR,
    build_monthly_summary_artifact,
    call_pollinations_api,
    commit_files_to_branch,
    commit_image_to_branch,
    generate_image,
    generate_platform_post,
    get_env,
    load_prompt,
    monthly_digest_input,
    parse_json_response,
    read_daily_summaries,
)


def get_target_month(override: Optional[str] = None) -> str:
    """Return YYYY-MM, defaulting to the last completed UTC month."""
    if override:
        datetime.strptime(override, "%Y-%m")
        return override
    today = datetime.now(timezone.utc).date()
    previous_month_end = today.replace(day=1) - timedelta(days=1)
    return previous_month_end.strftime("%Y-%m")


def generate_digest(
    daily_summaries: List[Dict], month: str, token: str
) -> Optional[Dict]:
    """Synthesize canonical daily summaries into one monthly digest."""
    system_prompt = load_prompt("monthly")
    user_prompt = monthly_digest_input(daily_summaries, month)
    response = call_pollinations_api(
        system_prompt, user_prompt, token, temperature=0.3
    )
    return parse_json_response(response) if response else None


def monthly_image_context() -> str:
    prompt = load_prompt("monthly")
    marker = "## Monthly Image Identity"
    index = prompt.find(marker)
    return f"\n\n{prompt[index:]}" if index != -1 else ""


def generate_monthly_artifacts(
    month: str, daily_summaries: List[Dict], token: str
) -> tuple[Dict, bytes]:
    """Generate the canonical summary and one cover image for a month."""
    digest = generate_digest(daily_summaries, month, token)
    if not digest:
        raise RuntimeError(f"monthly summary generation failed for {month}")

    cover_plan = generate_platform_post(
        "twitter",
        digest,
        token,
        "Create the visual concept for this monthly website build-diary cover. The post text is not published; focus on image_prompt.",
        temperature=0.7,
        extra_context=monthly_image_context(),
    )
    image_prompt = str((cover_plan or {}).get("image_prompt") or "").strip()
    if not image_prompt:
        raise RuntimeError(f"monthly image prompt generation failed for {month}")

    image_bytes, _ = generate_image(image_prompt, token, IMAGE_SIZE, IMAGE_SIZE)
    if not image_bytes:
        raise RuntimeError(f"monthly cover generation failed for {month}")

    generated_at = datetime.now(timezone.utc).isoformat()
    summary = build_monthly_summary_artifact(
        digest, daily_summaries, month, generated_at
    )
    return summary, image_bytes


def main() -> None:
    print("=== Monthly Build Diary Generator ===")
    github_token = get_env("GITHUB_TOKEN")
    pollinations_token = get_env("POLLINATIONS_TOKEN")
    owner, repo = get_env("GITHUB_REPOSITORY").split("/")
    month = get_target_month(get_env("TARGET_MONTH", required=False))
    print(f"  Month: {month}")

    daily_summaries = read_daily_summaries(month)
    if not daily_summaries:
        print(f"  No daily summaries found for {month}. Skipping.")
        return
    print(f"  Found {len(daily_summaries)} active days")

    summary, image_bytes = generate_monthly_artifacts(
        month, daily_summaries, pollinations_token
    )
    base_path = f"{MONTHLY_REL_DIR}/{month}"
    image_url = commit_image_to_branch(
        image_bytes,
        f"{base_path}/images/cover.jpg",
        GISTS_BRANCH,
        github_token,
        owner,
        repo,
    )
    if not image_url:
        print("  FATAL: monthly cover commit failed")
        sys.exit(1)

    commit_files_to_branch(
        [(f"{base_path}/summary.json", summary)],
        GISTS_BRANCH,
        github_token,
        owner,
        repo,
        label=f"for monthly build diary {month}",
    )
    print(f"  Committed monthly build diary for {month} to {GISTS_BRANCH}")


if __name__ == "__main__":
    main()
