"""Daily operations ingest.

    python3 -m ingest.run
Forager owns the clean Treasury data path:
  - Wise activities -> transactions
  - vendor connectors/manual rows -> provider_monthly
  - generation_event -> pollen_monthly
  - Stripe balance transactions -> revenue_monthly

The old Gmail/GOG invoice fetcher is local-only under
_local/invoice_fetcher.
"""

import argparse
import datetime
import json
import re

from . import backup, creds, tb, wise
from .connectors import registry
from .connectors import usage as _usage
from .connectors.common import months_ytd
from .connectors.vendors import ALLOWED_CATEGORIES, _validate_meter_source
from .connectors.vendors import stripe as _stripe
from .connectors import fleet as _fleet
from .connectors import gpu_billing as _gpu_billing
from .connectors import gpu_runs as _gpu_runs
from .connectors.registry import CANONICAL
from .aliases import VENDOR_ALIASES, GPU_VENDORS


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


def _category(row):
    return row.get("category") or "compute"


def _field_present(row, field):
    if row.get("source") == "manual":
        return field in row
    return _amount(row, field) != 0


def merge_meter_rows(rows):
    """One row per (vendor, month, currency), with separate credit/paid amounts."""

    grouped = {}
    for row in rows:
        key = (
            row.get("vendor", ""),
            row.get("month", ""),
            row.get("currency", ""),
            _category(row),
        )
        current = grouped.setdefault(
            key,
            {
                "month": row.get("month", ""),
                "vendor": row.get("vendor", ""),
                "currency": row.get("currency", ""),
                "category": _category(row),
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
                "vendor": row["vendor"],
                "currency": row["currency"],
                "category": row["category"],
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
        if row.get("vendor", "") not in VENDOR_ALIASES:
            raise ValueError(
                f"unknown vendor slug for provider_monthly: {row.get('vendor', '')}"
            )
        _validate_meter_source(row.get("source", ""))
        if _category(row) not in ALLOWED_CATEGORIES:
            raise ValueError(
                f"unknown category for provider_monthly: {row.get('category')}"
            )
        if not str(row.get("currency") or "").strip():
            raise ValueError("provider_monthly row missing currency")
        for field in ("credit", "paid"):
            value = row.get(field)
            if value is None:
                raise ValueError(f"provider_monthly row missing {field}")
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
    if datasource == "provider_monthly":
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


def refresh_provider_monthly(
    ops_replace,
    secrets,
    config,
    today,
    statuses,
    guard,
    vendors=None,
    months=None,
):
    if months is None:
        months = months_ytd(config["months_start"], today)
    month_set = set(months)

    def in_scope(row):
        return (
            (vendors is None or row.get("vendor") in vendors)
            and row.get("month") in month_set
        )

    meter_new = []
    errors = []

    for slug, fn in registry.METER:
        if vendors is not None and slug not in vendors:
            continue
        try:
            rows = fn(secrets, months, today)
            meter_new.extend(rows or [])
            statuses[f"provider:{slug}"] = "ok"
        except Exception as e:
            statuses[f"provider:{slug}"] = "err:" + _sanitize_err(e, secrets)
            errors.append(f"{slug}: {statuses[f'provider:{slug}']}")

    if errors:
        raise RuntimeError("meter connector failures: " + "; ".join(errors))

    validate_meter_rows(meter_new)
    if not meter_new:
        raise RuntimeError("meter connectors returned 0 rows")

    existing_meter = guard["existing"]["provider_monthly"]
    meter_manual = [
        row
        for row in existing_manual_meter_rows(existing_meter)
        if in_scope(row)
    ]
    validate_meter_rows(meter_manual)
    meter_merged = merge_meter_rows(meter_new + meter_manual)
    validate_meter_rows(meter_merged)
    assert_fresh_in_scope("provider_monthly", meter_merged, in_scope)
    final_rows = splice_rows(existing_meter, meter_merged, in_scope)
    guarded_replace(ops_replace, "provider_monthly", final_rows, guard, statuses)
    statuses["provider_rows"] = len(final_rows)


def _splice_by_month(datasource, fresh, months, scoped, guard):
    """Full replace unless scoped to a month subset, then splice by month."""
    if not scoped:
        return fresh
    month_set = set(months)
    existing = guard["existing"][datasource]
    in_scope = lambda row: row.get("month") in month_set
    assert_fresh_in_scope(datasource, fresh, in_scope)
    return splice_rows(existing, fresh, in_scope)


def refresh_pollen_monthly(
    ops_replace, tb_prod, config, today, statuses, guard, months=None
):
    scoped = months is not None
    if months is None:
        months = months_ytd(config["months_start"], today)
    rows = _usage.monthly_rows(tb_prod, months, today)
    if not rows:
        raise RuntimeError("pollen_monthly returned 0 rows")
    rows = _splice_by_month("pollen_monthly", rows, months, scoped, guard)
    guarded_replace(ops_replace, "pollen_monthly", rows, guard, statuses)
    statuses["pollen"] = len(rows)


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


def refresh_transactions(
    ops_replace, secrets, config, today, statuses, guard, months=None
):
    scoped = months is not None
    if months is None:
        months = months_ytd(config["months_start"], today)
    rows = wise.build_transactions(secrets, months)
    if not rows:
        raise RuntimeError("transactions returned 0 rows")
    if scoped:
        month_set = set(months)
        existing = guard["existing"]["transactions"]
        in_scope = lambda row: str(row.get("date", ""))[:7] in month_set
        assert_fresh_in_scope("transactions", rows, in_scope)
        rows = splice_rows(existing, rows, in_scope)
    guarded_replace(ops_replace, "transactions", rows, guard, statuses)
    statuses["transactions"] = len(rows)
    statuses["transactions_unmatched"] = sum(
        1 for row in rows if not row.get("vendor")
    )


def refresh_gpu_fleet(ops_ingest, secrets, now, statuses,
                      snapshot_all=None):
    """Append a fleet snapshot (append-only — no replace guard needed)."""
    snap = snapshot_all or _fleet.snapshot_all
    rows, fleet_statuses = snap(secrets, now)
    statuses.update(fleet_statuses)
    if rows:
        ops_ingest.append("gpu_fleet", rows)
    statuses["gpu_fleet_rows"] = len(rows)

    burn = {}
    balance = {}
    for row in rows:
        burn[row["vendor"]] = burn.get(row["vendor"], 0.0) + row["usd_per_hr"]
        if row.get("balance_usd") is not None:
            balance[row["vendor"]] = row["balance_usd"]
    for vendor, bal in balance.items():
        rate = burn.get(vendor, 0.0)
        if rate <= 0:
            continue
        days = bal / (rate * 24)
        statuses[f"gpu_runway:{vendor}"] = f"${bal:.2f} · {rate:.3f}/hr · ~{days:.1f}d"
        if days < 7:
            print(f"🚨 {vendor} runway {days:.1f} days (${bal:.2f} at {rate:.3f}/hr) — top up")


_GPU_BILLING_ALLOWED_SOURCES = {"api", "cli", "manual"}
_GPU_BILLING_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validate_gpu_billing_row(row):
    """Basic validation for gpu_billing rows."""
    vendor = row.get("vendor", "")
    # Vendor must be canonical, not just GPU_VENDORS.
    # Real audit data includes GPU line items from non-roster-GPU vendors
    # (e.g. ovhcloud rented GPU instances). gpu_billing is the audit ledger.
    if vendor not in CANONICAL:
        raise ValueError(
            f"gpu_billing row vendor '{vendor}' is not canonical. known: {sorted(CANONICAL)}"
        )
    month = row.get("month", "")
    if not _GPU_BILLING_MONTH_RE.match(str(month)):
        raise ValueError(f"gpu_billing row has invalid month: {month!r}")
    try:
        amount = float(row.get("amount") or 0)
    except (TypeError, ValueError):
        raise ValueError(f"gpu_billing row has non-numeric amount: {row.get('amount')!r}")
    if amount < 0:
        raise ValueError(f"gpu_billing row has negative amount: {amount}")
    source = row.get("source", "")
    if source not in _GPU_BILLING_ALLOWED_SOURCES:
        raise ValueError(f"gpu_billing row has invalid source: {source!r}")


_GPU_RUNS_ALLOWED_SOURCES = {"api", "cli", "manual"}
_GPU_RUNS_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_GPU_RUNS_TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")


def _validate_gpu_runs_row(row):
    """Validate a gpu_runs row before ingest."""
    vendor = row.get("vendor", "")
    if vendor not in CANONICAL:
        raise ValueError(
            f"gpu_runs row vendor '{vendor}' is not canonical. known: {sorted(CANONICAL)}"
        )
    month = row.get("month", "")
    if not _GPU_RUNS_MONTH_RE.match(str(month)):
        raise ValueError(f"gpu_runs row has invalid month: {month!r}")
    if row.get("cost") is None:
        raise ValueError("gpu_runs row is missing required field 'cost'")
    try:
        cost = float(row["cost"])
    except (TypeError, ValueError):
        raise ValueError(f"gpu_runs row has non-numeric cost: {row.get('cost')!r}")
    if cost < 0:
        raise ValueError(f"gpu_runs row has negative cost: {cost}")
    kind = row.get("kind", "")
    if kind not in {"gpu", "serverless"}:
        raise ValueError(f"gpu_runs row has invalid kind: {kind!r}")
    source = row.get("source", "")
    if source not in _GPU_RUNS_ALLOWED_SOURCES:
        raise ValueError(f"gpu_runs row has invalid source: {source!r}")
    hours = row.get("hours")
    if hours is not None:
        try:
            h = float(hours)
        except (TypeError, ValueError):
            raise ValueError(f"gpu_runs row has non-numeric hours: {hours!r}")
        if h < 0:
            raise ValueError(f"gpu_runs row has negative hours: {h}")
    for time_field in ("started_at", "ended_at"):
        val = row.get(time_field, "")
        if val != "" and not _GPU_RUNS_TIME_RE.match(str(val)):
            raise ValueError(
                f"gpu_runs row has invalid {time_field}: {val!r} "
                "(must be '' or 'YYYY-MM-DD HH:MM:SS')"
            )


def _gpu_billing_key(row):
    """Dedup key: (vendor, month, deployment)."""
    return (row.get("vendor", ""), row.get("month", ""), row.get("deployment", ""))


def refresh_gpu_billing(
    ops_replace,
    secrets,
    config,
    today,
    statuses,
    guard,
    vendors=None,
    months=None,
    connectors=None,
):
    """Refresh gpu_billing: fresh api/cli rows + surviving manual rows.

    provider_monthly-style: per-vendor error isolation; if ALL fail, raise.
    Manual rows outrank api/cli rows per (vendor, month, deployment) key.

    Args:
        ops_replace:  TB client with .replace(datasource, rows)
        secrets:      credentials dict
        config:       config dict (months_start etc.)
        today:        current ingest date "YYYY-MM-DD"
        statuses:     dict to record per-vendor ok/err statuses
        guard:        backup guard dict (existing, yes, dry_run)
        vendors:      optional list of vendor slugs to restrict scope
        months:       optional list of "YYYY-MM"; defaults to months_ytd
        connectors:   injectable dict {vendor: fn(creds, months, **kw)} for tests
    """
    if months is None:
        months = months_ytd(config.get("months_start", "2026-01"), today)
    month_set = set(months)

    if connectors is None:
        connectors = {
            "runpod": lambda creds, months, **kw: _gpu_billing.monthly_rows_runpod(
                creds, months, **{k: v for k, v in kw.items() if k == "http"}
            ),
            "modal": lambda creds, months, **kw: _gpu_billing.monthly_rows_modal(
                creds, months, **{k: v for k, v in kw.items() if k == "run_cmd"}
            ),
            "vast": lambda creds, months, **kw: _gpu_billing.monthly_rows_vast(
                creds, months, today,
                **{k: v for k, v in kw.items() if k == "run_cmd"}
            ),
        }

    # Restrict to requested vendors if --vendor given.
    _vendor_connector_map = {
        "runpod":  "runpod",
        "modal":   "modal",
        "vast.ai": "vast",
    }

    fresh_rows = []
    errors = []
    all_slugs = []

    for vendor_slug, connector_key in _vendor_connector_map.items():
        if vendors is not None and vendor_slug not in vendors:
            continue
        if connector_key not in connectors:
            continue
        all_slugs.append(vendor_slug)
        try:
            rows = connectors[connector_key](secrets, months)
            fresh_rows.extend(rows or [])
            statuses[f"billing:{vendor_slug}"] = f"ok:{len(rows or [])} rows"
        except Exception as e:
            msg = _sanitize_err(e, secrets)
            statuses[f"billing:{vendor_slug}"] = f"err:{msg}"
            errors.append(f"{vendor_slug}: {msg}")

    if errors and len(errors) == len(all_slugs):
        raise RuntimeError("all gpu billing connectors failed: " + "; ".join(errors))

    # Validate fresh rows.
    for row in fresh_rows:
        _validate_gpu_billing_row(row)

    # Determine scope predicate.
    def in_scope(row):
        return (
            (vendors is None or row.get("vendor") in vendors)
            and row.get("month") in month_set
        )

    # Retrieve surviving manual rows from existing snapshot.
    existing = guard["existing"].get("gpu_billing", [])
    manual_rows = [
        row for row in existing
        if row.get("source") == "manual" and in_scope(row)
    ]

    # Manual outranks api/cli per (vendor, month, deployment) key.
    manual_keys = {_gpu_billing_key(row) for row in manual_rows}
    fresh_non_manual = [
        row for row in fresh_rows
        if _gpu_billing_key(row) not in manual_keys
    ]

    merged = fresh_non_manual + manual_rows

    # Validate merged rows too.
    for row in merged:
        _validate_gpu_billing_row(row)

    assert_fresh_in_scope("gpu_billing", merged, in_scope)
    final_rows = splice_rows(existing, merged, in_scope)
    guarded_replace(ops_replace, "gpu_billing", final_rows, guard, statuses)
    statuses["gpu_billing_rows"] = len(final_rows)


def _gpu_runs_key(row):
    """Dedup key: (vendor, month, run_id)."""
    return (row.get("vendor", ""), row.get("month", ""), row.get("run_id", ""))


def refresh_gpu_runs(
    ops_replace,
    secrets,
    config,
    today,
    statuses,
    guard,
    vendors=None,
    months=None,
    connectors=None,
):
    """Refresh gpu_runs: fresh api/cli run rows + surviving manual rows.

    Near-exact mirror of refresh_gpu_billing — same per-vendor error
    isolation, same manual-outranks-fresh merge, same splice/guard machinery.
    Only difference: the dedup key is (vendor, month, run_id) instead of
    (vendor, month, deployment), via _gpu_runs_key. Lambda has no connector —
    it's manual-only, so its rows only ever come from the existing snapshot.

    Args:
        ops_replace:  TB client with .replace(datasource, rows)
        secrets:      credentials dict
        config:       config dict (months_start etc.)
        today:        current ingest date "YYYY-MM-DD"
        statuses:     dict to record per-vendor ok/err statuses
        guard:        backup guard dict (existing, yes, dry_run)
        vendors:      optional list of vendor slugs to restrict scope
        months:       optional list of "YYYY-MM"; defaults to months_ytd
        connectors:   injectable dict {vendor: fn(creds, months, **kw)} for tests
    """
    if months is None:
        months = months_ytd(config.get("months_start", "2026-01"), today)
    month_set = set(months)

    if connectors is None:
        connectors = {
            "runpod": lambda creds, months, **kw: _gpu_runs.runs_rows_runpod(
                creds, months, **{k: v for k, v in kw.items() if k == "http"}
            ),
            "modal": lambda creds, months, **kw: _gpu_runs.runs_rows_modal(
                creds, months, **{k: v for k, v in kw.items() if k == "run_cmd"}
            ),
            "vast": lambda creds, months, **kw: _gpu_runs.runs_rows_vast(
                creds, months, today,
                **{k: v for k, v in kw.items() if k == "run_cmd"}
            ),
        }

    # Restrict to requested vendors if --vendor given. Lambda has no
    # connector — manual-only.
    _vendor_connector_map = {
        "runpod":  "runpod",
        "modal":   "modal",
        "vast.ai": "vast",
    }

    fresh_rows = []
    errors = []
    all_slugs = []

    for vendor_slug, connector_key in _vendor_connector_map.items():
        if vendors is not None and vendor_slug not in vendors:
            continue
        if connector_key not in connectors:
            continue
        all_slugs.append(vendor_slug)
        try:
            rows = connectors[connector_key](secrets, months)
            fresh_rows.extend(rows or [])
            statuses[f"runs:{vendor_slug}"] = f"ok:{len(rows or [])} rows"
        except Exception as e:
            msg = _sanitize_err(e, secrets)
            statuses[f"runs:{vendor_slug}"] = f"err:{msg}"
            errors.append(f"{vendor_slug}: {msg}")

    if errors and len(errors) == len(all_slugs):
        raise RuntimeError("all gpu runs connectors failed: " + "; ".join(errors))

    # Validate fresh rows.
    for row in fresh_rows:
        _validate_gpu_runs_row(row)

    # Determine scope predicate.
    def in_scope(row):
        return (
            (vendors is None or row.get("vendor") in vendors)
            and row.get("month") in month_set
        )

    # Retrieve surviving manual rows from existing snapshot.
    existing = guard["existing"].get("gpu_runs", [])
    manual_rows = [
        row for row in existing
        if row.get("source") == "manual" and in_scope(row)
    ]

    # Manual outranks api/cli per (vendor, month, run_id) key.
    manual_keys = {_gpu_runs_key(row) for row in manual_rows}
    fresh_non_manual = [
        row for row in fresh_rows
        if _gpu_runs_key(row) not in manual_keys
    ]

    merged = fresh_non_manual + manual_rows

    # Validate merged rows too.
    for row in merged:
        _validate_gpu_runs_row(row)

    assert_fresh_in_scope("gpu_runs", merged, in_scope)
    final_rows = splice_rows(existing, merged, in_scope)
    guarded_replace(ops_replace, "gpu_runs", final_rows, guard, statuses)
    statuses["gpu_runs_rows"] = len(final_rows)


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
    parser.add_argument("--only", choices=["provider", "pollen", "revenue", "transactions", "fleet", "billing", "runs"])
    parser.add_argument("--vendor", help="provider, billing, or runs: re-fetch one connector")
    parser.add_argument("--month", help="restrict to one YYYY-MM month")
    args = parser.parse_args(argv)

    if args.vendor is not None:
        if args.only not in ("provider", "billing", "runs"):
            parser.error("--vendor requires --only provider, --only billing, or --only runs")
        if args.only == "provider":
            meter_slugs = [slug for slug, _ in registry.METER]
            if args.vendor not in meter_slugs:
                parser.error(
                    "--vendor must be a meter connector slug "
                    f"({', '.join(meter_slugs)}); manual-only vendors are "
                    "updated with ingest.record"
                )
        elif args.only == "billing":
            billing_slugs = ["runpod", "modal", "vast.ai"]
            if args.vendor not in billing_slugs:
                parser.error(
                    "--vendor with --only billing must be a billing connector slug "
                    f"({', '.join(billing_slugs)})"
                )
        elif args.only == "runs":
            runs_slugs = ["runpod", "modal", "vast.ai"]
            if args.vendor not in runs_slugs:
                parser.error(
                    "--vendor with --only runs must be a runs connector slug "
                    f"({', '.join(runs_slugs)}); lambda has no connector — "
                    "manual-only vendors are updated with ingest.record"
                )
    if args.month is not None and not _MONTH_RE.match(args.month):
        parser.error("--month must be YYYY-MM")

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
            for ds in ("provider_monthly", "pollen_monthly", "revenue_monthly",
                       "transactions", "grants", "ingest_runs", "gpu_fleet",
                       "gpu_billing", "gpu_runs")
        },
    }
    print(f"backup: {backup_dir}")

    months = [args.month] if args.month else None
    vendors = [args.vendor] if args.vendor else None

    statuses, notes = {}, []
    try:
        if args.only in (None, "provider"):
            refresh_provider_monthly(
                ops_replace,
                secrets,
                config,
                today,
                statuses,
                guard,
                vendors=vendors,
                months=months,
            )
        if args.only in (None, "pollen"):
            refresh_pollen_monthly(
                ops_replace, tb_prod, config, today, statuses, guard, months=months
            )
        if args.only in (None, "revenue"):
            refresh_revenue_monthly(
                ops_replace, secrets, config, today, statuses, guard, months=months
            )
        if args.only in (None, "transactions"):
            refresh_transactions(
                ops_replace, secrets, config, today, statuses, guard, months=months
            )
        if args.only in (None, "fleet"):
            now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            refresh_gpu_fleet(ops_ingest, secrets, now, statuses)
        if args.only in (None, "billing"):
            refresh_gpu_billing(
                ops_replace,
                secrets,
                config,
                today,
                statuses,
                guard,
                vendors=vendors,
                months=months,
            )
        if args.only in (None, "runs"):
            refresh_gpu_runs(
                ops_replace,
                secrets,
                config,
                today,
                statuses,
                guard,
                vendors=vendors,
                months=months,
            )
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
