"""Daily operations ingest.

    python3 -m ingest.run
Forager owns the clean Treasury data path:
  - Enty exports -> transactions
  - provider connectors/manual rows -> meter_monthly
  - generation_event -> usage_monthly
  - Stripe balance transactions -> revenue_monthly

The old Gmail/GOG invoice fetcher is local-only under
_local/invoice_fetcher.
"""

import argparse
import datetime
import json
import re

from . import backup, creds, enty, tb
from .connectors import registry
from .connectors import usage as _usage
from .connectors.common import months_ytd
from .connectors.providers import _validate_meter_source
from .connectors.providers import stripe as _stripe
from .aliases import PROVIDER_ALIASES


_SRC_RANK = {"manual": 0, "api": 1, "cli": 2, "bq": 3}


def _meter_sources(source):
    normalized = str(source or "").replace("+", ",").replace("/", ",").replace(" ", ",")
    return [part.strip() for part in normalized.split(",") if part.strip()]


def _source_rank(source):
    ranks = [_SRC_RANK.get(part, 99) for part in _meter_sources(source)]
    return min(ranks) if ranks else 99


def _combine_sources(*sources):
    seen = []
    for source in sources:
        for part in _meter_sources(source):
            if part not in seen:
                seen.append(part)
    return ",".join(seen)


def _amount(row, field):
    return round(float(row.get(field) or 0), 2)


def _field_present(row, field):
    if row.get("source") == "manual":
        return field in row
    return _amount(row, field) != 0


def merge_meter_rows(rows):
    """One row per (provider, month, currency), with separate credit/paid amounts."""

    grouped = {}
    for row in rows:
        key = (
            row.get("provider", ""),
            row.get("month", ""),
            row.get("currency", ""),
        )
        current = grouped.setdefault(
            key,
            {
                "month": row.get("month", ""),
                "provider": row.get("provider", ""),
                "currency": row.get("currency", ""),
                "credit": 0.0,
                "paid": 0.0,
                "source": "",
                "_credit_rank": 999,
                "_cash_rank": 999,
                "_credit_source": "",
                "_cash_source": "",
            },
        )
        rank = _source_rank(row.get("source", "manual"))
        for field, rank_field, source_field in [
            ("credit", "_credit_rank", "_credit_source"),
            ("paid", "_cash_rank", "_cash_source"),
        ]:
            if not _field_present(row, field):
                continue
            if rank <= current[rank_field]:
                current[field] = _amount(row, field)
                current[rank_field] = rank
                current[source_field] = row.get("source", "")

    merged = []
    for row in grouped.values():
        source = _combine_sources(row["_credit_source"], row["_cash_source"])
        if not source:
            source = row["source"] or "manual"
        merged.append(
            {
                "month": row["month"],
                "provider": row["provider"],
                "currency": row["currency"],
                "credit": row["credit"],
                "paid": row["paid"],
                "source": source,
            }
        )
    return merged


def _has_manual_source(row):
    return "manual" in _meter_sources(row.get("source", ""))


def existing_manual_meter_rows(rows):
    return [row for row in rows if _has_manual_source(row)]


_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def splice_rows(existing, fresh, in_scope):
    return [row for row in existing if not in_scope(row)] + list(fresh)


def assert_fresh_in_scope(datasource, fresh, in_scope):
    """Fresh rows must all fall within the spliced scope.

    splice_rows keeps out-of-scope existing rows and appends every fresh row,
    so an out-of-scope fresh row would duplicate the surviving copy. Refuse the
    write, naming the offenders.
    """
    out_of_scope = [row for row in fresh if not in_scope(row)]
    if out_of_scope:
        raise RuntimeError(
            f"refusing to splice out-of-scope {datasource} rows: "
            + json.dumps(out_of_scope, sort_keys=True)
        )


def validate_meter_rows(rows):
    for row in rows:
        if row.get("provider", "") not in PROVIDER_ALIASES:
            raise ValueError(
                f"unknown provider slug for meter_monthly: {row.get('provider', '')}"
            )
        _validate_meter_source(row.get("source", ""))
        if not str(row.get("currency") or "").strip():
            raise ValueError("meter_monthly row missing currency")
        for field in ("credit", "paid"):
            value = row.get(field)
            if value is None:
                raise ValueError(f"meter_monthly row missing {field}")
            float(value)


