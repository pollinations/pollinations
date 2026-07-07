"""Read-only table inspector.

    python3 -m ingest.inspect provider_monthly --vendor replicate --month 2026-07
Prints matching rows as JSON lines plus a count footer. Never writes.
"""
import argparse
import json
import re
import sys

from . import creds as _creds
from . import tb as _tb

TABLES = {
    "transactions": "date",
    "provider_monthly": "month",
    "pollen_monthly": "month",
    "revenue_monthly": "month",
    "grants": None,
    "ingest_runs": None,
}
_ORDER = {"grants": "recorded_at"}
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_VENDOR_RE = re.compile(r"^[a-z0-9._-]+$")


def build_query(table, vendor, month, limit):
    month_column = TABLES[table]
    where = []
    if vendor:
        if table in ("revenue_monthly", "ingest_runs"):
            raise ValueError(f"{table} has no vendor column")
        if not _VENDOR_RE.match(vendor):
            raise ValueError(f"invalid vendor slug: {vendor}")
        where.append(f"vendor = '{vendor}'")
    if month:
        if not _MONTH_RE.match(month):
            raise ValueError(f"month must be YYYY-MM, got '{month}'")
        if month_column is None:
            raise ValueError(f"{table} has no month column")
        column_filter = (
            f"{month_column} = '{month}'"
            if month_column == "month"
            else f"startsWith(toString({month_column}), '{month}')"
        )
        where.append(column_filter)
    query = f"SELECT * FROM {table}"
    if where:
        query += " WHERE " + " AND ".join(where)
    order = month_column or _ORDER.get(table, "run_at")
    query += f" ORDER BY {order} DESC LIMIT {int(limit)}"
    return query


def main(argv=None, tb_factory=None):
    parser = argparse.ArgumentParser(
        prog="ingest.inspect", description="Print rows from an operations table."
    )
    parser.add_argument("table", choices=sorted(TABLES))
    parser.add_argument("--vendor")
    parser.add_argument("--month")
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args(argv)

    try:
        query = build_query(args.table, args.vendor, args.month, args.limit)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)

    if tb_factory is not None:
        client = tb_factory(None)
    else:
        secrets, config = _creds.load_creds(), _creds.load_config()
        client = _tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])

    rows = client.sql(query)
    for row in rows:
        print(json.dumps(row, sort_keys=True))
    print(f"# {len(rows)} rows from {args.table}", file=sys.stderr)


if __name__ == "__main__":
    main()
