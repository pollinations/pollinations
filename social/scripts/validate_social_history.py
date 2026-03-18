#!/usr/bin/env python3
"""
Validate normalized social/news artifacts and report legacy folders still pending migration.

Examples:
    python3 social/scripts/validate_social_history.py --repo-root /path/to/news-worktree
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

sys.path.insert(0, str(Path(__file__).parent))

from common import get_repo_root, validate_gist  # noqa: E402


DEFAULT_REPO_ROOT = Path(get_repo_root())
SUMMARY_KEYS = {
    "date",
    "period_start",
    "period_end",
    "title",
    "summary",
    "pr_count",
    "prs",
    "generated_at",
}
POST_KEYS = {
    "platform",
    "scope",
    "date",
    "period_start",
    "period_end",
    "generated_at",
    "images",
}
PLATFORM_TEXT_REQUIRED = {"twitter", "linkedin", "instagram", "discord"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate normalized social/news history"
    )
    parser.add_argument(
        "--repo-root",
        default=str(DEFAULT_REPO_ROOT),
        help="Repo root containing social/news (default: current repo root)",
    )
    return parser.parse_args()


def resolve_repo_root(repo_root_arg: str) -> Path:
    repo_root = Path(repo_root_arg).expanduser().resolve()
    news_root = repo_root / "social" / "news"
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


def validate_summary(repo_root: Path, path: Path, scope: str) -> list[str]:
    errors = []
    data = read_json(path)
    if not data:
        return [f"{path}: unreadable summary.json"]

    missing = SUMMARY_KEYS - set(data.keys())
    if missing:
        errors.append(f"{path}: missing summary keys {sorted(missing)}")
        return errors

    folder_date = path.parent.name
    if data["date"] != folder_date:
        errors.append(f"{path}: summary date {data['date']} != folder date {folder_date}")

    prs = data.get("prs")
    if not isinstance(prs, list):
        errors.append(f"{path}: prs must be a list")
        return errors

    if data.get("pr_count") != len(prs):
        errors.append(f"{path}: pr_count does not match prs length")

    for pr in prs:
        number = pr.get("number")
        date = pr.get("date")
        if not isinstance(number, int) or not isinstance(date, str):
            errors.append(f"{path}: invalid pr ref {pr}")
            continue
        gist_path = repo_root / "social" / "news" / "gists" / date / f"PR-{number}.json"
        if not gist_path.exists():
            errors.append(f"{path}: missing gist for PR ref {date}/PR-{number}.json")

    if scope == "daily":
        if data["period_start"] != folder_date or data["period_end"] != folder_date:
            errors.append(f"{path}: daily period should match folder date")
    elif scope == "weekly":
        folder_weekday = datetime.strptime(folder_date, "%Y-%m-%d").date().weekday()
        if folder_weekday != 6:
            errors.append(f"{path}: weekly folder date should be Sunday publish date")

    return errors


def validate_post(path: Path, scope: str) -> list[str]:
    errors = []
    data = read_json(path)
    if not data:
        return [f"{path}: unreadable post json"]

    missing = POST_KEYS - set(data.keys())
    if missing:
        errors.append(f"{path}: missing post keys {sorted(missing)}")
        return errors

    if data["scope"] != scope:
        errors.append(f"{path}: scope {data['scope']} != {scope}")

    platform = str(data.get("platform") or "")
    if platform in PLATFORM_TEXT_REQUIRED and not str(data.get("text") or "").strip():
        errors.append(f"{path}: missing text")
    if platform == "reddit" and not str(data.get("title") or "").strip():
        errors.append(f"{path}: missing reddit title")

    images = data.get("images")
    if not isinstance(images, list):
        errors.append(f"{path}: images must be a list")
    else:
        for image in images:
            if not isinstance(image, dict) or not str(image.get("url") or "").strip():
                errors.append(f"{path}: invalid image entry {image}")

    metadata = data.get("metadata")
    if metadata is not None and not isinstance(metadata, dict):
        errors.append(f"{path}: metadata must be an object when present")

    return errors


def validate_scope(repo_root: Path, scope: str) -> tuple[list[str], int]:
    errors: list[str] = []
    legacy_count = 0
    root = repo_root / "social" / "news" / scope
    if not root.exists():
        return errors, legacy_count

    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        summary_path = folder / "summary.json"
        if not summary_path.exists():
            legacy_count += 1
            continue

        errors.extend(validate_summary(repo_root, summary_path, scope))
        for post_path in sorted(folder.glob("*.json")):
            if post_path.name == "summary.json":
                continue
            errors.extend(validate_post(post_path, scope))

    return errors, legacy_count


def validate_gists(repo_root: Path) -> list[str]:
    errors = []
    gists_root = repo_root / "social" / "news" / "gists"
    if not gists_root.exists():
        return errors

    for gist_path in sorted(gists_root.glob("*/*.json")):
        data = read_json(gist_path)
        if not data:
            errors.append(f"{gist_path}: unreadable gist")
            continue
        gist_errors = validate_gist(data)
        for gist_error in gist_errors:
            errors.append(f"{gist_path}: {gist_error}")

        image_path = gist_path.with_suffix(".jpg")
        if image_path.exists():
            continue

        image = data.get("image")
        image_url = str((image or {}).get("url") or "").strip()
        if not image_url:
            errors.append(f"{gist_path}: missing companion jpg and image.url")

    return errors


def main() -> None:
    args = parse_args()
    repo_root = resolve_repo_root(args.repo_root)

    print("=== Social History Validation ===")
    print(f"Repo root: {repo_root}")

    all_errors: list[str] = []
    legacy_counts = Counter()

    for scope in ("daily", "weekly"):
        errors, legacy_count = validate_scope(repo_root, scope)
        all_errors.extend(errors)
        legacy_counts[scope] = legacy_count

    gist_errors = validate_gists(repo_root)
    all_errors.extend(gist_errors)

    print(f"Legacy daily folders pending migration:  {legacy_counts['daily']}")
    print(f"Legacy weekly folders pending migration: {legacy_counts['weekly']}")
    print(f"Gist validation errors:                  {len(gist_errors)}")
    print(f"Total errors:                            {len(all_errors)}")

    if all_errors:
        print("\n=== Errors ===")
        for error in all_errors[:200]:
            print(f"- {error}")
        if len(all_errors) > 200:
            print(f"... and {len(all_errors) - 200} more")
        sys.exit(1)


if __name__ == "__main__":
    main()
