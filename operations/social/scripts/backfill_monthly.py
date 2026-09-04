#!/usr/bin/env python3
"""Backfill website monthly build-diary artifacts into a news checkout."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from generate_monthly import (
    MONTHLY_REL_DIR,
    generate_monthly_artifacts,
    read_daily_summaries,
)

FIRST_HISTORY_MONTH = "2025-01"


def parse_month(value: str) -> str:
    try:
        datetime.strptime(value, "%Y-%m")
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected YYYY-MM") from error
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill monthly website build-diary summaries and covers."
    )
    parser.add_argument(
        "--start-month",
        type=parse_month,
        default=FIRST_HISTORY_MONTH,
        help=f"first month to inspect (default: {FIRST_HISTORY_MONTH})",
    )
    parser.add_argument(
        "--end-month",
        type=parse_month,
        default=datetime.now(timezone.utc).strftime("%Y-%m"),
        help="last month to inspect (default: current UTC month)",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        required=True,
        help="checkout containing the news branch artifact tree",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report missing artifacts without generating or writing files",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="process at most this many incomplete months",
    )
    return parser.parse_args()


def iter_months(start: str, end: str):
    cursor = datetime.strptime(start, "%Y-%m")
    final = datetime.strptime(end, "%Y-%m")
    while cursor <= final:
        yield cursor.strftime("%Y-%m")
        year = cursor.year + (1 if cursor.month == 12 else 0)
        month = 1 if cursor.month == 12 else cursor.month + 1
        cursor = cursor.replace(year=year, month=month)


def artifact_paths(output_root: Path, month: str) -> tuple[Path, Path]:
    base = output_root / MONTHLY_REL_DIR / month
    return base / "summary.json", base / "images" / "cover.jpg"


def main() -> None:
    args = parse_args()
    if args.start_month < FIRST_HISTORY_MONTH:
        raise SystemExit(
            f"start month cannot precede supported history {FIRST_HISTORY_MONTH}"
        )
    if args.end_month < args.start_month:
        raise SystemExit("end month must be on or after start month")

    pending = []
    for month in iter_months(args.start_month, args.end_month):
        summaries = read_daily_summaries(month, str(args.output_root))
        if not summaries:
            continue
        summary_path, image_path = artifact_paths(args.output_root, month)
        if summary_path.exists() and image_path.exists():
            continue
        pending.append((month, summaries, summary_path, image_path))

    print(f"Pending: {len(pending)} months")
    for month, summaries, summary_path, image_path in pending:
        missing = []
        if not summary_path.exists():
            missing.append("summary")
        if not image_path.exists():
            missing.append("image")
        pr_count = sum(int(summary.get("pr_count") or 0) for summary in summaries)
        print(
            f"  {month}: {len(summaries)} active days, {pr_count} PRs; "
            f"missing {', '.join(missing)}"
        )

    if args.dry_run or not pending:
        return

    token = os.getenv("POLLINATIONS_TOKEN")
    if not token:
        raise SystemExit("POLLINATIONS_TOKEN is required unless --dry-run is used")

    selected = pending[: args.limit] if args.limit else pending
    failures = []
    for month, summaries, summary_path, image_path in selected:
        print(f"\n[{month}] Generating monthly build diary")
        try:
            summary, image_bytes = generate_monthly_artifacts(month, summaries, token)
        except RuntimeError as error:
            failures.append(month)
            print(f"  Failed: {error}")
            continue
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(
            json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        image_path.write_bytes(image_bytes)
        print(f"  Wrote {summary_path}")
        print(f"  Wrote {image_path}")

    completed = len(selected) - len(failures)
    print(f"\nCompleted {completed} months.")
    if failures:
        raise SystemExit(f"Failed months: {', '.join(failures)}")


if __name__ == "__main__":
    main()