def _sanitize_err(e, creds_dict):
    msg = type(e).__name__ + ": " + str(e)
    for val in creds_dict.values():
        if val and isinstance(val, str) and len(val) > 3:
            msg = msg.replace(val, "***")
    return msg[:200]


def guarded_replace(ops_replace, datasource, rows, guard, statuses):
    added, removed = backup.diff_rows(guard["existing"][datasource], rows)
    statuses[f"{datasource}_diff"] = f"+{len(added)}/-{len(removed)}"
    print(f"{datasource}: +{len(added)} added, -{len(removed)} removed")
    if datasource == "meter_monthly":
        lost = backup.manual_meter_rows_lost(removed, rows)
        if lost and not guard["yes"]:
            raise RuntimeError(
                "refusing to drop manual meter rows without --yes: "
                + json.dumps(lost)
            )
    if guard["dry_run"]:
        print(f"dry-run: skipped replace of {datasource} ({len(rows)} rows)")
        return
    ops_replace.replace(datasource, rows)


def refresh_meter_monthly(
    ops_replace,
    secrets,
    config,
    today,
    statuses,
    guard,
    providers=None,
    months=None,
):
    if months is None:
        months = months_ytd(config["months_start"], today)
    month_set = set(months)

    def in_scope(row):
        return (
            (providers is None or row.get("provider") in providers)
            and row.get("month") in month_set
        )

    meter_new = []
    errors = []

    for slug, fn in registry.METER:
        if providers is not None and slug not in providers:
            continue
        try:
            rows = fn(secrets, months, today)
            meter_new.extend(rows or [])
            statuses[f"meter:{slug}"] = "ok"
        except Exception as e:
            statuses[f"meter:{slug}"] = "err:" + _sanitize_err(e, secrets)
            errors.append(f"{slug}: {statuses[f'meter:{slug}']}")

    if errors:
        raise RuntimeError("meter connector failures: " + "; ".join(errors))

    validate_meter_rows(meter_new)
    if not meter_new:
        raise RuntimeError("meter connectors returned 0 rows")

    existing_meter = guard["existing"]["meter_monthly"]
    meter_manual = [
        row
        for row in existing_manual_meter_rows(existing_meter)
        if in_scope(row)
    ]
    validate_meter_rows(meter_manual)
    meter_merged = merge_meter_rows(meter_new + meter_manual)
    validate_meter_rows(meter_merged)
    assert_fresh_in_scope("meter_monthly", meter_merged, in_scope)
    final_rows = splice_rows(existing_meter, meter_merged, in_scope)
    guarded_replace(ops_replace, "meter_monthly", final_rows, guard, statuses)
    statuses["meter_rows"] = len(final_rows)


def _splice_by_month(datasource, fresh, months, scoped, guard):
    """Full replace unless scoped to a month subset, then splice by month."""
    if not scoped:
        return fresh
    month_set = set(months)
    existing = guard["existing"][datasource]
    in_scope = lambda row: row.get("month") in month_set
    assert_fresh_in_scope(datasource, fresh, in_scope)
    return splice_rows(existing, fresh, in_scope)


def refresh_usage_monthly(
    ops_replace, tb_prod, config, today, statuses, guard, months=None
):
    scoped = months is not None
    if months is None:
        months = months_ytd(config["months_start"], today)
    rows = _usage.monthly_rows(tb_prod, months, today)
    if not rows:
        raise RuntimeError("usage_monthly returned 0 rows")
    rows = _splice_by_month("usage_monthly", rows, months, scoped, guard)
    guarded_replace(ops_replace, "usage_monthly", rows, guard, statuses)
    statuses["usage"] = len(rows)


