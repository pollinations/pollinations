#!/usr/bin/env python3
"""Upgrade spore users to seed tier.

Fetches spore users from D1, validates GitHub profiles, and upgrades eligible users.
Can be run locally or via GitHub Actions.

All lookups use github_id (not username) — immune to GitHub account renames.
Strategy: D1 github_id → REST /user/:id (get node_id) → GraphQL node(id:) scoring.

Strategy (stateless, hourly slicing):
    1. Always check users created in the last 8 hours (new users, priority, overlapping window)
    2. For older users, use LIMIT/OFFSET with slot-based slicing (42 slots over 7 days)
       Runs every 4 hours, each run checks 1/42nd of older users.
    3. Fetches 10 repos per user for quality filtering

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
import subprocess
import sys
from datetime import datetime, timezone

from user_validate_github_profile import validate_users, THRESHOLD, SCORING

# Max users to process per run.
# Each user costs 1 REST request to /user/:id (5,000/hour for GitHub App tokens).
# 3 concurrent workers, so ~4,500 keeps us safely under the limit.
MAX_USERS_PER_RUN = 4500


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


def fetch_spore_users(env: str = "production") -> tuple[list[int], list[int], int]:
    """Fetch spore users using hourly slicing strategy.

    Returns (new_ids, slice_ids, total_old) where:
    - new_ids: github_ids of users created in the last 8 hours
    - slice_ids: this slot's slice of older users (1/42nd, cycling weekly)
    - total_old: total count of older spore users
    """
    now = datetime.now(timezone.utc)
    # 42 slices = 7 days × 6 runs/day (every 4h), all users checked once per week
    slot = now.weekday() * 6 + now.hour // 4
    total_slots = 42
    recent_cutoff = int(
        (now.timestamp() - 8 * 3600) * 1000
    )  # 8 hours ago in ms — overlaps previous run so missed slots don't lose users

    # Get new users (created in last 8 hours)
    new_query = f"""
        SELECT github_id FROM user
        WHERE tier = 'spore'
        AND github_id IS NOT NULL
        AND created_at > {recent_cutoff}
    """
    new_results = run_d1_query(new_query, env)
    new_ids = [r["github_id"] for r in new_results] if new_results else []

    # Count total older users
    count_query = f"""
        SELECT COUNT(*) as count FROM user
        WHERE tier = 'spore'
        AND github_id IS NOT NULL
        AND created_at <= {recent_cutoff}
    """
    count_results = run_d1_query(count_query, env)
    total_old = count_results[0]["count"] if count_results else 0

    # Get this hour's slice using LIMIT/OFFSET
    slice_size = (total_old + total_slots - 1) // total_slots
    offset = slot * slice_size

    slice_query = f"""
        SELECT github_id FROM user
        WHERE tier = 'spore'
        AND github_id IS NOT NULL
        AND created_at <= {recent_cutoff}
        ORDER BY created_at ASC
        LIMIT {slice_size} OFFSET {offset}
    """
    slice_results = run_d1_query(slice_query, env)
    slice_ids = [r["github_id"] for r in slice_results] if slice_results else []

    return new_ids, slice_ids, total_old


def batch_upgrade_users(
    github_ids: list[int], env: str = "production"
) -> tuple[int, int, bool]:
    """Upgrade users to seed tier in batch SQL using github_id. Returns (upgraded, skipped, failed)."""
    BATCH_SQL_SIZE = 500
    total_upgraded = 0
    total_skipped = 0

    failed = False

    for i in range(0, len(github_ids), BATCH_SQL_SIZE):
        batch = github_ids[i : i + BATCH_SQL_SIZE]
        # Sanitize: github_id must be a positive integer
        safe_batch = [gid for gid in batch if isinstance(gid, int) and gid > 0]
        if len(safe_batch) != len(batch):
            print(f"   ⚠️  Skipped {len(batch) - len(safe_batch)} invalid github_ids")
        if not safe_batch:
            continue
        id_list = ", ".join(str(gid) for gid in safe_batch)

        # Count users that will be skipped (already at higher tier)
        count_query = f"""
            SELECT COUNT(*) as count FROM user
            WHERE github_id IN ({id_list})
            AND tier NOT IN ('spore', 'microbe')
            AND tier IS NOT NULL
        """
        skip_results = run_d1_query(count_query, env)
        skipped = skip_results[0]["count"] if skip_results else 0
        total_skipped += skipped

        # Batch update - only upgrade spore/microbe users
        # tier_balance is NOT set here — the hourly cron refill handles it
        update_query = f"""
            UPDATE user SET tier = 'seed'
            WHERE github_id IN ({id_list})
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


