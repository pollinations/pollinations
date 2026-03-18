#!/usr/bin/env python3
"""Daily spore recheck for seed tier eligibility.

This is the steady-state weekly rotation job:
  - select unbanned spore users
  - order by oldest score_checked_at
  - recheck the oldest ceil(total_spores / 7)
  - persist score and score_checked_at
  - keep suspicious GitHub profiles at spore
  - upgrade qualified non-suspicious users to seed immediately
"""

import argparse
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_ROOT / "shared"))
from python_runtime import ensure_python_bin

ensure_python_bin()

sys.path.insert(0, str(SCRIPT_ROOT / "scoring"))

from d1 import ensure_safe_env, run_d1_query
from github_account_state import (
    D1_BATCH_SIZE,
    GITHUB_USERNAME_RE,
    ban_github_ids,
    ban_users_by_emails,
    extract_deleted_github_ids,
)
from github_score import validate_user_records

MAX_USERS_PER_RUN = 8000
SQL_BATCH_SIZE = 200
SEED_TIER_BALANCE = 3.0


def load_email_cohort(file_path: str | None) -> list[str] | None:
    if not file_path:
        return None

    try:
        content = Path(file_path).read_text(encoding="utf-8")
    except OSError as error:
        print(f"❌ Failed to read --emails-file {file_path}: {error}", file=sys.stderr)
        sys.exit(1)

    emails = list(
        dict.fromkeys(
            line.strip()
            for line in content.splitlines()
            if line.strip() and not line.strip().startswith("#")
        )
    )
    if not emails:
        print(f"❌ --emails-file {file_path} did not contain any emails.", file=sys.stderr)
        sys.exit(1)
    return emails


def build_email_filter(emails: list[str] | None) -> str:
    if not emails:
        return ""
    values = ", ".join("'" + email.replace("'", "''") + "'" for email in emails)
    return f" AND email IN ({values})"


def fetch_spore_count(env: str, cohort_emails: list[str] | None = None) -> int:
    email_filter = build_email_filter(cohort_emails)
    results = run_d1_query(
        f"""
        SELECT COUNT(*) as count
        FROM user
        WHERE tier = 'spore'
        AND COALESCE(banned, 0) = 0
        {email_filter}
        """,
        env,
    )
    if results is None:
        raise RuntimeError("Failed to fetch current spore count from D1")
    if not results:
        return 0
    return int(results[0]["count"])


def fetch_spore_slice(
    env: str, cohort_emails: list[str] | None = None
) -> tuple[list[dict], int, int]:
    total_spores = fetch_spore_count(env, cohort_emails)
    if total_spores == 0:
        return [], 0, 0

    slice_size = math.ceil(total_spores / 7)
    slice_size = min(slice_size, MAX_USERS_PER_RUN)
    email_filter = build_email_filter(cohort_emails)

    results = run_d1_query(
        f"""
        SELECT email, github_id, github_username
        FROM user
        WHERE tier = 'spore'
        AND COALESCE(banned, 0) = 0
        {email_filter}
        ORDER BY score_checked_at ASC, created_at ASC, email ASC
        LIMIT {slice_size}
        """,
        env,
    )
    if results is None:
        raise RuntimeError("Failed to fetch spore recheck slice from D1")
    return results or [], total_spores, slice_size


def store_scores(results: list[dict], env: str) -> tuple[int, int]:
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    stored = 0
    skipped = 0

    for index in range(0, len(results), SQL_BATCH_SIZE):
        batch = results[index : index + SQL_BATCH_SIZE]
        sanitized_batch = []
        for result in batch:
            username = result.get("username")
            github_id = result.get("github_id")
            if not isinstance(username, str) or not GITHUB_USERNAME_RE.match(username):
                skipped += 1
                continue
            if not isinstance(github_id, int) or github_id <= 0:
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
        id_list = ", ".join(str(github_id) for github_id, _username, _score in sanitized_batch)
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

    return stored, skipped


def extract_risk_blocked_github_ids(results: list[dict]) -> list[int]:
    return list(
        dict.fromkeys(
            result["github_id"]
            for result in results
            if result.get("risk_status") == "suspicious"
            and isinstance(result.get("github_id"), int)
        )
    )


def upgrade_users(github_ids: list[int], env: str) -> tuple[int, bool]:
    total_upgraded = 0
    failed = False

    for i in range(0, len(github_ids), D1_BATCH_SIZE):
        batch = github_ids[i : i + D1_BATCH_SIZE]
        safe_batch = [
            github_id
            for github_id in batch
            if isinstance(github_id, int) and not isinstance(github_id, bool) and github_id > 0
        ]
        if not safe_batch:
            continue

        id_list = ", ".join(str(github_id) for github_id in safe_batch)
        update_query = f"""
            UPDATE user
            SET tier = 'seed', tier_balance = {SEED_TIER_BALANCE}
            WHERE github_id IN ({id_list})
            AND tier = 'spore'
        """
        result = run_d1_query(update_query, env)
        if result is None:
            failed = True
            print(f"   ❌ Batch {i // D1_BATCH_SIZE + 1} failed")
            continue

        total_upgraded += len(safe_batch)

    return total_upgraded, failed


