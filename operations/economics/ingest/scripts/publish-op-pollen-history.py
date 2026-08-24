#!/usr/bin/env python3

import argparse
import json
import time
from pathlib import Path

from tinybird.tb.client import TinyB

from publisher_safety import (
    assert_newer_versions,
    assert_pollen_reason_transitions,
    canonical_pollen_provider,
    latest_version_query,
    validate_recorded_at,
)


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
    validate_recorded_at(rows)
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


def current_versions(client, entry_ids):
    return client.query(latest_version_query("op_pollen_history", entry_ids))["data"]


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


def verify_exact_rows(expected, actual, fields, key):
    expected_keys = {key(row) for row in expected}
    actual_keys = {key(row) for row in actual}
    missing = sorted(expected_keys - actual_keys)
    unexpected = sorted(actual_keys - expected_keys)
    if missing or unexpected:
        raise RuntimeError(
            "Endpoint key verification failed: "
            f"missing={missing[:10]}; unexpected={unexpected[:10]}"
        )
    verify_rows(expected, actual, fields, key)


def endpoint_snapshot(rows):
    grouped = {}
    for row in rows:
        provider = canonical_pollen_provider(
            row["month"], row["provider"], row["model"]
        )
        row_key = (row["month"], provider, row["model"])
        aggregate = grouped.setdefault(
            row_key,
            {
                "month": row["month"],
                "vendor": provider,
                "model": row["model"],
                **{field: 0 for field in METRICS},
            },
        )
        for field in METRICS:
            aggregate[field] += float(row[field])
    return [
        row
        for row in grouped.values()
        if any(abs(row[field]) > 0.000000001 for field in METRICS)
    ]


def tombstone_endpoint_snapshot(endpoint_before, expected, history_before):
    rows_by_key = {
        (row["month"], row["vendor"], row["model"]): {
            **row,
            **{field: float(row[field]) for field in METRICS},
        }
        for row in endpoint_before
    }
    history_by_id = {row["entry_id"]: row for row in history_before}
    target_keys = set()
    for tombstone in expected:
        current = history_by_id[tombstone["entry_id"]]
        vendor = canonical_pollen_provider(
            current["month"], current["provider"], current["model"]
        )
        key = (current["month"], vendor, current["model"])
        target_keys.add(key)
        endpoint_row = rows_by_key.get(key)
        if endpoint_row is None:
            raise RuntimeError(f"Cannot retract missing endpoint row {key}")
        for field in METRICS:
            contribution = float(current[field])
            if vendor == "community" and field in {"cost_paid", "cost_quests"}:
                contribution = 0
            endpoint_row[field] -= contribution

    return [
        row
        for key, row in rows_by_key.items()
        if key in target_keys
        and any(abs(row[field]) > 0.000000001 for field in METRICS)
    ], target_keys


def write_snapshot(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"data": rows}, indent=2) + "\n")


def main():
    args = arguments()
    expected = read_ndjson(args.input.resolve())
    admin, append = clients(WORKSPACES[args.environment])
    before = effective_history(admin)
    write_snapshot(args.before_snapshot.resolve(), before)

    reasons = {row["reason"] for row in expected}
    snapshot_mode = reasons == {"workspace_snapshot"}
    tombstone_mode = reasons == {"tombstone"}
    if ("workspace_snapshot" in reasons or "tombstone" in reasons) and len(reasons) > 1:
        raise RuntimeError("Snapshot, tombstone, and additive history rows cannot mix")
    expected_keys = {
        (
            row["month"],
            canonical_pollen_provider(row["month"], row["provider"], row["model"]),
            row["model"],
        )
        for row in expected
    }
    if len(expected_keys) != len(expected):
        raise RuntimeError(
            "Input contains rows that collide after endpoint provider normalization"
        )
    endpoint_before = admin.pipe_data("op_pollen_api").get("data", [])
    collisions = [
        row
        for row in endpoint_before
        if (row["month"], row["vendor"], row["model"]) in expected_keys
    ]
    if collisions and not snapshot_mode and not tombstone_mode:
        raise RuntimeError(
            f"Refusing to double-count {len(collisions)} existing endpoint rows"
        )
    if snapshot_mode:
        target_months = {row["month"] for row in expected}
        endpoint_target_keys = {
            (row["month"], row["vendor"], row["model"])
            for row in endpoint_before
            if row["month"] in target_months
        }
        uncovered_endpoint_keys = sorted(endpoint_target_keys - expected_keys)
        if uncovered_endpoint_keys:
            raise RuntimeError(
                "Snapshot input does not cover every current endpoint key: "
                + ", ".join(str(value) for value in uncovered_endpoint_keys[:10])
            )
        existing_snapshot_ids = {
            row["entry_id"]
            for row in before
            if row["month"] in target_months and row["reason"] == "workspace_snapshot"
        }
        input_ids = {row["entry_id"] for row in expected}
        missing_updates = sorted(existing_snapshot_ids - input_ids)
        if missing_updates:
            raise RuntimeError(
                "Snapshot input does not update every existing target entry: "
                + ", ".join(missing_updates[:10])
            )
        for row in expected:
            for field in METRICS:
                if float(row[field]) < 0:
                    raise RuntimeError(f"{row['entry_id']} has negative {field}")

    assert_newer_versions(
        expected,
        current_versions(admin, [row["entry_id"] for row in expected]),
    )
    assert_pollen_reason_transitions(expected, before, METRICS)

    tombstone_expected = []
    tombstone_target_keys = set()
    if tombstone_mode:
        tombstone_expected, tombstone_target_keys = tombstone_endpoint_snapshot(
            endpoint_before, expected, before
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
    if snapshot_mode:
        endpoint_expected = endpoint_snapshot(expected)
        endpoint_actual = [
            row for row in endpoint_after if row["month"] in target_months
        ]
        verify_exact_rows(
            endpoint_expected,
            endpoint_actual,
            ["month", "vendor", "model", *METRICS],
            lambda row: (row["month"], row["vendor"], row["model"]),
        )
    elif tombstone_mode:
        endpoint_actual = [
            row
            for row in endpoint_after
            if (row["month"], row["vendor"], row["model"])
            in tombstone_target_keys
        ]
        verify_exact_rows(
            tombstone_expected,
            endpoint_actual,
            ["month", "vendor", "model", *METRICS],
            lambda row: (row["month"], row["vendor"], row["model"]),
        )
        endpoint_expected = tombstone_expected
    else:
        endpoint_expected = [
            {
                **row,
                "vendor": canonical_pollen_provider(
                    row["month"], row["provider"], row["model"]
                ),
            }
            for row in expected
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
                "endpoint_rows_verified": len(endpoint_expected),
                "mode": (
                    "snapshot"
                    if snapshot_mode
                    else "tombstone"
                    if tombstone_mode
                    else "additive"
                ),
                "quarantine_rows": result.get("quarantine_rows", 0),
                "invalid_lines": result.get("invalid_lines", 0),
            }
        )
    )


if __name__ == "__main__":
    main()
