#!/usr/bin/env python3

import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path

from tinybird.client import TinyB

from publisher_safety import (
    assert_newer_versions,
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
    "month",
    "vendor",
    "category",
    "amount",
    "currency",
    "method",
    "source",
    "evidence",
]
FORECAST_METHODS = {"fixed", "funded", "last", "one_off", "canceled"}
FORECAST_CURRENCIES = {"EUR", "USD"}
FORECAST_CATEGORIES = {
    "revenue",
    "compute",
    "infrastructure",
    "development",
    "operations",
    "office",
    "admin",
    "payroll",
    "balance_sheet",
}


def arguments():
    parser = argparse.ArgumentParser(
        description="Append reviewed op_forecast facts and verify every row."
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
        raise RuntimeError("Input must contain unique op_forecast entry IDs")
    invalid_categories = [
        row["entry_id"]
        for row in rows
        if str(row.get("category", "")).strip() not in FORECAST_CATEGORIES
    ]
    if invalid_categories:
        raise RuntimeError(
            "Forecast rows require canonical categories: "
            + ", ".join(invalid_categories)
        )
    invalid_methods = [
        row["entry_id"]
        for row in rows
        if str(row.get("method", "")).strip() not in FORECAST_METHODS
    ]
    if invalid_methods:
        raise RuntimeError(
            "Forecast rows require a structured method: "
            + ", ".join(invalid_methods)
        )
    invalid_currencies = [
        row["entry_id"]
        for row in rows
        if str(row.get("currency", "")).strip().upper() not in FORECAST_CURRENCIES
    ]
    if invalid_currencies:
        raise RuntimeError(
            "Forecast rows require EUR or USD currency: "
            + ", ".join(invalid_currencies)
        )
    invalid_months = []
    for row in rows:
        try:
            month = datetime.strptime(str(row.get("month", "")), "%Y-%m-%d")
        except ValueError:
            invalid_months.append(row["entry_id"])
            continue
        if month.day != 1:
            invalid_months.append(row["entry_id"])
    if invalid_months:
        raise RuntimeError(
            "Forecast months must be first-of-month YYYY-MM-01 dates: "
            + ", ".join(invalid_months)
        )
    invalid_zeroes = [
        row["entry_id"]
        for row in rows
        if abs(float(row.get("amount", 0))) < 0.000000001
        and row.get("method") not in {"funded", "canceled"}
    ]
    if invalid_zeroes:
        raise RuntimeError(
            "Only funded or canceled forecast rows may carry a zero amount: "
            + ", ".join(invalid_zeroes)
        )
    invalid_cancellations = [
        row["entry_id"]
        for row in rows
        if row.get("method") == "canceled"
        and abs(float(row.get("amount", 0))) >= 0.000000001
    ]
    if invalid_cancellations:
        raise RuntimeError(
            "Canceled forecast rows must carry a zero amount: "
            + ", ".join(invalid_cancellations)
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
            formatDateTime(month, '%F') AS month,
            vendor,
            category,
            amount,
            currency,
            method,
            source,
            evidence,
            formatDateTime(latest_recorded_at, '%F %T.%f') AS recorded_at
        FROM
        (
            SELECT
                entry_id,
                argMax(month, recorded_at) AS month,
                argMax(vendor, recorded_at) AS vendor,
                argMax(category, recorded_at) AS category,
                argMax(amount, recorded_at) AS amount,
                argMax(currency, recorded_at) AS currency,
                argMax(method, recorded_at) AS method,
                argMax(source, recorded_at) AS source,
                argMax(evidence, recorded_at) AS evidence,
                max(recorded_at) AS latest_recorded_at
            FROM op_forecast
            GROUP BY entry_id
        )
        ORDER BY month, vendor, entry_id
        FORMAT JSON
    """
    return (await client.query(query))["data"]


async def latest_rows(client, entry_ids):
    quoted = ",".join("'" + value.replace("'", "''") + "'" for value in entry_ids)
    query = f"""
        SELECT
            entry_id,
            formatDateTime(argMax(month, recorded_at), '%F') AS month,
            argMax(vendor, recorded_at) AS vendor,
            argMax(category, recorded_at) AS category,
            argMax(amount, recorded_at) AS amount,
            argMax(currency, recorded_at) AS currency,
            argMax(method, recorded_at) AS method,
            argMax(source, recorded_at) AS source,
            argMax(evidence, recorded_at) AS evidence
        FROM op_forecast
        WHERE entry_id IN ({quoted})
        GROUP BY entry_id
        FORMAT JSON
    """
    return (await client.query(query))["data"]


async def current_versions(client, entry_ids):
    return (
        await client.query(latest_version_query("op_forecast", entry_ids))
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


async def main():
    args = arguments()
    expected = read_ndjson(args.input.resolve())
    workspace_name = WORKSPACES[args.environment]
    admin = await client_for(workspace_name)
    before = await effective_rows(admin)
    write_snapshot(args.before_snapshot.resolve(), before)

    result = {}
    if not args.verify_only:
        assert_newer_versions(
            expected,
            await current_versions(admin, [row["entry_id"] for row in expected]),
        )
        append = await client_for(workspace_name, append=True)
        result = await append.datasource_append_data(
            "op_forecast", args.input.resolve(), mode="append", format="ndjson"
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
