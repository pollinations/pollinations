"""Read-only reconciliation for the new op_* raw tables.

Builds the expected op_* rows from the current migration inputs, reads the live
op_* datasources, and compares grouped totals. This command never writes.
"""

import argparse
import contextlib
import datetime
import io
import json
import sys

from . import creds, op_migrate, tb


TABLES = ("op_cloud", "op_transactions", "op_pollen")

KEY_FIELDS = {
    "op_cloud": ("month", "vendor", "type", "currency"),
    "op_transactions": ("month", "vendor", "category", "currency"),
    "op_pollen": ("month", "vendor", "model", "currency"),
}

SUM_FIELDS = {
    "op_cloud": ("credit", "paid", "total"),
    "op_transactions": ("amount",),
    "op_pollen": (
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
    ),
}

INTEGER_FIELDS = {"row_count", "requests_paid", "requests_quests"}
_MONEY_TOLERANCE = 0.005


def _row_month(table, row):
    if table == "op_cloud":
        return str(row.get("start", ""))[:7]
    if table == "op_transactions":
        return str(row.get("date", ""))[:7]
    return str(row.get("month", ""))[:7]


def _key_for(table, row):
    month = _row_month(table, row)
    values = {"month": month}
    for field in KEY_FIELDS[table]:
        if field == "month":
            continue
        values[field] = str(row.get(field, "") or "")
    return tuple(values[field] for field in KEY_FIELDS[table])


def _blank_group(table, key):
    group = {
        field: value
        for field, value in zip(KEY_FIELDS[table], key)
    }
    group["row_count"] = 0
    for field in SUM_FIELDS[table]:
        group[field] = 0
    return group


def _number(row, field):
    if field == "total":
        return float(row.get("credit") or 0) + float(row.get("paid") or 0)
    return float(row.get(field) or 0)


def _finish_group(group):
    for field, value in list(group.items()):
        if field in INTEGER_FIELDS:
            group[field] = int(round(float(value)))
        elif isinstance(value, float):
            group[field] = round(value, 6)
    return group


def aggregate_rows(table, rows, months=None):
    months = set(months or [])
    groups = {}
    for row in rows:
        month = _row_month(table, row)
        if months and month not in months:
            continue
        key = _key_for(table, row)
        group = groups.setdefault(key, _blank_group(table, key))
        group["row_count"] += 1
        for field in SUM_FIELDS[table]:
            group[field] += _number(row, field)
    return {
        key: _finish_group(group)
        for key, group in groups.items()
    }


def _field_diff(expected, actual, field):
    diff = float(actual.get(field, 0)) - float(expected.get(field, 0))
    if field in INTEGER_FIELDS:
        diff = int(round(diff))
    else:
        diff = round(diff, 6)
    return diff


def _field_matches(expected, actual, field):
    diff = abs(_field_diff(expected, actual, field))
    if field in INTEGER_FIELDS:
        return diff == 0
    return diff <= _MONEY_TOLERANCE


def diff_aggregates(table, expected, actual, limit=50):
    fields = ("row_count",) + SUM_FIELDS[table]
    mismatches = []
    all_keys = sorted(set(expected) | set(actual))
    for key in all_keys:
        expected_group = expected.get(key) or _blank_group(table, key)
        actual_group = actual.get(key) or _blank_group(table, key)
        changed_fields = [
            field for field in fields
            if not _field_matches(expected_group, actual_group, field)
        ]
        if not changed_fields:
            continue
        mismatch = {
            "key": {
                field: value
                for field, value in zip(KEY_FIELDS[table], key)
            },
            "fields": changed_fields,
            "expected": {
                field: expected_group.get(field, 0)
                for field in fields
            },
            "actual": {
                field: actual_group.get(field, 0)
                for field in fields
            },
            "diff": {
                field: _field_diff(expected_group, actual_group, field)
                for field in fields
            },
        }
        mismatches.append(mismatch)

    return {
        "status": "ok" if not mismatches else "mismatch",
        "expected_groups": len(expected),
        "actual_groups": len(actual),
        "expected_rows": sum(group["row_count"] for group in expected.values()),
        "actual_rows": sum(group["row_count"] for group in actual.values()),
        "mismatch_count": len(mismatches),
        "mismatches": mismatches[:limit],
        "truncated": len(mismatches) > limit,
    }


def reconcile_rows(expected_by_table, actual_by_table, months=None, limit=50):
    tables = sorted(set(expected_by_table) | set(actual_by_table))
    checks = {}
    for table in tables:
        expected = aggregate_rows(table, expected_by_table.get(table, []), months=months)
        actual = aggregate_rows(table, actual_by_table.get(table, []), months=months)
        checks[table] = diff_aggregates(table, expected, actual, limit=limit)
    return {
        "status": "ok" if all(check["status"] == "ok" for check in checks.values()) else "mismatch",
        "checks": checks,
    }


def _select_all(client, table):
    return client.sql(f"SELECT * FROM {table}")


def _read_actual_rows(client, tables):
    return {table: _select_all(client, table) for table in tables}


def _build_expected_rows(client, prod_client, secrets, config, today, months):
    captured = io.StringIO()
    with contextlib.redirect_stdout(captured):
        rows = op_migrate.build_rows(
            client,
            prod_client,
            secrets,
            config,
            today,
            months=months,
        )
    warnings = [
        line for line in captured.getvalue().splitlines()
        if line.strip()
    ]
    return rows, warnings


def _print_human(result):
    print("op_* reconciliation: read-only")
    for warning in result.get("warnings", []):
        print(f"warning: {warning}", file=sys.stderr)
    for table in TABLES:
        check = result["checks"][table]
        print(
            f"{table}: {check['status']} "
            f"expected_rows={check['expected_rows']} actual_rows={check['actual_rows']} "
            f"expected_groups={check['expected_groups']} actual_groups={check['actual_groups']} "
            f"mismatches={check['mismatch_count']}"
        )
        for mismatch in check["mismatches"]:
            key = ", ".join(
                f"{field}={value}"
                for field, value in mismatch["key"].items()
            )
            fields = ", ".join(mismatch["fields"])
            print(f"  - {key}: {fields}")
            print(f"    expected {mismatch['expected']}")
            print(f"    actual   {mismatch['actual']}")
            print(f"    diff     {mismatch['diff']}")
        if check["truncated"]:
            print("  - mismatch list truncated; use --limit for more")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="ingest.op_reconcile",
        description="Read-only reconciliation between expected and live op_* rows.",
    )
    parser.add_argument("--month", help="compare one YYYY-MM month")
    parser.add_argument("--json", action="store_true", help="print JSON only")
    parser.add_argument("--limit", type=int, default=50, help="max mismatches per table")
    parser.add_argument(
        "--fail-on-mismatch",
        action="store_true",
        help="exit non-zero when grouped totals do not match",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    secrets, config = creds.load_creds(), creds.load_config()
    today = datetime.date.today().isoformat()
    client = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
    prod_client = tb.TB(config["tb_prod_api"], secrets["TINYBIRD_PROD_READ_TOKEN"])
    months = [args.month] if args.month else None

    expected, warnings = _build_expected_rows(
        client,
        prod_client,
        secrets,
        config,
        today,
        months,
    )
    actual = _read_actual_rows(client, TABLES)
    result = reconcile_rows(expected, actual, months=months, limit=args.limit)
    result["warnings"] = warnings

    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        _print_human(result)

    if args.fail_on_mismatch and result["status"] != "ok":
        sys.exit(1)


if __name__ == "__main__":
    main()
