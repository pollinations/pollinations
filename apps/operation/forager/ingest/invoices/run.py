"""Analyze PDFs from inbox/ and append validated invoices to Tinybird.

Run from apps/operation/forager:
    python3 -m ingest.invoices.run
"""
import argparse
import datetime
import json

from .. import creds, tb
from . import harvest


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Analyze PDFs from inbox/ and append validated invoices to Tinybird."
    )
    parser.parse_args(argv)

    today = datetime.date.today().isoformat()
    c, cfg = creds.load_creds(), creds.load_config()
    ops_ingest = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])

    stats = harvest.inbox_sweep(cfg, ops_ingest, today)
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    ops_ingest.append("ingest_runs", [{
        "run_at": now,
        "ok": 1 if stats.get("quarantined", 0) == 0 else 0,
        "statuses": json.dumps({"inbox": stats}),
        "notes": "invoice-inbox-analyze",
    }])
    print(f"invoice-inbox-analyze: {stats}")


if __name__ == "__main__":
    main()
