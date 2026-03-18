#!/usr/bin/env python3
"""Prepare a staging cohort and replay the hourly new-user pipeline on it."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_ROOT / "shared"))
from python_runtime import ensure_python_bin

ensure_python_bin()

from d1 import ensure_safe_env, run_d1_query

WORKDIR = Path(__file__).resolve().parents[3]
REPO_ROOT = WORKDIR.parent
DOTENV_PATH = REPO_ROOT / ".env"


def load_email_cohort(file_path: str) -> list[str]:
    try:
        content = Path(file_path).read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"Failed to read --emails-file {file_path}: {error}") from error

    emails = list(
        dict.fromkeys(
            line.strip()
            for line in content.splitlines()
            if line.strip() and not line.strip().startswith("#")
        )
    )
    if not emails:
        raise RuntimeError(f"--emails-file {file_path} did not contain any emails.")
    return emails


def build_email_filter(emails: list[str]) -> str:
    values = ", ".join("'" + email.replace("'", "''") + "'" for email in emails)
    return f"email IN ({values})"


def count_cohort_users(env: str, emails: list[str]) -> int:
    results = run_d1_query(
        f"SELECT COUNT(*) AS count FROM user WHERE {build_email_filter(emails)}",
        env,
    )
    if results is None:
        raise RuntimeError("Failed to count replay cohort users in D1")
    if not results:
        return 0
    return int(results[0]["count"])


def prepare_cohort(env: str, emails: list[str]) -> None:
    result = run_d1_query(
        f"""
        UPDATE user
        SET
            tier = 'microbe',
            tier_balance = 0,
            trust_score = NULL,
            score = NULL,
            score_checked_at = NULL,
            banned = 0,
            ban_reason = NULL,
            ban_expires = NULL
        WHERE {build_email_filter(emails)}
        """,
        env,
    )
    if result is None:
        raise RuntimeError("Failed to prepare hourly replay cohort in D1")


def print_summary(env: str, emails: list[str]) -> None:
    results = run_d1_query(
        f"""
        SELECT
            SUM(CASE WHEN tier = 'microbe' THEN 1 ELSE 0 END) AS microbe_count,
            SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) AS spore_count,
            SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) AS seed_count,
            SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) AS banned_count,
            SUM(CASE WHEN trust_score >= 60 THEN 1 ELSE 0 END) AS trusted_count,
            SUM(CASE WHEN trust_score < 60 AND trust_score IS NOT NULL THEN 1 ELSE 0 END) AS blocked_count
        FROM user
        WHERE {build_email_filter(emails)}
        """,
        env,
    )
    if not results:
        print("⚠️ No summary rows returned")
        return

    row = results[0]
    print("\n📊 Cohort summary:")
    print(f"   Microbe: {row.get('microbe_count', 0)}")
    print(f"   Spore: {row.get('spore_count', 0)}")
    print(f"   Seed: {row.get('seed_count', 0)}")
    print(f"   Banned: {row.get('banned_count', 0)}")
    print(f"   Trust >= 60: {row.get('trusted_count', 0)}")
    print(f"   Trust < 60: {row.get('blocked_count', 0)}")


def load_dotenv_env() -> dict[str, str]:
    env = os.environ.copy()
    if not DOTENV_PATH.exists():
        return env

    for raw_line in DOTENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith(("'", '"')) and value.endswith(("'", '"')) and len(value) >= 2:
            value = value[1:-1]
        env.setdefault(key, value)

    key_path = env.get("GITHUB_APP_PRIVATE_KEY_PATH")
    if key_path and not Path(key_path).exists():
        repo_pem = next(REPO_ROOT.glob("*.pem"), None)
        if repo_pem is not None:
            env["GITHUB_APP_PRIVATE_KEY_PATH"] = str(repo_pem)
        else:
            env.pop("GITHUB_APP_PRIVATE_KEY_PATH", None)
            env.pop("GITHUB_APP_ID", None)
    return env


def run_command(command: list[str], env: dict[str, str]) -> None:
    subprocess.run(command, cwd=WORKDIR, env=env, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare a staging cohort and replay the hourly new-user pipeline"
    )
    parser.add_argument(
        "--env",
        choices=["staging"],
        default="staging",
        help="Environment",
    )
    parser.add_argument(
        "--emails-file",
        required=True,
        help="Newline-separated list of cohort emails",
    )
    parser.add_argument(
        "--skip-prepare",
        action="store_true",
        help="Skip resetting the cohort before replaying the pipeline",
    )
    parser.add_argument(
        "--hourly-dry-run",
        action="store_true",
        help="Run the hourly tier step in dry-run mode after the live trust gate",
    )
    args = parser.parse_args()

    env = ensure_safe_env(args.env)
    emails = load_email_cohort(args.emails_file)
    cohort_size = count_cohort_users(env, emails)

    print("🧪 Replay Hourly New-User Pipeline")
    print(f"   Environment: {env}")
    print(f"   Cohort file: {args.emails_file}")
    print(f"   Cohort size: {cohort_size}")

    if cohort_size == 0:
        print("❌ No users matched the supplied emails on staging", file=sys.stderr)
        return 1

    child_env = load_dotenv_env()

    if not args.skip_prepare:
        print("\n🛠️ Preparing cohort for hourly replay...")
        prepare_cohort(env, emails)
    else:
        print("\n⏭️ Skipping cohort preparation")

    print("\n🔍 Running trust gate...")
    run_command(
        [
            "npm",
            "run",
            "user-pipeline:trust-score",
            "--",
            "--env",
            env,
            "--parallel",
            "3",
            "--store-status",
            "--emails-file",
            args.emails_file,
        ],
        child_env,
    )

    print("\n🌱 Running hourly new-user pipeline...")
    command = [
        "npm",
        "run",
        "user-pipeline:hourly-new-users",
        "--",
        "--env",
        env,
        "--emails-file",
        args.emails_file,
    ]
    if args.hourly_dry_run:
        command.append("--dry-run")
    run_command(command, child_env)

    print_summary(env, emails)
    return 0


if __name__ == "__main__":
    sys.exit(main())
