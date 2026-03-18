#!/usr/bin/env python3
"""Backfill GitHub scores for existing spore users on staging.

Scores users with:
  - tier = 'spore'
  - github_id IS NOT NULL
  - score IS NULL

This script stores `score` and `score_checked_at` only. It does not upgrade tiers.

Usage:
    python scripts/user-pipeline/backfills/backfill-spore-scores.py --dry-run
    python scripts/user-pipeline/backfills/backfill-spore-scores.py --env staging --limit 1000 --offset 0
"""

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_ROOT / "shared"))
from python_runtime import ensure_python_bin

ensure_python_bin()

sys.path.insert(0, str(SCRIPT_ROOT / "scoring"))

from d1 import ensure_safe_env, run_d1_query
from github_account_state import (
    ban_github_ids,
    extract_deleted_github_ids,
)
from github_score import validate_user_records

DEFAULT_LIMIT = 1000
SQL_BATCH_SIZE = 200
USERNAME_RE = re.compile(r"^[A-Za-z0-9-]+$")


def fetch_backlog_count(env: str) -> int:
    results = run_d1_query(
        """
        SELECT COUNT(*) AS count
        FROM user
        WHERE tier = 'spore'
        AND github_id IS NOT NULL
        AND COALESCE(banned, 0) = 0
        AND score IS NULL
        """,
        env,
    )
    if not results:
        return 0
    return int(results[0]["count"])


def fetch_backlog_users(env: str, limit: int, offset: int) -> list[dict]:
    results = run_d1_query(
        f"""
        SELECT github_id, github_username
        FROM user
        WHERE tier = 'spore'
        AND github_id IS NOT NULL
        AND COALESCE(banned, 0) = 0
        AND score IS NULL
        ORDER BY created_at ASC, github_id ASC
        LIMIT {limit} OFFSET {offset}
        """,
        env,
    )
    if not results:
        return []
    return results


def store_scores(results: list[dict], env: str) -> tuple[int, int]:
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    stored = 0
    skipped = 0

    for index in range(0, len(results), SQL_BATCH_SIZE):
        batch = results[index : index + SQL_BATCH_SIZE]
        sanitized_batch = []
        for result in batch:
            github_id = result.get("github_id")
            username = result.get("username")
            if not isinstance(github_id, int) or github_id <= 0:
                skipped += 1
                continue
            if not isinstance(username, str) or not USERNAME_RE.match(username):
                skipped += 1
                continue

            raw_score = (result.get("details") or {}).get("total", 0)
            total_score = float(raw_score) if raw_score is not None else 0.0
            sanitized_batch.append((github_id, username, total_score))

        if not sanitized_batch:
            continue

        score_cases = " ".join(
            f"WHEN {github_id} THEN {score}"
            for github_id, _username, score in sanitized_batch
        )
        username_cases = " ".join(
            f"WHEN {github_id} THEN '{username}'"
            for github_id, username, _score in sanitized_batch
        )
        id_list = ", ".join(
            str(github_id) for github_id, _username, _score in sanitized_batch
        )
        update_query = f"""
            UPDATE user
            SET
                score = CASE github_id {score_cases} END,
                github_username = CASE github_id {username_cases} END,
                score_checked_at = {now}
            WHERE github_id IN ({id_list})
            AND tier = 'spore'
        """

        update_result = run_d1_query(update_query, env)
        if update_result is None:
            print(
                f"❌ Failed to store batch {index // SQL_BATCH_SIZE + 1}",
                file=sys.stderr,
            )
            continue

        stored += len(sanitized_batch)
        print(
            f"   💾 Stored {stored}/{len(results)} score rows",
            file=sys.stderr,
        )

    return stored, skipped


def summarize(results: list[dict]) -> None:
    approved = [result for result in results if result.get("approved")]
    rejected = [result for result in results if not result.get("approved")]

    print("\n📊 Validation summary:")
    print(f"   Approved: {len(approved)}")
    print(f"   Rejected: {len(rejected)}")

    if results:
        average_score = sum(
            float((result.get("details") or {}).get("total", 0)) for result in results
        ) / len(results)
        print(f"   Average score: {average_score:.2f}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill score and score_checked_at for existing spore users"
    )
    parser.add_argument(
        "--env",
        choices=["staging"],
        default="staging",
        help="Environment",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate users without writing score columns",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Maximum users to process from the backlog slice (default: {DEFAULT_LIMIT})",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Offset into the stable backlog ordering",
    )
    args = parser.parse_args()

    env = ensure_safe_env(args.env)

    if args.limit <= 0:
        print("❌ --limit must be greater than 0", file=sys.stderr)
        return 1
    if args.offset < 0:
        print("❌ --offset must be 0 or greater", file=sys.stderr)
        return 1
    if not args.dry_run and args.offset != 0:
        print(
            "❌ Live runs must use --offset 0. The backlog shrinks as scores are stored, so non-zero offsets would skip users.",
            file=sys.stderr,
        )
        return 1

    total_backlog = fetch_backlog_count(env)

    print("🧮 Backfill Spore Scores")
    print(f"   Environment: {env}")
    print(f"   Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"   Backlog total: {total_backlog}")
    print(f"   Slice: offset={args.offset}, limit={args.limit}")

    if total_backlog == 0:
        print("✅ No spore backlog to score")
        return 0

    user_records = fetch_backlog_users(env, args.limit, args.offset)
    print(f"   Selected users: {len(user_records)}")

    if not user_records:
        print("✅ No users found in this slice")
        return 0

    results = validate_user_records(user_records)
    results_by_github_id = {
        result["github_id"]: result
        for result in results
        if isinstance(result.get("github_id"), int)
    }
    ordered_results = [
        results_by_github_id[row["github_id"]]
        for row in user_records
        if isinstance(row.get("github_id"), int) and row["github_id"] in results_by_github_id
    ]
    deleted_github_ids = extract_deleted_github_ids(ordered_results)
    deleted_github_id_set = set(deleted_github_ids)
    scoreable_results = [
        result
        for result in ordered_results
        if isinstance(result.get("github_id"), int)
        and result["github_id"] not in deleted_github_id_set
    ]

    summarize(ordered_results)

    if deleted_github_ids:
        if args.dry_run:
            print(
                f"\n🚫 Dry run would ban {len(deleted_github_ids)} users with deleted/invalid GitHub accounts"
            )
        else:
            banned = ban_github_ids(deleted_github_ids, env)
            print(
                f"\n🚫 Banned {banned} users with deleted/invalid GitHub accounts"
            )

    if args.dry_run:
        print("\n🔍 Dry run sample:")
        for result in ordered_results[:20]:
            score = float((result.get("details") or {}).get("total", 0))
            print(f"   {result['username']}: {score:.1f} ({result['reason']})")
        if len(ordered_results) > 20:
            print(f"   ... and {len(ordered_results) - 20} more")
        return 0

    stored, skipped = store_scores(scoreable_results, env)

    print("\n✅ Backfill complete:")
    print(f"   Stored: {stored}")
    if skipped:
        print(f"   Skipped invalid usernames: {skipped}")
    print(f"   Remaining backlog estimate: {max(total_backlog - stored, 0)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
