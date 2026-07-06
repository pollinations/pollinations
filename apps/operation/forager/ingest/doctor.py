"""Preflight checks for the forager ingest pipeline.

HARD checks (any failure blocks the run):
  sops, tinybird-ops (write token read+write), Wise credentials.

SOFT checks (warn only):
  last run < 26h.

Exit 0 = all hard checks green.
"""
import datetime
import os
import shutil
import sys

from . import creds, tb


def checks():
    """Run all checks. Returns list of (name, hard, ok, detail) tuples."""
    out = []

    # SOPS must succeed first — everything else needs decrypted creds/config
    try:
        c = creds.load_creds()
        cfg = creds.load_config()
        out.append(("sops", True, True, "decrypted"))
    except Exception as e:
        return [("sops", True, False, str(e)[:120])]

    ops = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])

    # HARD: tinybird-ops read+write
    try:
        ops.sql("SELECT count() AS n FROM ingest_runs")
        out.append(("tinybird-ops", True, True, "ok"))
    except Exception as e:
        out.append(("tinybird-ops", True, False, str(e)[:120]))

    # HARD: Wise credentials (transactions source)
    wise_missing = [
        key
        for key in ("WISE_API_TOKEN", "WISE_BUSINESS_PROFILE_ID")
        if not c.get(key)
    ]
    out.append((
        "wise-creds",
        True,
        not wise_missing,
        "present" if not wise_missing else f"missing: {', '.join(wise_missing)}",
    ))

    # SOFT: freshness (last ingest_run < 26h ago)
    try:
        rows = ops.sql("SELECT max(run_at) AS t FROM ingest_runs")
        last = rows[0]["t"] if rows else None
        if not last:
            raise RuntimeError("no runs recorded yet")
        last_dt = datetime.datetime.fromisoformat(last).replace(
            tzinfo=datetime.timezone.utc
        )
        age_h = (
            datetime.datetime.now(datetime.timezone.utc) - last_dt
        ).total_seconds() / 3600
        out.append(("freshness", False, age_h < 26, f"last run {age_h:.1f}h ago"))
    except Exception as e:
        out.append(("freshness", False, False, str(e)[:120]))

    # SOFT: CLI tools required by connectors
    _clis = ["vastai", "firectl", "aws", "bq"]
    missing = [cli for cli in _clis if not shutil.which(cli)]
    out.append(("clis", False, not missing,
                "all present" if not missing else f"missing: {', '.join(missing)}"))

    # SOFT: Tinybird prod read token (generation_event today count)
    try:
        tb_prod = tb.TB(cfg["tb_prod_api"], c["TINYBIRD_PROD_READ_TOKEN"])
        rows = tb_prod.sql(
            "SELECT count() AS n FROM generation_event "
            "WHERE start_time >= toStartOfDay(now())"
        )
        n = rows[0]["n"] if rows else 0
        out.append(("tb-prod", False, True, f"today={n} events"))
    except Exception as e:
        out.append(("tb-prod", False, False, str(e)[:120]))

    return out


def main():
    res = checks()
    for name, hard, ok, detail in res:
        symbol = "✓" if ok else ("✗" if hard else "·")
        print(f"  {symbol} {name:14} {detail}")
    sys.exit(1 if any(hard and not ok for _, hard, ok, _ in res) else 0)


if __name__ == "__main__":
    main()
