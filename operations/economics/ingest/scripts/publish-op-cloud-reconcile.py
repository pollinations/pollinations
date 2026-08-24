#!/usr/bin/env python3

import argparse
import json
import tempfile
import time
from pathlib import Path

from tinybird.tb.client import TinyB

from publisher_safety import (
    assert_base_versions,
    assert_explicit_tombstones,
    assert_newer_versions,
    assert_production_confirmation,
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
    "source",
    "start",
    "end",
    "vendor",
    "account_id",
    "account_name",
    "type",
    "model",
    "credit",
    "paid",
    "currency",
    "evidence",
    "resource_sku",
    "resource_count",
    "resource_id",
    "resource_name",
]
OPTIONAL_FIELDS = {"account_id", "account_name"}


def arguments():
    parser = argparse.ArgumentParser(
        description="Append a reviewed op_cloud correction and verify every row."
    )
    parser.add_argument("environment", choices=WORKSPACES)
    parser.add_argument("input", type=Path)
    parser.add_argument("before_snapshot", type=Path)
    parser.add_argument("after_snapshot", type=Path)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--confirm-production", action="store_true")
    return parser.parse_args()


def read_ndjson(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    ids = [row["entry_id"] for row in rows]
    if not rows or len(ids) != len(set(ids)):
        raise RuntimeError("Input must contain unique op_cloud entry IDs")
    validate_recorded_at(rows)
    assert_explicit_tombstones(rows, ["credit", "paid"])
    return rows


def client_for(workspace_name, *, append=False):
    repo = Path(__file__).resolve().parents[4]
    config = json.loads((repo / "enter.pollinations.ai/observability/.tinyb").read_text())
    user = TinyB(token=config["user_token"], host=HOST)
    workspaces = user.user_workspaces_and_branches(version="v1")["workspaces"]
    workspace = next(item for item in workspaces if item["name"] == workspace_name)
    admin = TinyB(token=workspace["token"], host=HOST)
    if not append:
        return admin
    token = admin.get_token_by_name("operations_ingest")["token"]
    return TinyB(token=token, host=HOST)


def datasource_fields(client):
    query = """
        SELECT name
        FROM system.columns
        WHERE table = 'op_cloud'
        FORMAT JSON
    """
    fields = {row["name"] for row in client.query(query)["data"]}
    missing = set(FIELDS) - OPTIONAL_FIELDS - fields
    if missing:
        raise RuntimeError(f"op_cloud is missing required fields: {sorted(missing)}")
    return fields


def account_selects(fields):
    outer = ""
    inner = ""
    for field in ("account_id", "account_name"):
        if field not in fields:
            continue
        outer += f",\n            ifNull({field}, '') AS {field}"
        inner += f",\n                argMax({field}, recorded_at) AS {field}"
    return outer, inner


def effective_rows(client, fields):
    account_outer, account_inner = account_selects(fields)
    query = f"""
        SELECT
            entry_id, source, start, end, vendor{account_outer},
            type, model, credit, paid, currency, evidence,
            formatDateTime(latest_recorded_at, '%F %T.%f') AS recorded_at,
            resource_sku, resource_count, resource_id, resource_name
        FROM
        (
            SELECT
                entry_id,
                argMax(source, recorded_at) AS source,
                argMax(start, recorded_at) AS start,
                argMax(end, recorded_at) AS end,
                argMax(vendor, recorded_at) AS vendor{account_inner},
                argMax(type, recorded_at) AS type,
                argMax(model, recorded_at) AS model,
                argMax(credit, recorded_at) AS credit,
                argMax(paid, recorded_at) AS paid,
                argMax(currency, recorded_at) AS currency,
                argMax(evidence, recorded_at) AS evidence,
                argMax(resource_sku, recorded_at) AS resource_sku,
                argMax(resource_count, recorded_at) AS resource_count,
                argMax(resource_id, recorded_at) AS resource_id,
                argMax(resource_name, recorded_at) AS resource_name,
                max(recorded_at) AS latest_recorded_at
            FROM op_cloud
            GROUP BY entry_id
        )
        WHERE source != 'tombstone'
        ORDER BY start DESC, vendor, type, resource_name, resource_id
        FORMAT JSON
    """
    return client.query(query)["data"]


def latest_rows(client, entry_ids, fields):
    quoted = ",".join("'" + value.replace("'", "''") + "'" for value in entry_ids)
    account_fields = "".join(
        f",\n            ifNull(argMax({field}, recorded_at), '') AS {field}"
        for field in ("account_id", "account_name")
        if field in fields
    )
    query = f"""
        SELECT
            entry_id,
            argMax(source, recorded_at) AS source,
            argMax(start, recorded_at) AS start,
            argMax(end, recorded_at) AS end,
            argMax(vendor, recorded_at) AS vendor{account_fields},
            argMax(type, recorded_at) AS type,
            argMax(model, recorded_at) AS model,
            argMax(credit, recorded_at) AS credit,
            argMax(paid, recorded_at) AS paid,
            argMax(currency, recorded_at) AS currency,
            argMax(evidence, recorded_at) AS evidence,
            argMax(resource_sku, recorded_at) AS resource_sku,
            argMax(resource_count, recorded_at) AS resource_count,
            argMax(resource_id, recorded_at) AS resource_id,
            argMax(resource_name, recorded_at) AS resource_name
        FROM op_cloud
        WHERE entry_id IN ({quoted})
        GROUP BY entry_id
        FORMAT JSON
    """
    return client.query(query)["data"]


def current_versions(client, entry_ids):
    return client.query(latest_version_query("op_cloud", entry_ids))["data"]


def equal_value(expected, actual):
    if isinstance(expected, (int, float)):
        return abs(float(expected) - float(actual)) < 0.000000001
    return ("" if expected is None else str(expected)) == (
        "" if actual is None else str(actual)
    )


def verify(expected_rows, actual_rows, fields):
    actual_by_id = {row["entry_id"]: row for row in actual_rows}
    errors = []
    for expected in expected_rows:
        actual = actual_by_id.get(expected["entry_id"])
        if not actual:
            errors.append(f"missing {expected['entry_id']}")
            continue
        for field in FIELDS:
            if field not in fields:
                continue
            if not equal_value(expected.get(field, ""), actual.get(field, "")):
                errors.append(f"{expected['entry_id']} differs in {field}")
    if errors:
        raise RuntimeError("Verification failed: " + "; ".join(errors))


def write_snapshot(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"data": rows}, indent=2) + "\n")


