#!/usr/bin/env python3
"""Upgrade spore users to seed tier.

Fetches spore users from D1, validates GitHub profiles, and upgrades eligible users.
Can be run locally or via GitHub Actions.

Strategy (stateless, day-based slicing):
    1. Always check users created in the last 24 hours (new users)
    2. For older users, use LIMIT/OFFSET with day-of-week slicing
       This ensures all users are checked once per week without tracking state.
    3. Fetches 10 repos per user for quality filtering and fraud detection

Usage:
    python user_upgrade_spore_to_seed.py              # Full run
    python user_upgrade_spore_to_seed.py --dry-run    # Validate only, no upgrades
    python user_upgrade_spore_to_seed.py --env staging  # Use staging environment

Environment variables:
    GITHUB_TOKEN           - Required for GitHub API
    CLOUDFLARE_API_TOKEN   - Required for wrangler D1 access
    CLOUDFLARE_ACCOUNT_ID  - Required for wrangler D1 access
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

from user_validate_github_profile import validate_users

# Max users to process per run (stay well under 1000 point/hour GitHub API limit)
# With repos(first:10), each batch of 50 costs ~6 points, so 166 batches = 8,300 users
MAX_USERS_PER_RUN = 8000  # Safety cap under API limits


def run_d1_query(query: str, env: str = "production") -> list[dict] | None:
    """Run a D1 query and return results."""
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--remote",
        "--env",
        env,
        "--command",
        query,
        "--json",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=os.path.join(os.path.dirname(__file__), "../../enter.pollinations.ai"),
            timeout=60,
        )

        if result.returncode != 0:
            print(f"❌ D1 query failed: {result.stderr}", file=sys.stderr)
            return None

        data = json.loads(result.stdout)
        return data[0].get("results", [])

    except subprocess.TimeoutExpired:
        print("❌ D1 query timed out", file=sys.stderr)
        return None
    except (json.JSONDecodeError, KeyError, IndexError) as e:
        print(f"❌ Failed to parse D1 response: {e}", file=sys.stderr)
        return None


def fetch_spore_users(env: str = "production") -> tuple[list[str], list[str], int]:
    """Fetch spore users using day-based slicing strategy.

    Returns (new_users, slice_users, total_old) where:
    - new_users: users created in the last 24 hours
    - slice_users: today's slice of older users (1/7th, using LIMIT/OFFSET)
    - total_old: total count of older spore users
    """
    weekday = datetime.now(timezone.utc).weekday()
    yesterday = int(
        (datetime.now(timezone.utc).timestamp() - 86400) * 1000
    )  # Unix timestamp in milliseconds (matches D1 schema)

    # Get new users (created in last 24h)
    new_query = f"""
        SELECT github_username FROM user
        WHERE tier = 'spore'
        AND github_username IS NOT NULL
        AND created_at > {yesterday}
    """
    new_results = run_d1_query(new_query, env)
    new_users = [r["github_username"] for r in new_results] if new_results else []

    # Count total older users
    count_query = f"""
        SELECT COUNT(*) as count FROM user
        WHERE tier = 'spore'
        AND github_username IS NOT NULL
        AND created_at <= {yesterday}
    """
    count_results = run_d1_query(count_query, env)
    total_old = count_results[0]["count"] if count_results else 0

    # Get today's slice using LIMIT/OFFSET (equal partitions)
    slice_size = (total_old + 6) // 7  # Ceiling division for 7 equal parts
    offset = weekday * slice_size

    slice_query = f"""
        SELECT github_username FROM user
        WHERE tier = 'spore'
        AND github_username IS NOT NULL
        AND created_at <= {yesterday}
        ORDER BY created_at ASC
        LIMIT {slice_size} OFFSET {offset}
    """
    slice_results = run_d1_query(slice_query, env)
    slice_users = [r["github_username"] for r in slice_results] if slice_results else []

    return new_users, slice_users, total_old


def batch_upgrade_users(
    usernames: list[str], env: str = "production"
) -> tuple[int, int, bool]:
    """Upgrade users to seed tier in batch SQL. Returns (upgraded, skipped, failed)."""
    BATCH_SQL_SIZE = 500
    total_upgraded = 0
    total_skipped = 0

    failed = False

    for i in range(0, len(usernames), BATCH_SQL_SIZE):
        batch = usernames[i : i + BATCH_SQL_SIZE]
        # Sanitize: GitHub usernames are [a-zA-Z0-9-] only
        safe_batch = [u for u in batch if re.match(r"^[a-zA-Z0-9-]+$", u)]
        if len(safe_batch) != len(batch):
            print(f"   ⚠️  Skipped {len(batch) - len(safe_batch)} invalid usernames")
        if not safe_batch:
            continue
        username_list = ", ".join(f"'{u}'" for u in safe_batch)

        # Count users that will be skipped (already at higher tier)
        count_query = f"""
            SELECT COUNT(*) as count FROM user
            WHERE github_username IN ({username_list})
            AND tier NOT IN ('spore', 'microbe')
            AND tier IS NOT NULL
        """
        skip_results = run_d1_query(count_query, env)
        skipped = skip_results[0]["count"] if skip_results else 0
        total_skipped += skipped

        # Batch update - only upgrade spore/microbe users
        # tier_balance is NOT set here — the daily cron refill at midnight UTC handles it
        update_query = f"""
            UPDATE user SET tier = 'seed'
            WHERE github_username IN ({username_list})
            AND (tier IN ('spore', 'microbe') OR tier IS NULL)
        """
        result = run_d1_query(update_query, env)

        # run_d1_query returns None on failure
        if result is not None:
            total_upgraded += len(safe_batch) - skipped
        else:
            failed = True
            print(f"   ❌ Batch {i // BATCH_SQL_SIZE + 1} failed")
            continue

        print(
            f"   Batch {i // BATCH_SQL_SIZE + 1}: {len(safe_batch) - skipped} upgraded, {skipped} skipped (higher tier)"
        )

    return total_upgraded, total_skipped, failed


def main():
    parser = argparse.ArgumentParser(description="Upgrade spore users to seed tier")
    parser.add_argument(
        "--dry-run", action="store_true", help="Validate only, no upgrades"
    )
    parser.add_argument(
        "--env",
        choices=["staging", "production"],
        default="production",
        help="Environment",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show detailed score breakdowns"
    )
    args = parser.parse_args()

    weekday = datetime.now(timezone.utc).weekday()
    weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    print("🌱 Spore → Seed Upgrade Script")
    print(f"   Environment: {args.env}")
    print(f"   Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"   Day slice: {weekday_names[weekday]} (slice {weekday + 1}/7)")
    print()

    # Fetch spore users (new + today's slice)
    print("📥 Fetching spore users from D1...")
    new_users, slice_users, total_old = fetch_spore_users(args.env)
    print(f"   New users (last 24h): {len(new_users)}")
    print(f"   Today's slice: {len(slice_users)} (of {total_old} total older users)")

    # Combine: new users first (priority), then slice
    users = new_users + slice_users

    # Apply max limit
    if len(users) > MAX_USERS_PER_RUN:
        print(f"   ⚠️  Limiting to {MAX_USERS_PER_RUN} users (was {len(users)})")
        users = users[:MAX_USERS_PER_RUN]

    print(f"   Total to process: {len(users)}")

    if not new_users and not slice_users:
        print("✅ No spore users to process")
        return 0

    # Phase 1: Validate new users (last 24h)
    new_results = []
    if new_users:
        print(f"\n🔍 Phase 1: Validating {len(new_users)} NEW users (last 24h)...")
        new_results = validate_users(new_users)
        new_approved = sum(1 for r in new_results if r["approved"])
        print(
            f"   ✅ Approved: {new_approved}/{len(new_results)} ({100 * new_approved / len(new_results):.0f}%)"
        )

    # Phase 2: Validate slice of older users
    slice_results = []
    if slice_users:
        print(
            f"\n🔍 Phase 2: Validating {len(slice_users)} SLICE users (day {weekday + 1}/7)..."
        )
        slice_results = validate_users(slice_users)
        slice_approved = sum(1 for r in slice_results if r["approved"])
        print(
            f"   ✅ Approved: {slice_approved}/{len(slice_results)} ({100 * slice_approved / len(slice_results):.0f}%)"
        )

    # Combine results
    results = new_results + slice_results
    approved = [r["username"] for r in results if r["approved"]]
    rejected = [r for r in results if not r["approved"]]

    fraud_rejected = [r for r in results if (r.get("details") or {}).get("fraud_flags")]
    print(f"\n📊 Total: {len(approved)} approved, {len(rejected)} rejected")
    if fraud_rejected:
        print(f"   🚨 Fraud-flagged: {len(fraud_rejected)}")

    if rejected:
        print("\n   Rejected users:")
        for r in rejected[:10]:
            print(f"      {r['username']}: {r['reason']}")
        if len(rejected) > 10:
            print(f"      ... and {len(rejected) - 10} more")

    # Verbose: show score breakdown samples
    if args.verbose:
        print("\n📊 Score breakdown samples (first 20):")
        print(
            f"   {'Username':<25} {'Age':<12} {'Repos':<12} {'Commits':<12} {'Stars':<12} {'Total':<8}"
        )
        print(f"   {'-' * 25} {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 8}")
        for r in results[:20]:
            d = r.get("details")
            if d:
                status = "✅" if r["approved"] else "❌"
                fraud = " 🚨FRAUD" if d.get("fraud_flags") else ""
                print(
                    f"   {r['username']:<25} {d['age_days']:>4}d={d['age_pts']:.1f}pt  {d['repos']:>3}={d['repos_pts']:.1f}pt    {d['commits']:>4}={d['commits_pts']:.1f}pt   {d['stars']:>4}={d['stars_pts']:.1f}pt   {status}{d['total']:.1f}{fraud}"
                )
                if d.get("fraud_flags"):
                    for flag in d["fraud_flags"]:
                        print(f"      🚨 {flag}")
            else:
                print(f"   {r['username']:<25} (not found)")

    if not approved:
        print("\n✅ No users approved for upgrade")
        return 0

    # Upgrade approved users
    if args.dry_run:
        print(f"\n🔍 DRY RUN - would upgrade {len(approved)} users:")
        for username in approved[:20]:
            print(f"   • {username}")
        if len(approved) > 20:
            print(f"   ... and {len(approved) - 20} more")
        return 0

    print(f"\n⬆️  Upgrading {len(approved)} users via batch SQL...")
    upgraded, skipped, had_failures = batch_upgrade_users(approved, args.env)

    print("\n📊 Results:")
    print(f"   ✅ Upgraded: {upgraded}")
    print(f"   ⏭️  Skipped (higher tier): {skipped}")
    if had_failures:
        print("   ❌ Some batches failed — check logs above")

    return 1 if had_failures else 0


if __name__ == "__main__":
    sys.exit(main())
