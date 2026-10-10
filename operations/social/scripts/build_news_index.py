#!/usr/bin/env python3
"""Build operations/social/news/index.json — the one news feed Enter, the README and the website read.

Reads gists, daily summaries and monthly pages from the news branch checkout and keeps:
- `models`: official model announcements from recent gists
- `api`: API changes from the post-deploy docs PRs
- `highlights`: the items each daily summary picked for users
- `months`: merged PRs per month with that month's website page (the build diary)
- `contributors`: the top accounts by merged PRs over the last 12 months

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
CONTRIBUTOR_MONTHS = 12
TOP_CONTRIBUTORS = 20
# Announcement changes the model cards show; everything else stays in the gist.
CARD_FIELDS = ("pricing", "paid_only", "capabilities", "input_modalities", "output_modalities",
               "context_length", "per_user_rpm", "max_reference_images", "model_id", "voices")


def read_json(paths) -> List[Dict]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(paths)]


def model_entries(gists: List[Dict], since: str, today: str) -> List[Dict]:
    entries, decisions, removed = [], {}, {}
    for gist in sorted(gists, key=lambda g: (g["merged_at"], g["pr_number"])):
        merged = gist["merged_at"][:10]
        for item in gist.get("announcements") or []:
            entry = {
                "id": item["id"],
                "model_id": item["model_id"],
                "title": item.get("title") or item["model_id"],
                "previous_title": item.get("previous_title"),
                "action": item["action"],
                "category": item.get("category"),
                "date": merged,
                "pr": gist["pr_number"],
                "url": gist["url"],
                "pricing_units": item.get("pricing_units"),
                "changes": {k: v for k, v in item.get("changes", {}).items() if k in CARD_FIELDS},
            }
            status = item.get("effective_status")
            if item.get("source") == "pr_description":
                # Retirements announced in a PR description: the latest one per model wins.
                previous, _ = decisions.get(item["model_id"], (None, None))
                entry["status"] = status
                if status == "scheduled":
                    entry["date"] = item["effective_at"][:10]
                if previous and previous["status"] == "scheduled":
                    entry["previous_date"] = previous["date"]
                decisions[item["model_id"]] = (entry, merged)
                continue
            # Older gists hold provider retirement dates, which the registry no longer keeps.
            if status == "scheduled":
                continue
            if item["action"] == "RETIRE":
                removed[item["model_id"]] = merged
            # Updates that change nothing a card shows (descriptions, routes, aliases) stay in the gist.
            if merged >= since and not (item["action"] == "UPDATE" and not entry["changes"]):
                entries.append(entry)
    for entry, announced in decisions.values():
        # The removal PR settles an announcement; a date that passed without one is hidden.
        if removed.get(entry["model_id"], "") >= announced or (entry["status"] == "scheduled" and entry["date"] < today):
            continue
        # A cancellation is news only for the window after it, and only if it withdrew a date.
        if entry["status"] == "cancelled" and (entry["date"] < since or "previous_date" not in entry):
            continue
        entries.append(entry)
    return sorted(entries, key=lambda e: (e["date"], e["title"]))


def api_entries(gists: List[Dict], since: str) -> List[Dict]:
    """API changes from the post-deploy docs PRs (already live when recorded)."""
    return sorted(
        ({**item, "date": gist["merged_at"][:10], "pr": gist["pr_number"], "url": gist["url"]}
         for gist in gists if gist["merged_at"][:10] >= since
         for item in gist.get("api_changes") or []),
        key=lambda e: (e["date"], e["endpoint"]),
    )


def highlight_entries(summaries: List[Dict], since: str) -> List[Dict]:
    items = [
        {"date": summary["date"], **item}
        for summary in sorted(summaries, key=lambda s: s["date"], reverse=True)
        for item in summary.get("highlights") or []
    ]
    recent = [item for item in items if item["date"] >= since]
    return items[:README_ITEMS] if len(recent) < README_ITEMS else recent


def month_entries(summaries: List[Dict], pages: List[Dict]) -> List[Dict]:
    """The build diary: each month's merged PRs, with its website page once it is written."""
    by_month = {page["period_start"][:7]: page for page in pages}
    entries = []
    for summary in sorted(summaries, key=lambda s: s["period_start"]):
        month = summary["period_start"][:7]
        page = by_month.get(month, {})
        entries.append({
            "month": month,
            "merged_prs": summary["merged_prs"],
            "title": page.get("title"),
            "summary": page.get("text"),
            "image": next((image["url"] for image in page.get("images") or []), None),
        })
    return entries


def contributor_entries(summaries: List[Dict]) -> List[Dict]:
    """Merged PRs per account over the last 12 recorded months; the latest month names each one."""
    people = {}
    for summary in sorted(summaries, key=lambda s: s["period_start"])[-CONTRIBUTOR_MONTHS:]:
        for person in summary["contributors"]:
            entry = people.setdefault(person["id"], {"prs": 0})
            entry.update({**person, "prs": entry["prs"] + person["prs"]})
    return sorted(people.values(), key=lambda p: (-p["prs"], p["login"].lower()))[:TOP_CONTRIBUTORS]


def build_index(news_dir: Path, today: str) -> Dict:
    since = (datetime.fromisoformat(today) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%d")
    gists = read_json(news_dir.glob("gists/*/PR-*.json"))
    months = read_json(news_dir.glob("monthly/*/summary.json"))
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "models": model_entries(gists, since, today),
        "api": api_entries(gists, since),
        "highlights": highlight_entries(read_json(news_dir.glob("daily/*/summary.json")), since),
        "months": month_entries(months, read_json(news_dir.glob("monthly/*/website.json"))),
        "contributors": contributor_entries(months),
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
    print(f"Index: {len(index['models'])} model announcements, {len(index['highlights'])} highlights, "
          f"{len(index['months'])} months, {len(index['contributors'])} contributors")

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
