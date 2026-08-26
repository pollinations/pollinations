#!/usr/bin/env python3

import argparse
import asyncio
import hashlib
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from tinybird.client import TinyB


HOST = "https://api.europe-west2.gcp.tinybird.co"
PRODUCTION = "pollinations_enter"
STAGING = "pollinations_enter_staging"
SOURCE_PIPE = "economics_pollen_usage_api"
TARGET_DATASOURCE = "economics_pollen_usage_snapshot"
TARGET_PIPE = "economics_pollen_usage_snapshot_api"
METRICS = [
    "cost_paid",
    "cost_quests",
    "price_paid",
    "price_quests",
    "byop_paid",
    "byop_quests",
    "model_paid",
    "model_quests",
    "requests_paid",
    "requests_quests",
]
COUNT_METRICS = {"requests_paid", "requests_quests"}


def arguments():
    parser = argparse.ArgumentParser(
        description=(
            "Copy finalized production Pollen economics into the versioned "
            "staging snapshot and verify exact endpoint equality."
        )
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--staging-deployment",
        help="Read an unpromoted staging endpoint for a dry-run.",
    )
    return parser.parse_args()


def key(row):
    return row["month"], row["vendor"], row["model"]


def entry_id(row):
    return "snapshot:" + ":".join(key(row))


def numeric(row, field):
    return int(row[field]) if field in COUNT_METRICS else float(row[field])


def equivalent(left, right):
    return all(
        (
            numeric(left, field) == numeric(right, field)
            if field in COUNT_METRICS
            else abs(numeric(left, field) - numeric(right, field))
            <= max(1e-8, abs(numeric(left, field)) * 1e-10)
        )
        for field in METRICS
    )


def snapshot_row(row, recorded_at):
    return {
        "entry_id": entry_id(row),
        "month": row["month"],
        "vendor": row["vendor"],
        "model": row["model"],
        "currency": row["currency"],
        **{field: numeric(row, field) for field in METRICS},
        "source": f"{PRODUCTION}/{SOURCE_PIPE}",
        "recorded_at": recorded_at,
    }


def zero_row(row, recorded_at):
    return {
        "entry_id": entry_id(row),
        "month": row["month"],
        "vendor": row["vendor"],
        "model": row["model"],
        "currency": row["currency"],
        **{field: 0 for field in METRICS},
        "source": f"{PRODUCTION}/{SOURCE_PIPE}:removed",
        "recorded_at": recorded_at,
    }


def write_verified_backup(path, payload):
    encoded = (json.dumps(payload, indent=2) + "\n").encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded)
    first_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    decoded = json.loads(path.read_text())
    second_hash = hashlib.sha256(
        (json.dumps(decoded, indent=2) + "\n").encode()
    ).hexdigest()
    if first_hash != second_hash or decoded != payload:
        raise RuntimeError(f"Backup verification failed: {path}")
    return first_hash


async def workspace_clients():
    repo = Path(__file__).resolve().parents[4]
    config = json.loads(
        (repo / "enter.pollinations.ai/observability/.tinyb").read_text()
    )
    user = TinyB(token=config["user_token"], host=HOST)
    workspaces = (await user.user_workspaces_and_branches(version="v1"))[
        "workspaces"
    ]
    production = next(item for item in workspaces if item["name"] == PRODUCTION)
    staging = next(item for item in workspaces if item["name"] == STAGING)
    return (
        TinyB(token=production["token"], host=HOST),
        TinyB(token=staging["token"], host=HOST),
    )


async def pipe_rows(client, pipe, deployment=None):
    params = {"__tb__deployment": deployment} if deployment else None
    return (await client.pipe_data(pipe, params=params)).get("data", [])


async def main():
    args = arguments()
    if args.apply and args.staging_deployment:
        raise RuntimeError("--staging-deployment is dry-run only")
    production, staging = await workspace_clients()
    source = await pipe_rows(production, SOURCE_PIPE)
    current = await pipe_rows(staging, TARGET_PIPE, args.staging_deployment)
    source_by_key = {key(row): row for row in source}
    current_by_key = {key(row): row for row in current}
    if len(source_by_key) != len(source) or len(current_by_key) != len(current):
        raise RuntimeError("Snapshot endpoints must have unique month/vendor/model keys")

    recorded_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    updates = [
        snapshot_row(row, recorded_at)
        for row_key, row in source_by_key.items()
        if row_key not in current_by_key
        or not equivalent(row, current_by_key[row_key])
    ]
    updates.extend(
        zero_row(row, recorded_at)
        for row_key, row in current_by_key.items()
        if row_key not in source_by_key
    )

    summary = {
        "production_rows": len(source),
        "staging_rows_before": len(current),
        "updates": len(updates),
        "apply": args.apply,
    }
    if not args.apply:
        print(json.dumps(summary, separators=(",", ":")))
        return

    repo = Path(__file__).resolve().parents[4]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = (
        repo
        / "operations/economics/ingest/data/backups"
        / f"{timestamp}-economics-pollen-staging-sync"
    )
    source_hash = write_verified_backup(
        backup / "production-source.json", {"data": source}
    )
    staging_hash = write_verified_backup(
        backup / "staging-before.json", {"data": current}
    )

    if updates:
        ingest_token = (await staging.get_token_by_name("operations_ingest"))[
            "token"
        ]
        append = TinyB(token=ingest_token, host=HOST)
        with tempfile.TemporaryDirectory() as temporary_directory:
            payload = Path(temporary_directory) / "snapshot.ndjson"
            payload.write_text(
                "".join(json.dumps(row) + "\n" for row in updates)
            )
            result = await append.datasource_append_data(
                TARGET_DATASOURCE,
                payload,
                mode="append",
                format="ndjson",
            )
        if result.get("error"):
            raise RuntimeError(f"Tinybird append failed: {result['error']}")

    after = await pipe_rows(staging, TARGET_PIPE)
    after_by_key = {key(row): row for row in after}
    missing = sorted(set(source_by_key) - set(after_by_key))
    extra = sorted(set(after_by_key) - set(source_by_key))
    changed = sorted(
        row_key
        for row_key in set(source_by_key) & set(after_by_key)
        if not equivalent(source_by_key[row_key], after_by_key[row_key])
    )
    if missing or extra or changed:
        raise RuntimeError(
            "Snapshot verification failed: "
            f"missing={missing[:5]}, extra={extra[:5]}, changed={changed[:5]}"
        )
    after_hash = write_verified_backup(
        backup / "staging-after.json", {"data": after}
    )
    print(
        json.dumps(
            {
                **summary,
                "staging_rows_after": len(after),
                "backup": str(backup),
                "backup_hashes": [source_hash, staging_hash, after_hash],
                "verified": True,
            },
            separators=(",", ":"),
        )
    )


asyncio.run(main())
