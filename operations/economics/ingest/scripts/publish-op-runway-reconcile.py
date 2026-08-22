#!/usr/bin/env python3

import argparse
import json
import time
from pathlib import Path

from tinybird.tb.client import TinyB


HOST = "https://api.europe-west2.gcp.tinybird.co"
WORKSPACES = {
    "staging": "pollinations_enter_staging",
    "production": "pollinations_enter",
}
FIELDS = [
    "entry_id",
    "kind",
    "date",
    "vendor",
    "category",
    "amount",
    "currency",
    "source",
    "evidence",
]


def arguments():
    parser = argparse.ArgumentParser(
        description="Append reviewed op_runway facts and verify every row."
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
        raise RuntimeError("Input must contain unique op_runway entry IDs")
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


def effective_rows(client):
    query = """
        SELECT
            entry_id,
            kind,
            formatDateTime(date, '%F') AS date,
            vendor,
            category,
            amount,
            currency,
            source,
            evidence,
            formatDateTime(latest_recorded_at, '%F %T.%f') AS recorded_at
        FROM
        (
            SELECT
                entry_id,
                argMax(kind, recorded_at) AS kind,
                argMax(date, recorded_at) AS date,
                argMax(vendor, recorded_at) AS vendor,
                argMax(category, recorded_at) AS category,
                argMax(amount, recorded_at) AS amount,
                argMax(currency, recorded_at) AS currency,
                argMax(source, recorded_at) AS source,
                argMax(evidence, recorded_at) AS evidence,
                max(recorded_at) AS latest_recorded_at
            FROM op_runway
            GROUP BY entry_id
        )
        ORDER BY date, kind, vendor, entry_id
        FORMAT JSON
    """
    return client.query(query)["data"]


def latest_rows(client, entry_ids):
    quoted = ",".join("'" + value.replace("'", "''") + "'" for value in entry_ids)
    query = f"""
        SELECT
            entry_id,
            argMax(kind, recorded_at) AS kind,
            formatDateTime(argMax(date, recorded_at), '%F') AS date,
            argMax(vendor, recorded_at) AS vendor,
            argMax(category, recorded_at) AS category,
            argMax(amount, recorded_at) AS amount,
            argMax(currency, recorded_at) AS currency,
            argMax(source, recorded_at) AS source,
            argMax(evidence, recorded_at) AS evidence
        FROM op_runway
        WHERE entry_id IN ({quoted})
        GROUP BY entry_id
        FORMAT JSON
    """
    return client.query(query)["data"]


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


def main():
    args = arguments()
    expected = read_ndjson(args.input.resolve())
    workspace_name = WORKSPACES[args.environment]
    admin = client_for(workspace_name)
    before = effective_rows(admin)
    write_snapshot(args.before_snapshot.resolve(), before)

    result = {}
    if not args.verify_only:
        append = client_for(workspace_name, append=True)
        result = append.datasource_append_data(
            "op_runway", args.input.resolve(), mode="append", format="ndjson"
        )
        if result.get("error"):
            raise RuntimeError(f"Tinybird append failed: {result['error']}")

    actual = []
    for attempt in range(6):
        actual = latest_rows(admin, [row["entry_id"] for row in expected])
        try:
            verify(expected, actual)
            break
        except RuntimeError:
            if attempt == 5:
                raise
            time.sleep(1)

    after = effective_rows(admin)
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
