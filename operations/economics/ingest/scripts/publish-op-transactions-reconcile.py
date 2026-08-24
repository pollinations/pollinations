#!/usr/bin/env python3

import argparse
import asyncio
import json
import tempfile
from datetime import datetime
from pathlib import Path

from tinybird.client import TinyB

from publisher_safety import (
    assert_base_versions,
    assert_newer_versions,
    assert_opening_balance_integrity,
    latest_version_query,
    validate_recorded_at,
)


HOST = "https://api.europe-west2.gcp.tinybird.co"
WORKSPACES = {
    "staging": "pollinations_enter_staging",
    "production": "pollinations_enter",
}
FIELDS = [
    "entry_id",
    "kind",
    "source",
    "date",
    "vendor",
    "category",
    "amount",
    "currency",
    "description",
    "evidence",
]
DATASOURCE_FIELDS = [*FIELDS, "recorded_at"]
KINDS = {"transaction", "opening_balance"}


def arguments():
    parser = argparse.ArgumentParser(
        description="Append reviewed op_transactions facts and verify every row."
    )
    parser.add_argument("environment", choices=WORKSPACES)
    parser.add_argument("input", type=Path)
    parser.add_argument("before_snapshot", type=Path)
    parser.add_argument("after_snapshot", type=Path)
    parser.add_argument("--verify-only", action="store_true")
    return parser.parse_args()


def read_ndjson(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    ids = [row["entry_id"] for row in rows]
    if not rows or len(ids) != len(set(ids)):
        raise RuntimeError("Input must contain unique op_transactions entry IDs")

    invalid_kinds = [row["entry_id"] for row in rows if row.get("kind") not in KINDS]
    if invalid_kinds:
        raise RuntimeError(
            "Transactions require kind=transaction|opening_balance: "
            + ", ".join(invalid_kinds)
        )

    invalid_dates = []
    for row in rows:
        try:
            datetime.strptime(str(row.get("date", "")), "%Y-%m-%d")
        except ValueError:
            invalid_dates.append(row["entry_id"])
    if invalid_dates:
        raise RuntimeError(
            "Transactions require YYYY-MM-DD dates: " + ", ".join(invalid_dates)
        )

    opening_rows = [row for row in rows if row["kind"] == "opening_balance"]
    opening_dates = {row.get("date") for row in opening_rows}
    if len(opening_dates) > 1:
        raise RuntimeError("Opening balances must share one statement date")
    if opening_rows and not str(opening_rows[0].get("date", "")).endswith("-01"):
        raise RuntimeError("Opening balance date must be the first day of a month")
    opening_currencies = [row.get("currency") for row in opening_rows]
    if len(opening_currencies) != len(set(opening_currencies)):
        raise RuntimeError("Opening balances require at most one row per currency")
    invalid_opening = [
        row["entry_id"]
        for row in opening_rows
        if row.get("source") != "wise"
        or row.get("vendor") != "wise"
        or row.get("category") != "balance_sheet"
        or abs(float(row.get("amount", 0))) < 0.000000001
    ]
    if invalid_opening:
        raise RuntimeError(
            "Opening balances require Wise source/vendor and balance_sheet category: "
            + ", ".join(invalid_opening)
        )
    validate_recorded_at(rows)
    return rows


async def client_for(workspace_name, *, append=False):
    repo = Path(__file__).resolve().parents[4]
    config = json.loads((repo / "enter.pollinations.ai/observability/.tinyb").read_text())
    user = TinyB(token=config["user_token"], host=HOST)
    workspaces = (await user.user_workspaces_and_branches(version="v1"))["workspaces"]
    workspace = next(item for item in workspaces if item["name"] == workspace_name)
    admin = TinyB(token=workspace["token"], host=HOST)
    if not append:
        return admin
    token = (await admin.get_token_by_name("operations_ingest"))["token"]
    return TinyB(token=token, host=HOST)


async def effective_rows(client):
    query = """
        SELECT
            entry_id,
            kind,
            source,
            formatDateTime(date, '%F') AS date,
            vendor,
            category,
            amount,
            currency,
            description,
            evidence,
            formatDateTime(latest_recorded_at, '%F %T.%f') AS recorded_at
        FROM
        (
            SELECT
                entry_id,
                argMax(kind, recorded_at) AS kind,
                argMax(source, recorded_at) AS source,
                argMax(date, recorded_at) AS date,
                argMax(vendor, recorded_at) AS vendor,
                argMax(category, recorded_at) AS category,
                argMax(amount, recorded_at) AS amount,
                argMax(currency, recorded_at) AS currency,
                argMax(description, recorded_at) AS description,
                argMax(evidence, recorded_at) AS evidence,
                max(recorded_at) AS latest_recorded_at
            FROM op_transactions
            GROUP BY entry_id
        )
        ORDER BY date DESC, vendor, entry_id
        FORMAT JSON
    """
    return (await client.query(query))["data"]


async def latest_rows(client, entry_ids):
    quoted = ",".join("'" + value.replace("'", "''") + "'" for value in entry_ids)
    query = f"""
        SELECT
            entry_id,
            argMax(kind, recorded_at) AS kind,
            argMax(source, recorded_at) AS source,
            formatDateTime(argMax(date, recorded_at), '%F') AS date,
            argMax(vendor, recorded_at) AS vendor,
            argMax(category, recorded_at) AS category,
            argMax(amount, recorded_at) AS amount,
            argMax(currency, recorded_at) AS currency,
            argMax(description, recorded_at) AS description,
            argMax(evidence, recorded_at) AS evidence
        FROM op_transactions
        WHERE entry_id IN ({quoted})
        GROUP BY entry_id
        FORMAT JSON
    """
    return (await client.query(query))["data"]


async def current_versions(client, entry_ids):
    return (
        await client.query(latest_version_query("op_transactions", entry_ids))
    )["data"]


def equal_value(expected, actual):
    if isinstance(expected, (int, float)):
        return abs(float(expected) - float(actual)) < 0.000000001
    return ("" if expected is None else str(expected)) == (
        "" if actual is None else str(actual)
    )


def verify(expected_rows, actual_rows):
    actual_by_id = {row["entry_id"]: row for row in actual_rows}
    errors = []
    for expected in expected_rows:
        actual = actual_by_id.get(expected["entry_id"])
        if not actual:
            errors.append(f"missing {expected['entry_id']}")
            continue
        for field in FIELDS:
            if not equal_value(expected.get(field, ""), actual.get(field, "")):
                errors.append(f"{expected['entry_id']} differs in {field}")
    if errors:
        raise RuntimeError("Verification failed: " + "; ".join(errors))


def write_snapshot(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"data": rows}, indent=2) + "\n")


