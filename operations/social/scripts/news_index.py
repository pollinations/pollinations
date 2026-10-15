#!/usr/bin/env python3
"""Build operations/social/news/index.json — the news feed Enter's News page reads.

Reads the news branch checkout and keeps:
- `models`: official model changes, from the daily /models record (dated when first seen
  live), and the retirements PR descriptions schedule, from the daily PR notes
- `api`: API changes from the post-deploy docs PRs, from the daily PR notes
- `highlights`: the items each daily summary picked for users

    python news_index.py --news-dir <checkout>/operations/social/news [--publish]

Without --publish the index is only written locally; with it, a changed index is committed
to the news branch.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

from common import NEWS_BRANCH, NEWS_REL_DIR, OWNER, REPO, commit_files_to_branch, get_env, get_repo_root

INDEX_PATH = f"{NEWS_REL_DIR}/index.json"
RECENT_DAYS = 30
MIN_HIGHLIGHTS = 10
# Changes the model cards show; everything else stays in the record.
CARD_FIELDS = ("pricing", "paid_only", "capabilities", "input_modalities", "output_modalities",
               "context_length", "per_user_rpm", "max_reference_images", "model_id", "voices")


def read_json(paths) -> List[Dict]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(paths)]


IGNORED = {"health", "pending_change", "name", "title", "description", "publisher",
           "brand_url", "brand_icon_url", "added_date", "community", "agent"}


def model_changes(before, after, prefix):
    old = {m["name"]: m for m in before if not m.get("community")}
    new = {m["name"]: m for m in after if not m.get("community")}
    aliases = {alias for model in new.values() for alias in model.get("aliases", [])}
    removed = old.keys() - new.keys()
    renamed = {name: next((alias for alias in model.get("aliases", []) if alias in removed), None)
               for name, model in new.items() if name not in old}
    events = []
    for name in sorted(old.keys() | new.keys()):
        if name in removed and name in aliases:
            continue  # This ID still works through an alias; it is not retired.
        previous, current = old.get(renamed.get(name) or name), new.get(name)
        changes = {}
        for field in sorted((previous or {}).keys() | (current or {}).keys()):
            if field in IGNORED:
                continue
            a, b = (previous or {}).get(field), (current or {}).get(field)
            if field == "paid_only" and previous and current:
                a, b = bool(a), bool(b)
            if a != b:
                changes[field] = {"before": a, "after": b}
        if renamed.get(name):
            # The old ID keeps working as an alias, but the model behind it changed.
            changes["model_id"] = {"before": renamed[name], "after": name}
        if previous is None or current is None:
            changes["availability"] = {"before": "Available" if previous else "Unavailable",
                                       "after": "Available" if current else "Retired"}
        kind = "added" if previous is None else "removed" if current is None else "changed"
        if changes or previous is None or current is None:
            events.append({"id": f"{prefix}:{name}", "model_id": name,
                           "title": (current or previous).get("title", name), "action": {"added": "NEW", "removed": "RETIRE", "changed": "UPDATE"}[kind],
                           "category": (current or previous).get("category"),
                           "pricing_units": {"before": (previous or {}).get("pricing_units"), "after": (current or {}).get("pricing_units")},
                           "changes": changes, "effective_at": None, "effective_status": "unconfirmed", "official": True,
                           **({"previous_title": previous.get("title", renamed[name])} if renamed.get(name) else {})})
    return events



def record_changes(snapshots: List[tuple]) -> List[tuple]:
    """(day, event) for each change between consecutive recorded catalogs. Only categories
    both snapshots hold are compared, so a newly recorded category announces nothing."""
    changes = []
    for (_, previous), (day, current) in zip(snapshots, snapshots[1:]):
        shared = previous.keys() & current.keys()
        before = [model for category in shared for model in previous[category]]
        after = [model for category in shared for model in current[category]]
        changes.extend((day, event) for event in model_changes(before, after, day))
    return changes


def model_entries(snapshots: List[tuple], notes: List[Dict], since: str, today: str) -> List[Dict]:
    entries, decisions, removed = [], {}, {}
    for day, item in record_changes(snapshots):
        if item["action"] == "RETIRE":
            removed[item["model_id"]] = day
        entry = {
            "id": item["id"],
            "model_id": item["model_id"],
            "title": item.get("title") or item["model_id"],
            "previous_title": item.get("previous_title"),
            "action": item["action"],
            "category": item.get("category"),
            "date": day,
            "pricing_units": item.get("pricing_units"),
            "changes": {k: v for k, v in item.get("changes", {}).items() if k in CARD_FIELDS},
        }
        # Updates that change nothing a card shows (descriptions, routes, aliases) stay in the record.
        if day >= since and not (item["action"] == "UPDATE" and not entry["changes"]):
            entries.append(entry)
    # Retirements announced in a PR description: the latest one per model wins.
    for note in sorted(notes, key=lambda n: (n["merged_at"], n["pr_number"])):
        merged = note["merged_at"][:10]
        for item in note.get("announcements") or []:
            previous, _ = decisions.get(item["model_id"], (None, None))
            entry = {
                "id": item["id"], "model_id": item["model_id"], "title": item.get("title") or item["model_id"],
                "action": item["action"], "category": item.get("category"),
                "date": item["effective_at"][:10] if item["effective_status"] == "scheduled" else merged,
                "status": item["effective_status"], "pr": note["pr_number"], "url": note["url"],
                "changes": {k: v for k, v in item.get("changes", {}).items() if k in CARD_FIELDS},
            }
            if previous and previous["status"] == "scheduled":
                entry["previous_date"] = previous["date"]
            decisions[item["model_id"]] = (entry, merged)
    for entry, announced in decisions.values():
        # The removal settles an announcement; a date that passed without one is hidden.
        if removed.get(entry["model_id"], "") >= announced or (entry["status"] == "scheduled" and entry["date"] < today):
            continue
        # A cancellation is news only for the window after it, and only if it withdrew a date.
        if entry["status"] == "cancelled" and (entry["date"] < since or "previous_date" not in entry):
            continue
        entries.append(entry)
    return sorted(entries, key=lambda e: (e["date"], e["title"]))


def api_entries(notes: List[Dict], since: str) -> List[Dict]:
    """API changes from the post-deploy docs PRs (already live when recorded)."""
    return sorted(
        ({**item, "date": note["merged_at"][:10], "pr": note["pr_number"], "url": note["url"]}
         for note in notes if note["merged_at"][:10] >= since
         for item in note.get("api_changes") or []),
        key=lambda e: (e["date"], e["endpoint"]),
    )


def highlight_entries(summaries: List[Dict], since: str) -> List[Dict]:
    items = [
        {"date": summary["date"], **item}
        for summary in sorted(summaries, key=lambda s: s["date"], reverse=True)
        for item in summary.get("highlights") or []
    ]
    recent = [item for item in items if item["date"] >= since]
    return items[:MIN_HIGHLIGHTS] if len(recent) < MIN_HIGHLIGHTS else recent


def build_index(news_dir: Path, today: str) -> Dict:
    since = (datetime.fromisoformat(today) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%d")
    notes = [note for day in read_json(news_dir.glob("daily/*/prs.json")) for note in day]
    # The window's snapshots and the last one before it, the baseline of its first change.
    paths = sorted(news_dir.glob("models/snapshots/*.json"))
    first = max([i for i, path in enumerate(paths) if path.stem < since] or [0])
    snapshots = [(path.stem, json.loads(path.read_text(encoding="utf-8"))) for path in paths[first:]]
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "models": model_entries(snapshots, notes, since, today),
        "api": api_entries(notes, since),
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
        if not commit_files_to_branch([(INDEX_PATH, index)], NEWS_BRANCH, get_env("GITHUB_TOKEN"), OWNER, REPO):
            sys.exit(1)


if __name__ == "__main__":
    main()
