#!/usr/bin/env python3
"""Backfill website build-diary artifacts from historical merged pull requests.

This adapter intentionally reuses the production daily summary and Twitter image
pipeline. It writes only the two artifacts consumed by the website:

  operations/social/news/daily/YYYY-MM-DD/summary.json
  operations/social/news/daily/YYYY-MM-DD/images/twitter.jpg

It never creates platform posts, highlights, GitHub commits, or Buffer drafts.
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List

from common import (
    GITHUB_API_BASE,
    IMAGE_SIZE,
    OWNER,
    REPO,
    generate_image,
    github_api_request,
)
from generate_daily import (
    DAILY_REL_DIR,
    build_daily_summary_artifact,
    generate_summary,
    generate_twitter_post,
)

FIRST_HISTORY_DAY = date(2025, 1, 1)
DEFAULT_HISTORY_FILE = (
    Path(__file__).resolve().parents[3]
    / "pollinations.ai/public/data/community-pr-history.json"
)
GISTS_REL_DIR = Path("operations/social/news/gists")


def parse_iso_day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"expected YYYY-MM-DD, received {value!r}"
        ) from error


def parse_args() -> argparse.Namespace:
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--start-date",
        type=parse_iso_day,
        default=FIRST_HISTORY_DAY,
        help=f"first merged-PR day to inspect (default: {FIRST_HISTORY_DAY})",
    )
    parser.add_argument(
        "--end-date",
        type=parse_iso_day,
        default=yesterday,
        help=f"last merged-PR day to inspect (default: {yesterday})",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        required=True,
        help="checkout containing the news branch artifact tree",
    )
    parser.add_argument(
        "--history-file",
        type=Path,
        default=DEFAULT_HISTORY_FILE,
        help="canonical website PR-history snapshot",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report missing artifacts without calling Pollinations or writing files",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="process at most this many incomplete active days",
    )
    return parser.parse_args()


def github_headers(token: str | None) -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def load_archived_pull_requests(
    history_file: Path, start_date: date, end_date: date
) -> tuple[List[Dict], date]:
    payload = json.loads(history_file.read_text(encoding="utf-8"))
    pull_requests = payload.get("pullRequests") or []
    if not pull_requests:
        raise RuntimeError(f"PR history is empty: {history_file}")
    latest_archived = date.fromisoformat(pull_requests[-1]["mergedAt"][:10])
    selected = [
        pull_request
        for pull_request in pull_requests
        if start_date
        <= date.fromisoformat(pull_request["mergedAt"][:10])
        <= end_date
    ]
    return selected, latest_archived


def fetch_recent_pull_requests(
    github_token: str | None, since: date, end_date: date
) -> List[Dict]:
    """Refresh the static history through the public merged-PR search endpoint."""
    selected = []
    page = 1
    total = 1
    while len(selected) < total:
        response = github_api_request(
            "GET",
            f"{GITHUB_API_BASE}/search/issues",
            headers=github_headers(github_token),
            params={
                "q": (
                    f"repo:{OWNER}/{REPO} is:pr is:merged "
                    f"merged:{since}..{end_date}"
                ),
                "sort": "updated",
                "order": "asc",
                "per_page": 100,
                "page": page,
            },
        )
        response.raise_for_status()
        payload = response.json()
        total = min(payload["total_count"], 1_000)
        if payload["total_count"] > 1_000:
            raise RuntimeError(
                "PR history snapshot is more than 1,000 results behind; regenerate it"
            )
        for item in payload["items"]:
            merged_at = item.get("closed_at")
            if not merged_at:
                continue
            merged_day = date.fromisoformat(merged_at[:10])
            if since <= merged_day <= end_date:
                selected.append(
                    {
                        "number": item["number"],
                        "mergedAt": merged_at,
                        "title": item["title"],
                        "url": item["html_url"],
                        "author": (item.get("user") or {}).get("login")
                        or "community contributor",
                        "labels": [label["name"] for label in item.get("labels", [])],
                    }
                )
        page += 1
    return selected


def load_pull_requests(
    history_file: Path,
    github_token: str | None,
    start_date: date,
    end_date: date,
) -> List[Dict]:
    archived, latest_archived = load_archived_pull_requests(
        history_file, start_date, end_date
    )
    recent = (
        fetch_recent_pull_requests(github_token, latest_archived, end_date)
        if latest_archived <= end_date
        else []
    )
    unique = {pull_request["number"]: pull_request for pull_request in archived}
    unique.update({pull_request["number"]: pull_request for pull_request in recent})
    return sorted(unique.values(), key=lambda pull_request: pull_request["mergedAt"])


def category_from_labels(labels: Iterable[str], title: str) -> str:
    normalized = {label.casefold() for label in labels}
    prefix = title.casefold().split(":", 1)[0]
    if normalized & {"bug", "bug fix", "bug_fix", "fix"} or prefix == "fix":
        return "bug_fix"
    if normalized & {"feature", "enhancement"} or prefix == "feat":
        return "feature"
    if normalized & {"documentation", "docs"} or prefix == "docs":
        return "docs"
    if normalized & {"community", "app-submission", "community-model"}:
        return "community"
    if normalized & {"ci", "chore", "dependencies", "deps", "infrastructure"}:
        return "infrastructure"
    return "improvement"


def compact_body(body: str, limit: int = 1_200) -> str:
    """Keep useful PR context without sending templates or an unbounded prompt."""
    lines = []
    in_comment = False
    for raw_line in (body or "").splitlines():
        line = raw_line.strip()
        if "<!--" in line:
            in_comment = True
        if not in_comment and line and not line.startswith(("#", "- [")):
            lines.append(line)
        if "-->" in line:
            in_comment = False
        if len(" ".join(lines)) >= limit:
            break
    return " ".join(lines)[:limit].strip()


def to_summary_input(pull_request: Dict) -> Dict:
    """Adapt raw PR metadata to the existing daily summarizer's gist input."""
    labels = pull_request.get("labels") or []
    author = pull_request.get("author") or "community contributor"
    title = pull_request["title"].strip()
    category = category_from_labels(labels, title)
    return {
        "pr_number": pull_request["number"],
        "title": title,
        "author": author,
        "url": pull_request["url"],
        "merged_at": pull_request["mergedAt"],
        "gist": {
            "category": category,
            "importance": "major"
            if {label.casefold() for label in labels}
            & {"breaking", "major", "priority: high"}
            else "minor",
            "user_facing": category != "infrastructure",
            "summary": title,
            "impact": compact_body(pull_request.get("body") or ""),
            "keywords": labels,
        },
    }