def _display_name(r: dict) -> str:
    """Get display name for a result: login if available, else github_id."""
    return r.get("login") or str(r.get("github_id", "?"))


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

    now = datetime.now(timezone.utc)
    slot = now.weekday() * 6 + now.hour // 4

    print("🌱 Spore → Seed Upgrade Script")
    print(f"   Environment: {args.env}")
    print(f"   Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"   Threshold: {THRESHOLD} pts")
    print(f"   Slot: {slot}/42 ({now.strftime('%a %H:00')} UTC)")
    print()

    # Fetch spore users (new + this slot's slice)
    print("📥 Fetching spore users from D1...")
    new_ids, slice_ids, total_old = fetch_spore_users(args.env)
    print(f"   New users (last 8h): {len(new_ids)}")
    print(f"   Slot slice: {len(slice_ids)} (of {total_old} total older users)")

    # Combine: new users first (priority), then slice — apply cap to combined list
    all_ids = new_ids + slice_ids

    if len(all_ids) > MAX_USERS_PER_RUN:
        print(f"   ⚠️  Limiting to {MAX_USERS_PER_RUN} users (was {len(all_ids)})")
        all_ids = all_ids[:MAX_USERS_PER_RUN]

    # Re-split after cap, preserving priority order (new users first)
    capped_new_count = min(len(new_ids), len(all_ids))
    new_ids = all_ids[:capped_new_count]
    slice_ids = all_ids[capped_new_count:]

    print(f"   Total to process: {len(all_ids)}")

    if not all_ids:
        print("✅ No spore users to process")
        return 0

    # Phase 1: Validate new users (last 8h)
    new_results = []
    if new_ids:
        print(f"\n🔍 Phase 1: Validating {len(new_ids)} NEW users (last 8h)...")
        new_results = validate_users(new_ids)
        new_approved = sum(1 for r in new_results if r["approved"])
        print(
            f"   ✅ Approved: {new_approved}/{len(new_results)} ({100 * new_approved / len(new_results):.0f}%)"
        )

    # Phase 2: Validate slice of older users
    slice_results = []
    if slice_ids:
        print(
            f"\n🔍 Phase 2: Validating {len(slice_ids)} SLICE users (slot {slot}/42)..."
        )
        slice_results = validate_users(slice_ids)
        slice_approved = sum(1 for r in slice_results if r["approved"])
        print(
            f"   ✅ Approved: {slice_approved}/{len(slice_results)} ({100 * slice_approved / len(slice_results):.0f}%)"
        )

    # Combine results
    results = new_results + slice_results
    approved = [r for r in results if r["approved"]]
    rejected = [r for r in results if not r["approved"]]

    not_found = [r for r in results if not r.get("details")]
    scored = [r for r in results if r.get("details")]

    approved_ids = [r["github_id"] for r in approved if r.get("github_id")]

    print(f"\n📊 Summary: {len(approved)} approved, {len(rejected)} rejected (threshold {THRESHOLD})")
    print(f"   Scored: {len(scored)} | Not found: {len(not_found)}")

    # Score distribution
    if scored:
        from collections import Counter

        buckets = Counter()
        for r in scored:
            buckets[int(r["details"]["total"])] += 1
        dist = " | ".join(
            f"{k}pts:{buckets[k]}" for k in sorted(buckets.keys())
        )
        print(f"   Score distribution: {dist}")

    # All approved users with scores
    if approved:
        top = sorted(
            [r for r in scored if r["approved"]],
            key=lambda r: -r["details"]["total"],
        )
        print(f"\n   ✅ All approved ({len(approved)}):")
        for r in top:
            d = r["details"]
            name = _display_name(r)
            print(f"      {name:<25} {d['total']:.1f}pts  (age={d['age_pts']:.1f} repos={d['repos_pts']:.1f} commits={d['commits_pts']:.1f} stars={d['stars_pts']:.1f})")

    # Borderline rejected (close to threshold)
    borderline = sorted(
        [r for r in scored if not r["approved"] and r["details"]["total"] >= THRESHOLD - 1.5],
        key=lambda r: -r["details"]["total"],
    )
    if borderline:
        print(f"\n   ⚠️  Borderline rejected ({len(borderline)}, within 1.5pts of threshold):")
        for r in borderline[:20]:
            d = r["details"]
            name = _display_name(r)
            print(f"      {name:<25} {d['total']:.1f}pts  (age={d['age_pts']:.1f} repos={d['repos_pts']:.1f} commits={d['commits_pts']:.1f} stars={d['stars_pts']:.1f})")
        if len(borderline) > 20:
            print(f"      ... and {len(borderline) - 20} more")

    # Not found on GitHub
    if not_found:
        print(f"\n   👻 Not found on GitHub ({len(not_found)}):")
        for r in not_found[:20]:
            print(f"      {_display_name(r)}")
        if len(not_found) > 20:
            print(f"      ... and {len(not_found) - 20} more")

    # Sample low-score rejected
    low_score = [r for r in scored if not r["approved"] and r["details"]["total"] < THRESHOLD - 1.5]
    if low_score:
        print(f"\n   Sample low-score rejected ({len(low_score)} total):")
        for r in low_score[:5]:
            print(f"      {_display_name(r)}: {r['reason']}")
        if len(low_score) > 5:
            print(f"      ... and {len(low_score) - 5} more")

    # Verbose: show score breakdown samples
    if args.verbose:
        print("\n📊 Score breakdown samples (first 20):")
        print(
            f"   {'User':<25} {'Age':<12} {'Repos':<12} {'Commits':<12} {'Stars':<12} {'Total':<8}"
        )
        print(f"   {'-' * 25} {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 8}")
        for r in results[:20]:
            d = r.get("details")
            if d:
                status = "✅" if r["approved"] else "❌"
                name = _display_name(r)
                print(
                    f"   {name:<25} {d['age_days']:>4}d={d['age_pts']:.1f}pt  {d['repos']:>3}={d['repos_pts']:.1f}pt    {d['commits']:>4}={d['commits_pts']:.1f}pt   {d['stars']:>4}={d['stars_pts']:.1f}pt   {status}{d['total']:.1f}"
                )
            else:
                print(f"   {_display_name(r):<25} (not found)")

    if not approved_ids:
        print("\n✅ No users approved for upgrade")
        return 0

    # Upgrade approved users
    if args.dry_run:
        print(f"\n🔍 DRY RUN - would upgrade {len(approved_ids)} users:")
        for r in approved[:20]:
            print(f"   • {_display_name(r)}")
        if len(approved) > 20:
            print(f"   ... and {len(approved) - 20} more")
        return 0

    print(f"\n⬆️  Upgrading {len(approved_ids)} users via batch SQL...")
    upgraded, skipped, had_failures = batch_upgrade_users(approved_ids, args.env)

    print("\n📊 Results:")
    print(f"   ✅ Upgraded: {upgraded}")
    print(f"   ⏭️  Skipped (higher tier): {skipped}")
    if had_failures:
        print("   ❌ Some batches failed — check logs above")

    return 1 if had_failures else 0


if __name__ == "__main__":
    sys.exit(main())