def refresh_revenue_monthly(
    ops_replace, secrets, config, today, statuses, guard, months=None
):
    scoped = months is not None
    if months is None:
        months = months_ytd(config["months_start"], today)
    rows = _stripe.revenue_rows(secrets, months, today)
    if not rows:
        raise RuntimeError("revenue_monthly returned 0 rows")
    rows = _splice_by_month("revenue_monthly", rows, months, scoped, guard)
    guarded_replace(ops_replace, "revenue_monthly", rows, guard, statuses)
    statuses["revenue"] = len(rows)


def refresh_transactions(ops_replace, secrets, config, statuses, guard):
    rows = enty.build_transactions(config, secrets)
    if not rows:
        raise RuntimeError("transactions returned 0 rows")
    guarded_replace(ops_replace, "transactions", rows, guard, statuses)
    statuses["transactions"] = len(rows)


def append_run_log(ops_ingest, statuses, notes):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    ops_ingest.append(
        "ingest_runs",
        [
            {
                "run_at": now,
                "ok": 0 if notes else 1,
                "statuses": json.dumps(statuses),
                "notes": "; ".join(notes),
            }
        ],
    )


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="ingest.run", description="Refresh the Operations Tinybird tables."
    )
    parser.add_argument("--yes", action="store_true",
                        help="approve writes that would lose manual meter row data")
    parser.add_argument("--dry-run", action="store_true",
                        help="snapshot + diff only, write nothing")
    parser.add_argument("--only", choices=["meter", "usage", "revenue", "transactions"])
    parser.add_argument("--provider", help="meter only: re-fetch one connector")
    parser.add_argument("--month", help="restrict to one YYYY-MM month")
    args = parser.parse_args(argv)

    if args.provider is not None:
        if args.only != "meter":
            parser.error("--provider requires --only meter")
        meter_slugs = [slug for slug, _ in registry.METER]
        if args.provider not in meter_slugs:
            parser.error(
                "--provider must be a meter connector slug "
                f"({', '.join(meter_slugs)}); manual-only providers are "
                "updated with ingest.record"
            )
    if args.month is not None:
        if not _MONTH_RE.match(args.month):
            parser.error("--month must be YYYY-MM")
        if args.only == "transactions":
            parser.error("--month is not valid with --only transactions")

    return args


def main():
    args = parse_args()

    today = datetime.date.today().isoformat()
    secrets, config = creds.load_creds(), creds.load_config()

    ops_ingest = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
    ops_replace = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_REPLACE_TOKEN"])
    tb_prod = tb.TB(config["tb_prod_api"], secrets["TINYBIRD_PROD_READ_TOKEN"])

    backup_dir = backup.run_directory(config)
    guard = {
        "yes": args.yes,
        "dry_run": args.dry_run,
        "existing": {
            ds: backup.snapshot_table(ops_ingest, ds, backup_dir)
            for ds in ("meter_monthly", "usage_monthly", "revenue_monthly", "transactions")
        },
    }
    print(f"backup: {backup_dir}")

    months = [args.month] if args.month else None
    providers = [args.provider] if args.provider else None

    statuses, notes = {}, []
    try:
        if args.only in (None, "meter"):
            refresh_meter_monthly(
                ops_replace,
                secrets,
                config,
                today,
                statuses,
                guard,
                providers=providers,
                months=months,
            )
        if args.only in (None, "usage"):
            refresh_usage_monthly(
                ops_replace, tb_prod, config, today, statuses, guard, months=months
            )
        if args.only in (None, "revenue"):
            refresh_revenue_monthly(
                ops_replace, secrets, config, today, statuses, guard, months=months
            )
        if args.only in (None, "transactions"):
            refresh_transactions(ops_replace, secrets, config, statuses, guard)
    except Exception as e:
        statuses["run"] = "err:" + _sanitize_err(e, secrets)
        notes.append(f"run failed: {statuses['run']}")
        if not args.dry_run:
            append_run_log(ops_ingest, statuses, notes)
        raise

    if not args.dry_run:
        append_run_log(ops_ingest, statuses, notes)
    print(f"ingested: {statuses}" + (f"  NOTES: {notes}" if notes else ""))


if __name__ == "__main__":
    main()
