"""Build the new prefixed Operations raw tables.

Default mode prints row counts only. Use --write to replace op_* datasources
after they have been deployed to Tinybird.
"""

import argparse
import json
import re
import sys

from . import backup, creds, tb, wise
from .connectors import usage as _usage
from .connectors.common import months_ytd
from .op_rows import (
    build_cloud_rows,
    build_pollen_rows,
    utc_now,
    validate_transactions,
)


SOURCE_TABLES = ("provider_monthly", "gpu_runs", "grants")
TARGET_TABLES = ("op_cloud", "op_transactions", "op_pollen")
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _month_in(row, months):
    if not months:
        return True
    if row.get("month"):
        return row["month"] in months
    for field in ("date", "start_date", "start"):
        value = str(row.get(field, ""))
        if value[:7] in months:
            return True
    return False


def _select_all(client, table):
    return client.sql(f"SELECT * FROM {table}")


def _snapshot_optional(client, table, backup_dir):
    try:
        return backup.snapshot_table(client, table, backup_dir)
    except Exception as error:
        print(f"backup: skipped {table}: {type(error).__name__}: {error}")
        return []


def build_rows(
    client,
    tb_prod,
    secrets,
    config,
    today,
    months=None,
    recorded_at=None,
    target_tables=TARGET_TABLES,
):
    recorded_at = recorded_at or utc_now()
    rows_by_table = {}
    if "op_cloud" in target_tables:
        source = {table: _select_all(client, table) for table in SOURCE_TABLES}
        filtered = {
            table: [row for row in rows if _month_in(row, months)]
            for table, rows in source.items()
        }
        rows_by_table["op_cloud"] = build_cloud_rows(
            filtered["provider_monthly"],
            filtered["gpu_runs"],
            filtered["grants"],
            recorded_at=recorded_at,
        )
    if "op_transactions" in target_tables:
        op_transactions = wise.build_op_transactions(
            secrets,
            months or months_ytd(config["months_start"], today),
            recorded_at=recorded_at,
        )
        validate_transactions(op_transactions)
        rows_by_table["op_transactions"] = op_transactions
    if "op_pollen" in target_tables:
        usage_months = months or months_ytd(config["months_start"], today)
        rows_by_table["op_pollen"] = build_pollen_rows(
            _usage.monthly_rows(tb_prod, usage_months, today)
        )
    return rows_by_table


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="ingest.op_migrate",
        description="Build the new op_* raw tables from legacy Operations data.",
    )
    parser.add_argument("--write", action="store_true", help="replace op_* tables")
    parser.add_argument(
        "--table",
        choices=TARGET_TABLES,
        help="only replace one op_* table; default replaces all target tables",
    )
    parser.add_argument("--month", help="dry-run one YYYY-MM month")
    parser.add_argument("--sample", type=int, default=0, help="print N sample rows")
    args = parser.parse_args(argv)
    if args.month and not _MONTH_RE.match(args.month):
        parser.error("--month must be YYYY-MM")
    if args.month and args.write:
        parser.error("--month is dry-run only for now; first op_* write must be full")
    return args


def main(argv=None):
    args = parse_args(argv)
    secrets, config = creds.load_creds(), creds.load_config()
    today = __import__("datetime").date.today().isoformat()
    client = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
    replace = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_REPLACE_TOKEN"])
    tb_prod = tb.TB(config["tb_prod_api"], secrets["TINYBIRD_PROD_READ_TOKEN"])
    months = [args.month] if args.month else None

    target_tables = (args.table,) if args.table else TARGET_TABLES
    rows_by_table = build_rows(
        client,
        tb_prod,
        secrets,
        config,
        today,
        months=months,
        target_tables=target_tables,
    )
    counts = {table: len(rows) for table, rows in rows_by_table.items()}
    print(json.dumps({"rows": counts}, sort_keys=True))
    if args.sample:
        for table, rows in rows_by_table.items():
            for row in rows[: args.sample]:
                print(json.dumps({"table": table, "row": row}, sort_keys=True))

    if not args.write:
        print("dry-run: use --write to replace op_* datasources")
        return

    backup_dir = backup.run_directory(config)
    for table in SOURCE_TABLES + target_tables:
        _snapshot_optional(client, table, backup_dir)
    print(f"backup: {backup_dir}")

    for table in target_tables:
        rows = rows_by_table[table]
        if not rows:
            raise RuntimeError(f"refusing to replace {table} with 0 rows")
        replace.replace(table, rows)
        print(f"replaced {table}: {len(rows)} rows")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise
