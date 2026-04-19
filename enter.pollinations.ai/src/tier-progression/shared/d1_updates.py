"""Shared D1 mutation helpers for tier progression flows."""

import json
import os
import subprocess
import sys


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
            cwd=os.path.join(os.path.dirname(__file__), "../../.."),
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
    except (json.JSONDecodeError, KeyError, IndexError) as error:
        print(f"❌ Failed to parse D1 response: {error}", file=sys.stderr)
        return None


def batch_upgrade_users(
    github_ids: list[int], env: str = "production"
) -> tuple[int, int, bool]:
    """Upgrade users to seed tier in batch SQL using github_id."""
    batch_sql_size = 500
    total_upgraded = 0
    total_skipped = 0
    failed = False

    for index in range(0, len(github_ids), batch_sql_size):
        batch = github_ids[index : index + batch_sql_size]
        safe_batch = [gid for gid in batch if isinstance(gid, int) and gid > 0]
        if len(safe_batch) != len(batch):
            print(f"   ⚠️  Skipped {len(batch) - len(safe_batch)} invalid github_ids")
        if not safe_batch:
            continue
        id_list = ", ".join(str(gid) for gid in safe_batch)

        count_query = f"""
            SELECT COUNT(*) as count FROM user
            WHERE github_id IN ({id_list})
            AND tier NOT IN ('spore', 'microbe')
            AND tier IS NOT NULL
        """
        skip_results = run_d1_query(count_query, env)
        skipped = skip_results[0]["count"] if skip_results else 0
        total_skipped += skipped

        update_query = f"""
            UPDATE user SET tier = 'seed'
            WHERE github_id IN ({id_list})
            AND (tier IN ('spore', 'microbe') OR tier IS NULL)
        """
        result = run_d1_query(update_query, env)
        if result is not None:
            total_upgraded += len(safe_batch) - skipped
        else:
            failed = True
            print(f"   ❌ Batch {index // batch_sql_size + 1} failed")
            continue

        print(
            f"   Batch {index // batch_sql_size + 1}: {len(safe_batch) - skipped} upgraded, {skipped} skipped (higher tier)"
        )

    return total_upgraded, total_skipped, failed


def ban_deleted_accounts(
    github_ids: list[int], env: str = "production"
) -> tuple[int, bool]:
    """Ban users whose GitHub accounts were deleted."""
    batch_sql_size = 500
    total_banned = 0
    failed = False

    for index in range(0, len(github_ids), batch_sql_size):
        batch = github_ids[index : index + batch_sql_size]
        safe_batch = [gid for gid in batch if isinstance(gid, int) and gid > 0]
        if not safe_batch:
            continue
        id_list = ", ".join(str(gid) for gid in safe_batch)

        query = f"""
            UPDATE user SET banned = 1, ban_reason = 'github_account_deleted'
            WHERE github_id IN ({id_list})
            AND (banned = 0 OR banned IS NULL)
        """
        result = run_d1_query(query, env)
        if result is not None:
            total_banned += len(safe_batch)
        else:
            failed = True
            print(f"   ❌ Ban batch {index // batch_sql_size + 1} failed")

    return total_banned, failed
