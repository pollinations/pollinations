#!/usr/bin/env python3
"""Build operations/social/news/index.json — the one news feed Enter and the README read.

Reads gists and daily summaries from the news branch checkout and keeps:
- `models`: official model announcements from gists (recent, plus scheduled ones still ahead)
- `highlights`: the items each daily summary picked for users

    python build_news_index.py --news-dir <checkout>/operations/social/news [--publish]

Without --publish the index is only written locally; with it, a changed index is committed
to the news branch.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

from common import GISTS_BRANCH, NEWS_REL_DIR, OWNER, REPO, commit_files_to_branch, get_env, get_repo_root

INDEX_PATH = f"{NEWS_REL_DIR}/index.json"
RECENT_DAYS = 30
README_ITEMS = 10
# Announcement changes the model cards show; everything else stays in the gist.
CARD_FIELDS = ("pricing", "paid_only", "capabilities", "input_modalities", "output_modalities",
               "context_length", "per_user_rpm", "max_reference_images")


def read_json(paths) -> List[Dict]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(paths)]


def model_entries(gists: List[Dict], since: str) -> List[Dict]:
    events = []
    for gist in sorted(gists, key=lambda g: (g["merged_at"], g["pr_number"])):
        for item in gist.get("announcements") or []:
            events.append({
                "id": item["id"],
                "model_id": item["model_id"],
                "title": item.get("title") or item["model_id"],
                "action": item["action"],
                "category": item.get("category"),
                "date": (item.get("effective_at") or gist["merged_at"])[:10],
                "scheduled": item.get("effective_status") == "scheduled",
                "pr": gist["pr_number"],
                "url": gist["url"],
                "pricing_units": item.get("pricing_units"),
                "changes": item.get("changes", {}),
            })
    # A later retirement, reschedule or cancellation settles an earlier scheduled retirement.
    settled = {}
    for event in events:
        if event["action"] == "RETIRE" or "retirement_at" in event["changes"]:
            settled[event["model_id"]] = event["id"]
    entries = []
    for event in events:
        event["changes"] = {k: v for k, v in event["changes"].items() if k in CARD_FIELDS}
        superseded = settled.get(event["model_id"], event["id"]) != event["id"]
        if event["date"] < since or (event["scheduled"] and superseded):
            continue
        # Updates that change nothing a card shows (descriptions, routes, aliases) stay in the gist.
        if event["action"] == "UPDATE" and not event["changes"]:
            continue
        entries.append(event)
    return sorted(entries, key=lambda e: (e["date"], e["title"]))


def highlight_entries(summaries: List[Dict], since: str) -> List[Dict]:
    items = [
        {"date": summary["date"], **item}
        for summary in sorted(summaries, key=lambda s: s["date"], reverse=True)
        for item in summary.get("highlights") or []
    ]
    recent = [item for item in items if item["date"] >= since]
    return items[:README_ITEMS] if len(recent) < README_ITEMS else recent


def build_index(news_dir: Path, today: str) -> Dict:
    since = (datetime.fromisoformat(today) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%d")
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "models": model_entries(read_json(news_dir.glob("gists/*/PR-*.json")), since),
        "highlights": highlight_entries(read_json(news_dir.glob("daily/*/summary.json")), since),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--news-dir", type=Path, default=Path(get_repo_root()) / NEWS_REL_DIR,
                        help="operations/social/news from a news branch checkout")
    parser.add_argument("--publish", action="store_true", help="commit to the news branch when changed")
    args = parser.parse_args()

    index_file = args.news_dir / "index.json"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    index = build_index(args.news_dir, today)
    print(f"Index: {len(index['models'])} model announcements, {len(index['highlights'])} highlights")

    previous = json.loads(index_file.read_text()) if index_file.exists() else {}
    if {**previous, "generated_at": None} == {**index, "generated_at": None}:
        print("Index unchanged")
        return
    index_file.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.publish:
        if not commit_files_to_branch([(INDEX_PATH, index)], GISTS_BRANCH, get_env("GITHUB_TOKEN"), OWNER, REPO):
            sys.exit(1)


if __name__ == "__main__":
    main()