def append_input_path(rows, fields, temporary_directory):
    path = Path(temporary_directory) / "op-cloud.ndjson"
    path.write_text(
        "".join(
            json.dumps({key: value for key, value in row.items() if key in fields})
            + "\n"
            for row in rows
        )
    )
    return path


def main():
    args = arguments()
    assert_production_confirmation(
        args.environment, args.verify_only, args.confirm_production
    )
    input_path = args.input.resolve()
    expected = read_ndjson(input_path)
    workspace_name = WORKSPACES[args.environment]
    admin = client_for(workspace_name)
    fields = datasource_fields(admin)

    before = effective_rows(admin, fields)
    write_snapshot(args.before_snapshot.resolve(), before)

    result = {}
    if not args.verify_only:
        versions = current_versions(
            admin, [row["entry_id"] for row in expected]
        )
        assert_base_versions(expected, versions)
        assert_newer_versions(
            expected,
            versions,
        )
        append = client_for(workspace_name, append=True)
        with tempfile.TemporaryDirectory() as temporary_directory:
            append_path = append_input_path(expected, fields, temporary_directory)
            result = append.datasource_append_data(
                "op_cloud", append_path, mode="append", format="ndjson"
            )
        if result.get("error"):
            raise RuntimeError(f"Tinybird append failed: {result['error']}")

    actual = []
    for attempt in range(6):
        actual = latest_rows(
            admin, [row["entry_id"] for row in expected], fields
        )
        try:
            verify(expected, actual, fields)
            break
        except RuntimeError:
            if attempt == 5:
                raise
            time.sleep(1)
    after = effective_rows(admin, fields)
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
    main()
