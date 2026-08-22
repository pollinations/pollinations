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
METRICS = [
    "cost_paid",
    "cost_quests",
    "price_paid",
    "price_quests",
    "requests_paid",
    "requests_quests",
    "byop_paid",
    "byop_quests",
    "model_paid",
    "model_quests",
]
HISTORY_FIELDS = [
    "entry_id",
    "month",
    "provider",
    "model",
    *METRICS,
    "evidence",
    "reason",
]


def arguments():
    parser = argparse.ArgumentParser(
        description="Append reviewed op_pollen_history rows and verify the endpoint."
    )
    parser.add_argument("environment", choices=WORKSPACES)
    parser.add_argument("input", type=Path)
    parser.add_argument("before_snapshot", type=Path)
    parser.add_argument("after_snapshot", type=Path)
    return parser.parse_args()


def read_ndjson(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    ids = [row["entry_id"] for row in rows]
    if not rows or len(ids) != len(set(ids)):
        raise RuntimeError("Input must contain unique op_pollen_history entry IDs")
    return rows


def clients(workspace_name):
    repo = Path(__file__).resolve().parents[4]
    config = json.loads((repo / "enter.pollinations.ai/observability/.tinyb").read_text())
    user = TinyB(token=config["user_token"], host=HOST)
    workspaces = user.user_workspaces_and_branches(version="v1")["workspaces"]
    workspace = next(item for item in workspaces if item["name"] == workspace_name)
    admin = TinyB(token=workspace["token"], host=HOST)
    append_token = admin.get_token_by_name("operations_ingest")["token"]
    append = TinyB(token=append_token, host=HOST)
    return admin, append


def effective_history(client):
    query = """
        SELECT
            entry_id,
            argMax(month, recorded_at) AS month,
            argMax(provider, recorded_at) AS provider,
            argMax(model, recorded_at) AS model,
            argMax(cost_paid, recorded_at) AS cost_paid,
            argMax(cost_quests, recorded_at) AS cost_quests,
            argMax(price_paid, recorded_at) AS price_paid,
            argMax(price_quests, recorded_at) AS price_quests,
            argMax(requests_paid, recorded_at) AS requests_paid,
            argMax(requests_quests, recorded_at) AS requests_quests,
            argMax(byop_paid, recorded_at) AS byop_paid,
            argMax(byop_quests, recorded_at) AS byop_quests,
            argMax(model_paid, recorded_at) AS model_paid,
            argMax(model_quests, recorded_at) AS model_quests,
            argMax(evidence, recorded_at) AS evidence,
            argMax(reason, recorded_at) AS reason
        FROM op_pollen_history
        GROUP BY entry_id
        ORDER BY month DESC, provider, model
        FORMAT JSON
    """
    return client.query(query)["data"]


def equal_value(expected, actual):
    if isinstance(expected, (int, float)):
        return abs(float(expected) - float(actual)) < 0.000000001
    return ("" if expected is None else str(expected)) == (
        "" if actual is None else str(actual)
    )


def verify_rows(expected, actual, fields, key):
    actual_by_key = {key(row): row for row in actual}
    errors = []
    for row in expected:
        row_key = key(row)
        found = actual_by_key.get(row_key)
        if not found:
            errors.append(f"missing {row_key}")
            continue
        for field in fields:
            if not equal_value(row.get(field, ""), found.get(field, "")):
                errors.append(f"{row_key} differs in {field}")
    if errors:
        raise RuntimeError("Verification failed: " + "; ".join(errors))


def write_snapshot(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"data": rows}, indent=2) + "\n")


def main():
    args = arguments()
    expected = read_ndjson(args.input.resolve())
    admin, append = clients(WORKSPACES[args.environment])
    before = effective_history(admin)
    write_snapshot(args.before_snapshot.resolve(), before)

    expected_keys = {
        (row["month"], row["provider"], row["model"]) for row in expected
    }
    endpoint_before = admin.pipe_data("op_pollen_api").get("data", [])
    collisions = [
        row
        for row in endpoint_before
        if (row["month"], row["vendor"], row["model"]) in expected_keys
    ]
    if collisions:
        raise RuntimeError(
            f"Refusing to double-count {len(collisions)} existing endpoint rows"
        )

    result = append.datasource_append_data(
        "op_pollen_history", args.input.resolve(), mode="append", format="ndjson"
    )
    if result.get("error"):
        raise RuntimeError(f"Tinybird append failed: {result['error']}")

    after = []
    for attempt in range(6):
        after = effective_history(admin)
        try:
            verify_rows(expected, after, HISTORY_FIELDS, lambda row: row["entry_id"])
            break
        except RuntimeError:
            if attempt == 5:
                raise
            time.sleep(1)
    write_snapshot(args.after_snapshot.resolve(), after)

    endpoint_after = admin.pipe_data("op_pollen_api").get("data", [])
    endpoint_expected = [
        {**row, "vendor": row["provider"]} for row in expected
    ]
    verify_rows(
        endpoint_expected,
        endpoint_after,
        ["month", "vendor", "model", *METRICS],
        lambda row: (row["month"], row["vendor"], row["model"]),
    )
    print(
        json.dumps(
            {
                "environment": args.environment,
                "rows_appended": len(expected),
                "history_rows_before": len(before),
                "history_rows_after": len(after),
                "endpoint_rows_verified": len(expected),
                "quarantine_rows": result.get("quarantine_rows", 0),
                "invalid_lines": result.get("invalid_lines", 0),
            }
        )
    )


if __name__ == "__main__":
    main()
