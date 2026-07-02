"""Daily ingest → operations workspace.

    python3 -m ingest.run              # daily: harvest new invoices + repull last N months
    python3 -m ingest.run --backfill   # everything since config.months_start

TOKEN MODEL: two TB instances:
  ops_ingest  — TINYBIRD_OPS_INGEST_TOKEN  → .append() and .sql()
  ops_replace — TINYBIRD_OPS_REPLACE_TOKEN → every .replace() call (needs CREATE scope)
"""
import datetime
import json
import sys

from . import creds, gaps, tb
from .connectors import wise
from .connectors.common import months_ytd
from .invoices import harvest


def main():
    backfill = "--backfill" in sys.argv
    today = datetime.date.today().isoformat()
    c, cfg = creds.load_creds(), creds.load_config()

    # Two tokens — see MODULE DOCSTRING
    ops_ingest = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])
    ops_replace = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_REPLACE_TOKEN"])

    st, notes = {}, []
    all_months = months_ytd(cfg["months_start"], today)
    win = all_months if backfill else all_months[-cfg["repull_months"]:]

    # 1. Harvest invoices (append, deduped by sha256 inside harvest)
    since = cfg["months_start"].replace("-", "/") + "/01" if backfill else None
    st["harvest_gmail"] = harvest.gmail_sweep(cfg, ops_ingest, today, since=since)
    st["harvest_inbox"] = harvest.inbox_sweep(cfg, ops_ingest, today)

    # 2. Payments (Wise outflows) — per month in window
    try:
        for ym in win:
            rows = wise.outflow_rows(c, [ym], cfg["fx_eur_usd"], today)
            if rows:
                ops_replace.replace("payments", rows, condition=f"month='{ym}'")
            else:
                notes.append(f"wise:{ym}: 0 rows — payments table unchanged")
            st[f"wise:{ym}"] = len(rows)
    except Exception as e:
        notes.append(f"wise FAILED, months kept: {e}")

    # 3. Gaps / reconciliation — read facts back, run pure engine, write result
    invoices = ops_ingest.sql("SELECT * FROM invoices")
    payments = ops_ingest.sql("SELECT * FROM payments")
    pools = creds.load_credits().get("pools", [])

    rrows = gaps.run(invoices, payments, pools, all_months, cfg, today)
    if rrows:
        ops_replace.replace("reconciliation", rrows)
    else:
        notes.append("gaps: 0 verdict rows — reconciliation table unchanged")
    st["recon"] = len(rrows)

    # 4. Ingest run log
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    ops_ingest.append("ingest_runs", [{
        "run_at": now,
        "ok": 0 if notes else 1,
        "statuses": json.dumps(st),
        "notes": "; ".join(notes),
    }])

    print(f"ingested: {st}" + (f"  NOTES: {notes}" if notes else ""))

    # 5. Chase list — print providers that need attention
    chase = [r for r in rrows if r["status"] in ("missing_invoice", "amount_mismatch", "needs_label")]
    if chase:
        print("CHASE LIST:")
        for r in chase:
            print(f"  {r['month']} {r['provider']:14} {r['status']:16} "
                  f"inv=${r['invoice_usd']:.0f} pay=${r['payment_usd']:.0f}")


if __name__ == "__main__":
    main()
