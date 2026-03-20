#!/usr/bin/env python3
"""
Migrate historical daily and weekly social artifacts to the normalized storage format.

This script is intentionally dry-run by default. Pass --apply to write changes.

It operates on a repo checkout that contains social/news, typically a worktree
checked out to the news branch.

Examples:
    python3 social/scripts/migrate_social_history.py --repo-root /path/to/news-worktree
    python3 social/scripts/migrate_social_history.py --repo-root /path/to/news-worktree --apply
    python3 social/scripts/migrate_social_history.py --repo-root /path/to/news-worktree \
        --daily-dates 2026-03-15 --weekly-dates 2026-03-14
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional

sys.path.insert(0, str(Path(__file__).parent))

from common import (  # noqa: E402
    OWNER,
    REPO,
    build_canonical_summary,
    build_linkedin_post_text,
    filter_daily_gists,
    get_repo_root,
    normalize_platform_post,
)


DEFAULT_REPO_ROOT = Path(get_repo_root())
NEWS_PREFIX = Path("social/news")
RAW_BASE = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/news/social/news"
SUMMARY_REQUIRED_KEYS = {
    "date",
    "period_start",
    "period_end",
    "title",
    "summary",
    "pr_count",
    "prs",
    "generated_at",
}


@dataclass
class MigrationStats:
    daily_scanned: int = 0
    daily_migrated: int = 0
    daily_skipped: int = 0
    weekly_scanned: int = 0
    weekly_migrated: int = 0
    weekly_skipped: int = 0
    conflicts: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migrate historical social/news daily and weekly artifacts"
    )
    parser.add_argument(
        "--repo-root",
        default=str(DEFAULT_REPO_ROOT),
        help="Repo root containing social/news (default: current repo root)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes in place. Default is dry-run.",
    )
    parser.add_argument(
        "--daily-dates",
        nargs="*",
        default=None,
        help="Specific daily folder dates to migrate (YYYY-MM-DD). Defaults to all.",
    )
    parser.add_argument(
        "--weekly-dates",
        nargs="*",
        default=None,
        help=(
            "Specific weekly folder dates to migrate. For legacy history these are the "
            "Saturday folder dates."
        ),
    )
    return parser.parse_args()


def resolve_repo_root(repo_root_arg: str) -> Path:
    repo_root = Path(repo_root_arg).expanduser().resolve()
    news_root = repo_root / NEWS_PREFIX
    if not news_root.exists():
        print(f"FATAL: {news_root} does not exist.")
        print("Hint: run this against a checkout or worktree that contains the news branch.")
        sys.exit(1)
    return repo_root


def read_json(path: Path) -> Optional[Dict]:
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def news_raw_url(repo_root: Path, file_path: Path) -> str:
    rel_path = file_path.resolve().relative_to(repo_root).as_posix()
    if rel_path.startswith("social/news/"):
        rel_path = rel_path[len("social/news/") :]
    return f"{RAW_BASE}/{rel_path}"


def clean_social_text(text: str) -> str:
    return (
        text.replace("\r", "")
        .replace("\t", " ")
        .replace("·˚✿", " ")
        .replace("✿˚·", " ")
        .replace("───", " ")
    )


def normalize_summary_text(text: str) -> str:
    cleaned = clean_social_text(text)
    cleaned = re.sub(r"\[.*?\]\s*", "", cleaned)
    cleaned = re.sub(r"\s*#\w+", "", cleaned)
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip()


def extract_title(text: str) -> str:
    cleaned = normalize_summary_text(text)
    if not cleaned:
        return ""
    sentences = cleaned.split(". ")
    return (sentences[0] or cleaned).strip()


def split_title_and_summary(text: str, fallback_title: str) -> tuple[str, str]:
    cleaned = normalize_summary_text(text)
    if not cleaned:
        return fallback_title, fallback_title
    title = extract_title(cleaned) or fallback_title
    summary = cleaned
    if summary.startswith(title):
        summary = summary[len(title) :].strip(" .")
    if not summary:
        summary = cleaned if cleaned != title else fallback_title
    return title, summary


def pick_generated_at(*payloads: Optional[Dict]) -> str:
    for payload in payloads:
        if not payload:
            continue
        generated_at = str(payload.get("generated_at") or "").strip()
        if generated_at:
            return generated_at
    return datetime.now(timezone.utc).isoformat()


def is_already_migrated(folder: Path) -> bool:
    summary_path = folder / "summary.json"
    data = read_json(summary_path)
    if not data:
        return False
    return SUMMARY_REQUIRED_KEYS.issubset(data.keys())


def sorted_dirs(root: Path, selected: Optional[Iterable[str]]) -> list[Path]:
    if not root.exists():
        return []
    wanted = set(selected) if selected else None
    dirs = [p for p in root.iterdir() if p.is_dir()]
    if wanted is not None:
        dirs = [p for p in dirs if p.name in wanted]
    return sorted(dirs, key=lambda p: p.name)


def read_gists_for_date_from_root(repo_root: Path, date_str: str) -> list[Dict]:
    day_dir = repo_root / "social" / "news" / "gists" / date_str
    if not day_dir.exists():
        return []
    gists = []
    for gist_path in sorted(day_dir.glob("PR-*.json")):
        data = read_json(gist_path)
        if data:
            gists.append(data)
    return gists


def read_gists_for_week_from_root(
    repo_root: Path, week_start: str, week_end: str
) -> list[Dict]:
    start = datetime.strptime(week_start, "%Y-%m-%d").date()
    end = datetime.strptime(week_end, "%Y-%m-%d").date()
    gists = []
    current = start
    while current <= end:
        gists.extend(
            read_gists_for_date_from_root(repo_root, current.strftime("%Y-%m-%d"))
        )
        current += timedelta(days=1)
    return gists


def attach_single_image(
    post: Optional[Dict],
    source_image_path: Path,
    url_image_path: Path,
    repo_root: Path,
) -> None:
    if not post or not source_image_path.exists():
        return
    image = dict(post.get("image") or {})
    image["url"] = news_raw_url(repo_root, url_image_path)
    post["image"] = image


def attach_instagram_images(
    post: Optional[Dict],
    source_image_dir: Path,
    url_image_dir: Path,
    repo_root: Path,
    prefix: str = "instagram",
) -> None:
    if not post:
        return

    image_paths = sorted(
        source_image_dir.glob(f"{prefix}-*.jpg"),
        key=lambda p: int(p.stem.split("-")[-1]),
    )
    if not image_paths:
        return

    images = list(post.get("images") or [])
    while len(images) < len(image_paths):
        images.append({})

    for idx, image_path in enumerate(image_paths):
        image = dict(images[idx] or {})
        image["url"] = news_raw_url(repo_root, url_image_dir / image_path.name)
        images[idx] = image

    post["images"] = images


def build_daily_summary_from_legacy(
    date_str: str,
    gists: list[Dict],
    twitter_post: Optional[Dict],
    reddit_post: Optional[Dict],
    generated_at: str,
) -> Dict:
    source_text = ""
    if twitter_post:
        source_text = str(twitter_post.get("tweet") or "").strip()
    if not source_text and reddit_post:
        source_text = str(reddit_post.get("body") or reddit_post.get("title") or "").strip()

    if source_text:
        title, summary = split_title_and_summary(source_text, f"Updates for {date_str}")
    elif gists:
        first = gists[0]
        title = str(first.get("gist", {}).get("headline") or "").strip() or f"Updates for {date_str}"
        summary = (
            str(first.get("gist", {}).get("summary") or "").strip()
            or str(first.get("gist", {}).get("blurb") or "").strip()
            or title
        )
    else:
        title = f"Updates for {date_str}"
        summary = title

    prs = [{"number": gist.get("pr_number"), "date": date_str} for gist in gists]
    return build_canonical_summary(
        date=date_str,
        period_start=date_str,
        period_end=date_str,
        title=title,
        summary=summary,
        prs=prs,
        generated_at=generated_at,
    )


def build_weekly_summary_from_legacy(
    publish_date: str,
    week_start: str,
    week_end: str,
    gists: list[Dict],
    linkedin_post: Optional[Dict],
    twitter_post: Optional[Dict],
    generated_at: str,
) -> Dict:
    title = ""
    summary = ""

    if linkedin_post:
        body = str(linkedin_post.get("body") or "").strip()
        hook = str(linkedin_post.get("hook") or "").strip()
        full_post = str(
            linkedin_post.get("full_post") or build_linkedin_post_text(linkedin_post)
        ).strip()

        if body:
            title, summary = split_title_and_summary(body, f"Week ending {week_end}")
        elif full_post:
            title, summary = split_title_and_summary(full_post, f"Week ending {week_end}")
        elif hook:
            title, summary = split_title_and_summary(hook, f"Week ending {week_end}")

    if not title and twitter_post:
        tweet = str(twitter_post.get("tweet") or "").strip()
        if tweet:
            title, summary = split_title_and_summary(tweet, f"Week ending {week_end}")

    if not title and gists:
        first = gists[0]
        title = (
            str(first.get("gist", {}).get("headline") or "").strip()
            or f"Week ending {week_end}"
        )
        summary = (
            str(first.get("gist", {}).get("summary") or "").strip()
            or str(first.get("gist", {}).get("blurb") or "").strip()
            or title
        )

    if not title:
        title = f"Week ending {week_end}"
    if not summary:
        summary = title

    prs = [
        {"number": gist.get("pr_number"), "date": str(gist.get("merged_at") or "")[:10]}
        for gist in gists
    ]
    return build_canonical_summary(
        date=publish_date,
        period_start=week_start,
        period_end=week_end,
        title=title,
        summary=summary,
        prs=prs,
        generated_at=generated_at,
    )


def migrate_daily_folder(repo_root: Path, folder: Path, apply: bool) -> tuple[bool, str]:
    if is_already_migrated(folder):
        return False, "already migrated"

    date_str = folder.name
    twitter_post = read_json(folder / "twitter.json")
    instagram_post = read_json(folder / "instagram.json")
    reddit_post = read_json(folder / "reddit.json")

    if not any([twitter_post, instagram_post, reddit_post]):
        return False, "no legacy platform JSON found"

    gists = filter_daily_gists(read_gists_for_date_from_root(repo_root, date_str))
    generated_at = pick_generated_at(twitter_post, instagram_post, reddit_post)

    images_dir = folder / "images"
    attach_single_image(
        twitter_post, images_dir / "twitter.jpg", images_dir / "twitter.jpg", repo_root
    )
    attach_instagram_images(instagram_post, images_dir, images_dir, repo_root)
    attach_single_image(
        reddit_post, images_dir / "reddit.jpg", images_dir / "reddit.jpg", repo_root
    )

    summary_artifact = build_daily_summary_from_legacy(
        date_str, gists, twitter_post, reddit_post, generated_at
    )

    outputs: list[tuple[Path, Dict]] = [(folder / "summary.json", summary_artifact)]
    if twitter_post:
        outputs.append(
            (
                folder / "twitter.json",
                normalize_platform_post(
                    platform="twitter",
                    scope="daily",
                    date=date_str,
                    period_start=date_str,
                    period_end=date_str,
                    generated_at=generated_at,
                    raw_post=twitter_post,
                ),
            )
        )
    if instagram_post:
        outputs.append(
            (
                folder / "instagram.json",
                normalize_platform_post(
                    platform="instagram",
                    scope="daily",
                    date=date_str,
                    period_start=date_str,
                    period_end=date_str,
                    generated_at=generated_at,
                    raw_post=instagram_post,
                ),
            )
        )
    if reddit_post:
        outputs.append(
            (
                folder / "reddit.json",
                normalize_platform_post(
                    platform="reddit",
                    scope="daily",
                    date=date_str,
                    period_start=date_str,
                    period_end=date_str,
                    generated_at=generated_at,
                    raw_post=reddit_post,
                ),
            )
        )

    print(f"[daily:{date_str}] migrate {len(outputs)} files")
    for path, _payload in outputs:
        print(f"  WRITE {path.relative_to(repo_root)}")

    if apply:
        for path, payload in outputs:
            write_json(path, payload)

    return True, "migrated"


def get_week_window_from_folder(folder_date: str) -> tuple[str, str, str]:
    raw_date = datetime.strptime(folder_date, "%Y-%m-%d").date()
    if raw_date.weekday() == 5:  # Saturday legacy folder
        week_end = raw_date
        publish_date = raw_date + timedelta(days=1)
    elif raw_date.weekday() == 6:  # Sunday folder
        publish_date = raw_date
        week_end = raw_date - timedelta(days=1)
    else:
        raise ValueError(
            f"Weekly folder {folder_date} is neither Saturday legacy nor Sunday publish date"
        )
    week_start = publish_date - timedelta(days=7)
    return (
        week_start.strftime("%Y-%m-%d"),
        week_end.strftime("%Y-%m-%d"),
        publish_date.strftime("%Y-%m-%d"),
    )


def migrate_weekly_folder(repo_root: Path, folder: Path, apply: bool) -> tuple[bool, str]:
    if is_already_migrated(folder):
        return False, "already migrated"

    try:
        week_start, week_end, publish_date = get_week_window_from_folder(folder.name)
    except ValueError as exc:
        return False, str(exc)

    source_dir = folder
    target_dir = folder.parent / publish_date
    if source_dir != target_dir and target_dir.exists():
        return False, f"target already exists: {target_dir.name}"

    twitter_post = read_json(source_dir / "twitter.json")
    linkedin_post = read_json(source_dir / "linkedin.json")
    instagram_post = read_json(source_dir / "instagram.json")
    reddit_post = read_json(source_dir / "reddit.json")
    discord_post = read_json(source_dir / "discord.json")

    if not any([twitter_post, linkedin_post, instagram_post, reddit_post, discord_post]):
        return False, "no legacy platform JSON found"

    all_gists = filter_daily_gists(
        read_gists_for_week_from_root(repo_root, week_start, week_end)
    )
    generated_at = pick_generated_at(
        linkedin_post, twitter_post, instagram_post, reddit_post, discord_post
    )

    source_image_dir = source_dir / "images"
    target_image_dir = target_dir / "images"
    attach_single_image(
        twitter_post,
        source_image_dir / "twitter.jpg",
        target_image_dir / "twitter.jpg",
        repo_root,
    )
    attach_single_image(
        linkedin_post,
        source_image_dir / "linkedin.jpg",
        target_image_dir / "linkedin.jpg",
        repo_root,
    )
    attach_instagram_images(
        instagram_post, source_image_dir, target_image_dir, repo_root
    )
    attach_single_image(
        reddit_post,
        source_image_dir / "reddit.jpg",
        target_image_dir / "reddit.jpg",
        repo_root,
    )
    attach_single_image(
        discord_post,
        source_image_dir / "discord.jpg",
        target_image_dir / "discord.jpg",
        repo_root,
    )

    summary_artifact = build_weekly_summary_from_legacy(
        publish_date,
        week_start,
        week_end,
        all_gists,
        linkedin_post,
        twitter_post,
        generated_at,
    )

    outputs: list[tuple[Path, Dict]] = [(target_dir / "summary.json", summary_artifact)]
    for platform, post in [
        ("twitter", twitter_post),
        ("linkedin", linkedin_post),
        ("instagram", instagram_post),
        ("reddit", reddit_post),
        ("discord", discord_post),
    ]:
        if not post:
            continue
        outputs.append(
            (
                target_dir / f"{platform}.json",
                normalize_platform_post(
                    platform=platform,
                    scope="weekly",
                    date=publish_date,
                    period_start=week_start,
                    period_end=week_end,
                    generated_at=generated_at,
                    raw_post=post,
                ),
            )
        )

    if source_dir != target_dir:
        print(
            f"[weekly:{folder.name}] rename to Sunday publish date {publish_date}"
        )
        print(f"  MOVE  {source_dir.relative_to(repo_root)} -> {target_dir.relative_to(repo_root)}")
    else:
        print(f"[weekly:{folder.name}] rewrite in place")

    for path, _payload in outputs:
        print(f"  WRITE {path.relative_to(repo_root)}")

    if apply:
        if source_dir != target_dir:
            target_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source_dir), str(target_dir))
        for path, payload in outputs:
            write_json(path, payload)

    return True, "migrated"


def main() -> None:
    args = parse_args()
    repo_root = resolve_repo_root(args.repo_root)
    daily_root = repo_root / "social" / "news" / "daily"
    weekly_root = repo_root / "social" / "news" / "weekly"

    stats = MigrationStats()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== Social History Migration ({mode}) ===")
    print(f"Repo root: {repo_root}")

    for folder in sorted_dirs(daily_root, args.daily_dates):
        stats.daily_scanned += 1
        changed, reason = migrate_daily_folder(repo_root, folder, args.apply)
        if changed:
            stats.daily_migrated += 1
        else:
            stats.daily_skipped += 1
            print(f"[daily:{folder.name}] skip: {reason}")

    for folder in sorted_dirs(weekly_root, args.weekly_dates):
        stats.weekly_scanned += 1
        changed, reason = migrate_weekly_folder(repo_root, folder, args.apply)
        if changed:
            stats.weekly_migrated += 1
        else:
            stats.weekly_skipped += 1
            if reason.startswith("target already exists"):
                stats.conflicts += 1
            print(f"[weekly:{folder.name}] skip: {reason}")

    print("\n=== Summary ===")
    print(f"Daily scanned:   {stats.daily_scanned}")
    print(f"Daily migrated:  {stats.daily_migrated}")
    print(f"Daily skipped:   {stats.daily_skipped}")
    print(f"Weekly scanned:  {stats.weekly_scanned}")
    print(f"Weekly migrated: {stats.weekly_migrated}")
    print(f"Weekly skipped:  {stats.weekly_skipped}")
    print(f"Conflicts:       {stats.conflicts}")
    if not args.apply:
        print("\nDry-run only. Re-run with --apply to write changes.")


if __name__ == "__main__":
    main()