def read_existing_gist(
    output_root: Path, date_str: str, pull_request: Dict
) -> Dict | None:
    path = (
        output_root
        / GISTS_REL_DIR
        / date_str
        / f"PR-{pull_request['number']}.json"
    )
    if not path.is_file():
        return None
    try:
        gist = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return gist if isinstance(gist.get("gist"), dict) else None


def group_by_day(
    pull_requests: Iterable[Dict], output_root: Path
) -> Dict[str, List[Dict]]:
    grouped: Dict[str, List[Dict]] = defaultdict(list)
    for pull_request in pull_requests:
        date_str = pull_request["mergedAt"][:10]
        grouped[date_str].append(
            read_existing_gist(output_root, date_str, pull_request)
            or to_summary_input(pull_request)
        )
    return dict(sorted(grouped.items()))


def artifact_paths(output_root: Path, date_str: str) -> tuple[Path, Path]:
    daily_dir = output_root / DAILY_REL_DIR / date_str
    return daily_dir / "summary.json", daily_dir / "images" / "twitter.jpg"


def write_json(path: Path, payload: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def incomplete_days(
    grouped: Dict[str, List[Dict]], output_root: Path
) -> List[tuple[str, List[Dict], bool, bool]]:
    days = []
    for date_str, gists in grouped.items():
        summary_path, image_path = artifact_paths(output_root, date_str)
        summary_missing = not summary_path.is_file()
        image_missing = not image_path.is_file()
        if summary_missing or image_missing:
            days.append((date_str, gists, summary_missing, image_missing))
    return days


def backfill_day(
    date_str: str,
    gists: List[Dict],
    output_root: Path,
    pollinations_token: str,
    summary_missing: bool,
    image_missing: bool,
) -> None:
    summary_path, image_path = artifact_paths(output_root, date_str)
    print(
        f"\n[{date_str}] {len(gists)} merged PRs; "
        f"summary={'missing' if summary_missing else 'present'}, "
        f"image={'missing' if image_missing else 'present'}"
    )

    rich_summary = generate_summary(gists, date_str, pollinations_token)
    if not rich_summary:
        raise RuntimeError(f"daily summary generation failed for {date_str}")

    if summary_missing:
        generated_at = datetime.now(timezone.utc).isoformat()
        summary_artifact = build_daily_summary_artifact(
            rich_summary, gists, date_str, generated_at
        )
        write_json(summary_path, summary_artifact)
        print(f"  Wrote {summary_path.relative_to(output_root)}")

    if image_missing:
        twitter_post = generate_twitter_post(rich_summary, pollinations_token)
        image_prompt = (twitter_post or {}).get("image_prompt")
        if not image_prompt:
            raise RuntimeError(f"Twitter image prompt generation failed for {date_str}")
        image_bytes, _ = generate_image(
            image_prompt, pollinations_token, IMAGE_SIZE, IMAGE_SIZE
        )
        if not image_bytes:
            raise RuntimeError(f"image generation failed for {date_str}")
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(image_bytes)
        print(f"  Wrote {image_path.relative_to(output_root)}")


def main() -> None:
    args = parse_args()
    if args.start_date < FIRST_HISTORY_DAY:
        raise SystemExit(
            f"start date cannot precede the supported history {FIRST_HISTORY_DAY}"
        )
    if args.end_date < args.start_date:
        raise SystemExit("end date must be on or after start date")
    if args.limit is not None and args.limit < 1:
        raise SystemExit("limit must be a positive integer")

    output_root = args.output_root.resolve()
    daily_root = output_root / DAILY_REL_DIR
    if not daily_root.is_dir():
        raise SystemExit(
            f"output root does not contain the news daily tree: {daily_root}"
        )

    pollinations_token = os.getenv("POLLINATIONS_TOKEN")
    if not args.dry_run and not pollinations_token:
        raise SystemExit("POLLINATIONS_TOKEN is required unless --dry-run is used")

    history_file = args.history_file.resolve()
    if not history_file.is_file():
        raise SystemExit(f"PR history does not exist: {history_file}")

    print(f"Loading merged PRs from {args.start_date} through {args.end_date}...")
    pull_requests = load_pull_requests(
        history_file,
        os.getenv("GITHUB_TOKEN"),
        args.start_date,
        args.end_date,
    )
    grouped = group_by_day(pull_requests, output_root)
    pending = incomplete_days(grouped, output_root)
    if args.limit:
        pending = pending[: args.limit]

    missing_summaries = sum(day[2] for day in pending)
    missing_images = sum(day[3] for day in pending)
    print(
        f"Found {len(pull_requests)} merged PRs across {len(grouped)} active days.\n"
        f"Pending: {len(pending)} days, {missing_summaries} summaries, "
        f"{missing_images} images."
    )

    if args.dry_run:
        for date_str, gists, summary_missing, image_missing in pending:
            missing = ", ".join(
                name
                for name, is_missing in (
                    ("summary", summary_missing),
                    ("image", image_missing),
                )
                if is_missing
            )
            print(f"  {date_str}: {len(gists)} PRs; missing {missing}")
        return

    for date_str, gists, summary_missing, image_missing in pending:
        backfill_day(
            date_str,
            gists,
            output_root,
            pollinations_token,
            summary_missing,
            image_missing,
        )

    print(f"\nCompleted {len(pending)} active days.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped. Completed artifacts are preserved; rerun to resume.")
        sys.exit(130)
