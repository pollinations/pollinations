#!/usr/bin/env python3
"""Upgrade spore users to seed tier.

Fetches spore users from D1, validates GitHub profiles, and upgrades eligible users.
Can be run locally or via GitHub Actions.

Features:
- Checkpoint/resume support for long-running operations
- Rate limit handling with automatic backoff
- Results summary for GitHub Actions

Usage:
    python user_upgrade_spore_to_seed.py              # Full run
    python user_upgrade_spore_to_seed.py --dry-run    # Validate only, no upgrades
    python user_upgrade_spore_to_seed.py --env staging  # Use staging environment

Environment variables:
    GITHUB_TOKEN           - Required for GitHub API
    CLOUDFLARE_API_TOKEN   - Required for wrangler D1 access
    CLOUDFLARE_ACCOUNT_ID  - Required for wrangler D1 access
    POLAR_ACCESS_TOKEN     - Required for Polar subscription updates
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from user_validate_github_profile import validate_users

# Polar rate limit: 100 requests/minute, so ~0.6s delay minimum
POLAR_DELAY_SECONDS = 1.0

# File paths for checkpoint and results
SCRIPT_DIR = Path(__file__).parent
CHECKPOINT_FILE = SCRIPT_DIR / "upgrade_checkpoint.json"
RESULTS_FILE = SCRIPT_DIR / "upgrade_results.json"


def load_checkpoint() -> dict:
    """Load checkpoint from previous run if exists."""
    if CHECKPOINT_FILE.exists():
        try:
            with open(CHECKPOINT_FILE) as f:
                checkpoint = json.load(f)
                print(f"📥 Loaded checkpoint: {len(checkpoint.get('validated', []))} validated, {len(checkpoint.get('upgraded', []))} upgraded")
                return checkpoint
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️ Failed to load checkpoint: {e}")
    return {}


def save_checkpoint(data: dict):
    """Save checkpoint for resume capability."""
    try:
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except IOError as e:
        print(f"⚠️ Failed to save checkpoint: {e}")


def save_results(data: dict):
    """Save results for GitHub Actions summary."""
    try:
        with open(RESULTS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except IOError as e:
        print(f"⚠️ Failed to save results: {e}")


def fetch_spore_users(env: str = "production") -> list[str]:
    """Fetch spore users from D1 database via wrangler."""
    env_flag = "--env production" if env == "production" else "--env staging"
    db_name = "DB"

    cmd = [
        "npx", "wrangler", "d1", "execute", db_name, "--remote",
        *env_flag.split(),
        "--command", "SELECT github_username FROM user WHERE tier = 'spore' AND github_username IS NOT NULL",
        "--json"
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=os.path.join(os.path.dirname(__file__), "../../enter.pollinations.ai"),
            timeout=60
        )

        if result.returncode != 0:
            print(f"❌ D1 query failed: {result.stderr}", file=sys.stderr)
            return []

        data = json.loads(result.stdout)
        users = [row["github_username"] for row in data[0].get("results", [])]
        return users

    except subprocess.TimeoutExpired:
        print("❌ D1 query timed out", file=sys.stderr)
        return []
    except (json.JSONDecodeError, KeyError, IndexError) as e:
        print(f"❌ Failed to parse D1 response: {e}", file=sys.stderr)
        return []


def upgrade_user(username: str, env: str = "production") -> bool:
    """Upgrade a single user to seed tier via tsx script."""
    env_flag = "--env"
    env_value = "production" if env == "production" else "staging"

    cmd = [
        "npx", "tsx", "scripts/tier-update-user.ts",
        "update-tier",
        "--githubUsername", username,
        "--tier", "seed",
        env_flag, env_value
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=os.path.join(os.path.dirname(__file__), "../../enter.pollinations.ai"),
            timeout=120
        )

        # Check for skip (user already at higher tier)
        if "SKIP_UPGRADE=true" in result.stdout:
            print(f"   ⏭️  {username}: already at higher tier")
            return True

        if result.returncode == 0:
            print(f"   ✅ {username}: upgraded to seed")
            # Show Polar output if any
            if result.stdout.strip():
                for line in result.stdout.strip().split('\n'):
                    print(f"      {line}")
            return True
        else:
            print(f"   ❌ {username}: failed")
            # Show both stdout and stderr for debugging
            if result.stdout.strip():
                for line in result.stdout.strip().split('\n'):
                    print(f"      {line}")
            if result.stderr.strip():
                for line in result.stderr.strip().split('\n'):
                    print(f"      {line}", file=sys.stderr)
            return False

    except subprocess.TimeoutExpired:
        print(f"   ❌ {username}: upgrade timed out", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Upgrade spore users to seed tier")
    parser.add_argument("--dry-run", action="store_true", help="Validate only, no upgrades")
    parser.add_argument("--env", choices=["staging", "production"], default="production", help="Environment")
    args = parser.parse_args()

    print(f"🌱 Spore → Seed Upgrade Script")
    print(f"   Environment: {args.env}")
    print(f"   Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print()

    # Initialize results tracking
    results = {
        "total_spore": 0,
        "validated": 0,
        "approved": 0,
        "upgraded": 0,
        "failed": 0,
        "skipped": 0,
        "rate_limited": False,
    }

    # Load checkpoint if exists
    checkpoint = load_checkpoint()
    already_validated = set(checkpoint.get("validated", []))
    already_upgraded = set(checkpoint.get("upgraded", []))

    # Step 1: Fetch spore users
    print("📥 Fetching spore users from D1...")
    all_users = fetch_spore_users(args.env)
    results["total_spore"] = len(all_users)
    print(f"   Found {len(all_users)} spore users")

    if not all_users:
        print("✅ No spore users to process")
        save_results(results)
        return 0

    # Filter out already validated users
    users_to_validate = [u for u in all_users if u not in already_validated]

    if users_to_validate:
        print(f"\n🔍 Validating {len(users_to_validate)} GitHub profiles (batches of 50)...")
        if already_validated:
            print(f"   (Skipping {len(already_validated)} already validated from checkpoint)")

        validation_results = validate_users(users_to_validate)
    else:
        print(f"\n⏭️ All {len(all_users)} users already validated (from checkpoint)")
        validation_results = []

    # Merge with checkpoint data
    all_validation_results = checkpoint.get("validation_results", []) + validation_results

    approved = [r["username"] for r in all_validation_results if r["approved"]]
    rejected = [r for r in all_validation_results if not r["approved"]]

    results["validated"] = len(all_validation_results)
    results["approved"] = len(approved)

    print(f"\n📊 Validation Summary:")
    print(f"   ✅ Approved: {len(approved)}")
    print(f"   ❌ Rejected: {len(rejected)}")

    if rejected:
        print("\n   Sample rejected users:")
        for r in rejected[:10]:  # Show first 10
            print(f"      {r['username']}: {r['reason']}")
        if len(rejected) > 10:
            print(f"      ... and {len(rejected) - 10} more")

    # Save checkpoint after validation
    checkpoint["validated"] = list(already_validated | set(u for u in users_to_validate))
    checkpoint["validation_results"] = all_validation_results
    save_checkpoint(checkpoint)

    if not approved:
        print("\n✅ No users approved for upgrade")
        save_results(results)
        return 0

    # Step 3: Upgrade approved users
    if args.dry_run:
        print(f"\n🔍 DRY RUN - would upgrade {len(approved)} users:")
        for u in approved[:20]:
            print(f"   • {u}")
        if len(approved) > 20:
            print(f"   ... and {len(approved) - 20} more")
        save_results(results)
        return 0

    # Filter out already upgraded users
    users_to_upgrade = [u for u in approved if u not in already_upgraded]
    results["skipped"] = len(already_upgraded)

    if not users_to_upgrade:
        print(f"\n⏭️ All {len(approved)} approved users already upgraded (from checkpoint)")
        results["upgraded"] = len(already_upgraded)
        save_results(results)
        return 0

    print(f"\n⬆️  Upgrading {len(users_to_upgrade)} users...")
    if already_upgraded:
        print(f"   (Skipping {len(already_upgraded)} already upgraded from checkpoint)")

    success = len(already_upgraded)
    failed = 0
    upgraded_users = list(already_upgraded)

    for i, username in enumerate(users_to_upgrade):
        try:
            if upgrade_user(username, args.env):
                success += 1
                upgraded_users.append(username)
            else:
                failed += 1
        except Exception as e:
            print(f"   ❌ {username}: exception - {e}")
            failed += 1

        # Save checkpoint periodically (every 50 users)
        if (i + 1) % 50 == 0:
            checkpoint["upgraded"] = upgraded_users
            save_checkpoint(checkpoint)
            print(f"   💾 Checkpoint saved ({success} upgraded, {failed} failed)")

        # Rate limit for Polar API (100 req/min)
        if i < len(users_to_upgrade) - 1:
            time.sleep(POLAR_DELAY_SECONDS)

    # Final checkpoint save
    checkpoint["upgraded"] = upgraded_users
    save_checkpoint(checkpoint)

    results["upgraded"] = success
    results["failed"] = failed
    save_results(results)

    print(f"\n📊 Final Results:")
    print(f"   ✅ Upgraded: {success}")
    print(f"   ❌ Failed: {failed}")
    if results["skipped"]:
        print(f"   ⏭️  Skipped (from checkpoint): {results['skipped']}")

    # Clean up checkpoint on successful completion
    if failed == 0:
        try:
            CHECKPOINT_FILE.unlink(missing_ok=True)
            print("\n🧹 Checkpoint cleaned up (all users processed)")
        except IOError:
            pass

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