def append_input_path(rows, temporary_directory):
    path = Path(temporary_directory) / "op-transactions.ndjson"
    path.write_text(
        "".join(
            json.dumps({key: value for key, value in row.items() if key in DATASOURCE_FIELDS})
            + "\n"
            for row in rows
        )
    )
    return path


async def main():
    args = arguments()
    expected = read_ndjson(args.input.resolve())
    workspace_name = WORKSPACES[args.environment]
    admin = await client_for(workspace_name)
    before = await effective_rows(admin)
    write_snapshot(args.before_snapshot.resolve(), before)

    result = {}
    if not args.verify_only:
        assert_opening_balance_integrity(expected, before)
        versions = await current_versions(
            admin, [row["entry_id"] for row in expected]
        )
        assert_base_versions(expected, versions)
        assert_newer_versions(
            expected,
            versions,
        )
        append = await client_for(workspace_name, append=True)
        with tempfile.TemporaryDirectory() as temporary_directory:
            append_path = append_input_path(expected, temporary_directory)
            result = await append.datasource_append_data(
                "op_transactions", append_path, mode="append", format="ndjson"
            )
        if result.get("error"):
            raise RuntimeError(f"Tinybird append failed: {result['error']}")

    actual = []
    for attempt in range(6):
        actual = await latest_rows(admin, [row["entry_id"] for row in expected])
        try:
            verify(expected, actual)
            break
        except RuntimeError:
            if attempt == 5:
                raise
            await asyncio.sleep(1)

    after = await effective_rows(admin)
    write_snapshot(args.after_snapshot.resolve(), after)
    print(
        json.dumps(
            {
                "environment": args.environment,
                "rows_appended": 0 if args.verify_only else len(expected),
                "rows_verified": len(actual),
                "effective_rows_before": len(before),
                "effective_rows_after": len(after),
                "quarantine_rows": result.get("quarantine_rows", 0),
                "invalid_lines": result.get("invalid_lines", 0),
            }
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
