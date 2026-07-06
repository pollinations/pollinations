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
import inspect
import json
import sys

from . import creds, enty, tb
from .connectors import registry
from .connectors import usage as _usage
from .connectors.common import months_ytd
from .connectors.providers import _validate_meter_values
from .connectors.providers import stripe as _stripe


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


def dedupe_meter(rows):
    """One row per (provider, month, funding), preferring manual rows."""

    def _rank(row):
        return _SRC_RANK.get(row.get("source", "manual"), 99)

    best = {}
    for row in rows:
        key = (row.get("provider", ""), row.get("month", ""), row.get("funding", ""))
        prev = best.get(key)
        if prev is None or _rank(row) <= _rank(prev):
            best[key] = row
    return list(best.values())


def validate_meter_rows(rows):
    for row in rows:
        _validate_meter_values(
            row.get("provider", ""),
            row.get("funding", ""),
            row.get("source", ""),
        )


def _sanitize_err(e, creds_dict):
    msg = type(e).__name__ + ": " + str(e)
    for val in creds_dict.values():
        if val and isinstance(val, str) and len(val) > 3:
            msg = msg.replace(val, "***")
    return msg[:200]


def refresh_meter_monthly(ops_ingest, ops_replace, secrets, config, today, statuses):
    fx = config["fx_eur_usd"]
    months = months_ytd(config["months_start"], today)
    meter_new = []
    errors = []

    for slug, fn in registry.METER:
        try:
            sig = inspect.signature(fn)
            rows = (
                fn(secrets, months, today, fx=fx)
                if "fx" in sig.parameters
                else fn(secrets, months, today)
            )
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

    meter_table = ops_ingest.sql("SELECT * FROM meter_monthly")
    validate_meter_rows(meter_table)
    meter_merged = dedupe_meter(meter_table + meter_new)
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
