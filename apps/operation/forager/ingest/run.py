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

import datetime
import json
import sys

from . import creds, enty, tb
from .connectors import registry
from .connectors import usage as _usage
from .connectors.common import months_ytd
from .connectors.providers import _validate_meter_source
from .connectors.providers import stripe as _stripe
from .aliases import PROVIDER_ALIASES


_SRC_RANK = {"manual": 0, "api": 1, "cli": 2, "bq": 3}


def load_overrides(ops_ingest):
    """Latest operator override per (scope, key, field)."""
    rows = ops_ingest.sql(
        "SELECT scope, key, field, argMax(value_num, entered_at) AS value_num, "
        "argMax(value_str, entered_at) AS value_str FROM overrides GROUP BY scope, key, field"
    )
    return {
        (r["scope"], r["key"], r["field"]): (
            r["value_num"] if r.get("value_num") is not None else r.get("value_str", "")
        )
        for r in rows
    }


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


def meter_manual_reset_keys(overrides):
    return {
        key
        for (scope, key, field), value in overrides.items()
        if scope == "meter_monthly"
        and field == "reset_manual"
        and str(value).strip() == "1"
    }


def meter_row_key(row):
    return f"{row.get('provider', '')}|{row.get('month', '')}|{row.get('currency', '')}"


def _has_manual_source(row):
    return "manual" in _meter_sources(row.get("source", ""))


def without_reset_manual_meter_rows(rows, overrides):
    reset_keys = meter_manual_reset_keys(overrides)
    if not reset_keys:
        return rows
    return [
        row
        for row in rows
        if not _has_manual_source(row) or meter_row_key(row) not in reset_keys
    ]


def existing_manual_meter_rows(rows, overrides):
    return [
        row
        for row in without_reset_manual_meter_rows(rows, overrides)
        if _has_manual_source(row)
    ]


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


def refresh_meter_monthly(
    ops_ingest,
    ops_replace,
    secrets,
    config,
    today,
    statuses,
    overrides,
):
    months = months_ytd(config["months_start"], today)
    meter_new = []
    errors = []

    for slug, fn in registry.METER:
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

    meter_manual = existing_manual_meter_rows(
        ops_ingest.sql("SELECT * FROM meter_monthly"),
        overrides,
    )
    validate_meter_rows(meter_manual)
    meter_merged = merge_meter_rows(meter_new + meter_manual)
    validate_meter_rows(meter_merged)
    ops_replace.replace("meter_monthly", meter_merged)
    statuses["meter_rows"] = len(meter_merged)


def refresh_usage_monthly(ops_replace, tb_prod, config, today, statuses):
    rows = _usage.monthly_rows(tb_prod, months_ytd(config["months_start"], today), today)
    if not rows:
        raise RuntimeError("usage_monthly returned 0 rows")
    ops_replace.replace("usage_monthly", rows)
    statuses["usage"] = len(rows)


def refresh_revenue_monthly(ops_replace, secrets, config, today, statuses):
    rows = _stripe.revenue_rows(
        secrets,
        months_ytd(config["months_start"], today),
        today,
    )
    if not rows:
        raise RuntimeError("revenue_monthly returned 0 rows")
    ops_replace.replace("revenue_monthly", rows)
    statuses["revenue"] = len(rows)


def refresh_transactions(ops_replace, secrets, config, overrides, statuses):
    rows = enty.build_transactions({**config, "overrides": overrides}, secrets)
    if not rows:
        raise RuntimeError("transactions returned 0 rows")
    ops_replace.replace("transactions", rows)
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


def main():
    if len(sys.argv) > 1:
        raise SystemExit("usage: python3 -m ingest.run")

    today = datetime.date.today().isoformat()
    secrets, config = creds.load_creds(), creds.load_config()

    ops_ingest = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
    ops_replace = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_REPLACE_TOKEN"])
    tb_prod = tb.TB(config["tb_prod_api"], secrets["TINYBIRD_PROD_READ_TOKEN"])

    statuses, notes = {}, []
    try:
        overrides = load_overrides(ops_ingest)
        refresh_meter_monthly(
            ops_ingest,
            ops_replace,
            secrets,
            config,
            today,
            statuses,
            overrides,
        )
        refresh_usage_monthly(ops_replace, tb_prod, config, today, statuses)
        refresh_revenue_monthly(ops_replace, secrets, config, today, statuses)
        refresh_transactions(ops_replace, secrets, config, overrides, statuses)
    except Exception as e:
        statuses["run"] = "err:" + _sanitize_err(e, secrets)
        notes.append(f"run failed: {statuses['run']}")
        append_run_log(ops_ingest, statuses, notes)
        raise

    append_run_log(ops_ingest, statuses, notes)
    print(f"ingested: {statuses}" + (f"  NOTES: {notes}" if notes else ""))


if __name__ == "__main__":
    main()