def summarize(results: list[dict]) -> None:
    approved = [result for result in results if result.get("approved")]
    rejected = [result for result in results if not result.get("approved")]
    suspicious = [
        result for result in results if result.get("risk_status") == "suspicious"
    ]

    print("\n📊 Validation summary:")
    print(f"   Approved by score: {len(approved)}")
    print(f"   Rejected by score: {len(rejected)}")
    print(f"   Suspicious GitHub profiles: {len(suspicious)}")

    if results:
        average_score = sum(
            float((result.get("details") or {}).get("total", 0)) for result in results
        ) / len(results)
        print(f"   Average score: {average_score:.2f}")


def main() -> int:
    try:
        parser = argparse.ArgumentParser(description="Daily spore recheck for seed tier")
        parser.add_argument(
            "--dry-run", action="store_true", help="Validate only, no writes"
        )
        parser.add_argument(
            "--env",
            choices=["staging"],
            default="staging",
            help="Environment",
        )
        parser.add_argument(
            "--verbose", "-v", action="store_true", help="Show detailed score breakdowns"
        )
        parser.add_argument(
            "--emails-file",
            help="Only process emails listed in a newline-separated file",
        )
        args = parser.parse_args()

        env = ensure_safe_env(args.env)
        cohort_emails = load_email_cohort(args.emails_file)

        print("🌱 Daily Spore Recheck")
        print(f"   Environment: {env}")
        print(f"   Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
        if cohort_emails:
            print(f"   Email cohort: {len(cohort_emails)} users")

        rows, total_spores, slice_size = fetch_spore_slice(env, cohort_emails)
        print(f"   Total spores: {total_spores}")
        print(f"   Daily target: {slice_size}")
        print(f"   Selected users: {len(rows)}")

        if not rows:
            print("✅ No spore users to process")
            return 0

        invalid_email_rows = [
            row for row in rows if not isinstance(row.get("github_id"), int)
        ]
        valid_rows = [row for row in rows if isinstance(row.get("github_id"), int)]

        if invalid_email_rows:
            if args.dry_run:
                print(
                    f"🚫 Dry run would ban {len(invalid_email_rows)} spore users with missing/invalid GitHub IDs"
                )
            else:
                banned = ban_users_by_emails(
                    [
                        row["email"]
                        for row in invalid_email_rows
                        if isinstance(row.get("email"), str)
                    ],
                    env,
                )
                print(
                    f"🚫 Banned {banned} spore users with missing/invalid GitHub IDs"
                )

        if not valid_rows:
            print("✅ No valid spore users left for GitHub scoring")
            return 0

        results = validate_user_records(valid_rows)
        results_by_github_id = {
            result["github_id"]: result
            for result in results
            if isinstance(result.get("github_id"), int)
        }
        ordered_results = [
            results_by_github_id[row["github_id"]]
            for row in valid_rows
            if row["github_id"] in results_by_github_id
        ]

        deleted_github_ids = extract_deleted_github_ids(ordered_results)
        deleted_github_id_set = set(deleted_github_ids)
        scoreable_results = [
            result
            for result in ordered_results
            if isinstance(result.get("github_id"), int)
            and result["github_id"] not in deleted_github_id_set
        ]
        risk_blocked_github_ids = extract_risk_blocked_github_ids(scoreable_results)
        risk_blocked_set = set(risk_blocked_github_ids)
        approved_github_ids = [
            result["github_id"]
            for result in scoreable_results
            if result.get("approved")
            and isinstance(result.get("github_id"), int)
            and result["github_id"] not in risk_blocked_set
        ]

        summarize(ordered_results)

        if args.verbose:
            print("\n📊 Score breakdown samples (first 20):")
            for result in ordered_results[:20]:
                score = float((result.get("details") or {}).get("total", 0))
                flags = ", ".join(result.get("risk_flags") or [])
                suffix = f" | risk: {flags}" if flags else ""
                print(f"   {result['username']}: {score:.1f} ({result['reason']}){suffix}")

        if args.dry_run:
            if deleted_github_ids:
                print(
                    f"\n🚫 Dry run would ban {len(deleted_github_ids)} users with deleted/invalid GitHub accounts"
                )
            if risk_blocked_github_ids:
                print(
                    f"🚩 Dry run would keep {len(risk_blocked_github_ids)} users at spore due to suspicious GitHub profiles"
                )
            print(f"🌱 Dry run would upgrade {len(approved_github_ids)} users to seed")
            return 0

        if deleted_github_ids:
            banned = ban_github_ids(deleted_github_ids, env)
            print(f"\n🚫 Banned {banned} users with deleted/invalid GitHub accounts")

        stored, skipped = store_scores(scoreable_results, env)
        upgraded, had_failures = upgrade_users(approved_github_ids, env)

        print("\n📊 Results:")
        print(f"   Scores stored: {stored}")
        print(f"   Risk-blocked from seed: {len(risk_blocked_github_ids)}")
        print(f"   Upgraded to seed: {upgraded}")
        if skipped:
            print(f"   Skipped invalid usernames: {skipped}")
        if had_failures:
            print("   ❌ Some upgrade batches failed")

        return 1 if had_failures else 0
    except Exception as error:
        print(f"❌ {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
