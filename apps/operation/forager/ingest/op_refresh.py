"""Scoped refreshes for live op_* datasources.

The first supported target is the open-month `op_pollen` table, because product
usage continues moving after the initial migration fill. This command writes
only to new op_* tables and never touches legacy datasources.
"""

import argparse
import datetime
import json
import re
import sys

from . import backup, creds, tb
from .connectors import usage as _usage
from .op_rows import build_pollen_rows


_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def current_month(today=None):
    today = today or datetime.date.today().isoformat()
    return today[:7]


def _validate_month(month):
    if not _MONTH_RE.match(month):
        raise ValueError(f"month must be YYYY-MM, got {month!r}")
    return month


def _month_condition(month):
    _validate_month(month)
    return f"month = '{month}'"


def build_op_pollen_month_rows(tb_prod, month, today):
    """Build validated op_pollen rows for one month from product usage."""
    month = _validate_month(month)
    return build_pollen_rows(_usage.monthly_rows(tb_prod, [month], today))


def replace_op_pollen_month(ops_ingest, ops_replace, config, month, rows):
    """Backup op_pollen and replace only one month in the live datasource."""
    if not rows:
        raise ValueError(f"refusing to replace op_pollen {month} with 0 rows")
    backup_dir, _ = backup.replace_with_backup(
        ops_ingest,
        ops_replace,
        "op_pollen",
        rows,
        config,
        condition=_month_condition(month),
    )
    return backup_dir


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="ingest.op_refresh",
        description="Scoped refreshes for new op_* datasources.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    pollen = sub.add_parser("pollen", help="refresh one op_pollen month")
    pollen.add_argument(
        "--month",
        default=current_month(),
        help="month to refresh, YYYY-MM; defaults to current month",
    )
    pollen.add_argument("--write", action="store_true", help="replace live op_pollen rows")
    pollen.add_argument("--sample", type=int, default=0, help="print N sample rows")

    args = parser.parse_args(argv)
    if args.cmd == "pollen":
        _validate_month(args.month)
    return args


def main(argv=None):
    args = parse_args(argv)
    secrets, config = creds.load_creds(), creds.load_config()
    today = datetime.date.today().isoformat()
    tb_prod = tb.TB(config["tb_prod_api"], secrets["TINYBIRD_PROD_READ_TOKEN"])

    if args.cmd == "pollen":
        rows = build_op_pollen_month_rows(tb_prod, args.month, today)
        print(json.dumps({"table": "op_pollen", "month": args.month, "rows": len(rows)}))
        for row in rows[: args.sample]:
            print(json.dumps({"table": "op_pollen", "row": row}, sort_keys=True))
        if not args.write:
            print("dry-run: use --write to replace op_pollen for this month")
            return

        ops_ingest = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
        ops_replace = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_REPLACE_TOKEN"])
        backup_dir = replace_op_pollen_month(
            ops_ingest,
            ops_replace,
            config,
            args.month,
            rows,
        )
        print(f"backup: {backup_dir}")
        print(f"replaced op_pollen {args.month}: {len(rows)} rows")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise
