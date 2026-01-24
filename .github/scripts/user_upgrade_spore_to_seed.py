#!/usr/bin/env python3
"""Upgrade spore users to seed tier.

Fetches spore users from D1, validates GitHub profiles, and upgrades eligible users.
Can be run locally or via GitHub Actions.

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
import time

from user_validate_github_profile import validate_users

# Delay between upgrades to avoid overwhelming D1
UPGRADE_DELAY_SECONDS = 0.5


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
    
    # Step 1: Fetch spore users
    print("📥 Fetching spore users from D1...")
    users = fetch_spore_users(args.env)
    print(f"   Found {len(users)} spore users")
    
    if not users:
        print("✅ No spore users to process")
        return 0
    
    # Step 2: Validate GitHub profiles
    print(f"\n🔍 Validating {len(users)} GitHub profiles (batches of 50)...")
    results = validate_users(users)
    
    approved = [r["username"] for r in results if r["approved"]]
    rejected = [r for r in results if not r["approved"]]
    
    print(f"   ✅ Approved: {len(approved)}")
    print(f"   ❌ Rejected: {len(rejected)}")
    
    if rejected:
        print("\n   Rejected users:")
        for r in rejected[:10]:  # Show first 10
            print(f"      {r['username']}: {r['reason']}")
        if len(rejected) > 10:
            print(f"      ... and {len(rejected) - 10} more")
    
    if not approved:
        print("\n✅ No users approved for upgrade")
        return 0
    
    # Step 3: Upgrade approved users
    if args.dry_run:
        print(f"\n🔍 DRY RUN - would upgrade {len(approved)} users:")
        for u in approved[:20]:
            print(f"   • {u}")
        if len(approved) > 20:
            print(f"   ... and {len(approved) - 20} more")
        return 0
    
    print(f"\n⬆️  Upgrading {len(approved)} users...")
    success = 0
    failed = 0
    
    for i, username in enumerate(approved):
        if upgrade_user(username, args.env):
            success += 1
        else:
            failed += 1
        # Small delay between upgrades
        if i < len(approved) - 1:
            time.sleep(UPGRADE_DELAY_SECONDS)
    
    print(f"\n📊 Results:")
    print(f"   ✅ Upgraded: {success}")
    print(f"   ❌ Failed: {failed}")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
