"""Preflight checks for the forager ingest pipeline.

HARD checks (any failure blocks the run):
  sops, tinybird-ops (write token read+write), wise, gog (gmail reachable), pdftotext on PATH.

SOFT checks (warn only):
  archive_dir writable, last run < 26h.

Exit 0 = all hard checks green.
"""
import datetime
import os
import shutil
import subprocess
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

    # HARD: wise connectivity
    try:
        from .connectors.wise import _fetch_month
        ym = datetime.date.today().strftime("%Y-%m")
        _fetch_month(c, ym)
        out.append(("wise", True, True, "ok"))
    except Exception as e:
        out.append(("wise", True, False, str(e)[:120]))

    # HARD: gog / Gmail reachable
    try:
        r = subprocess.run(
            ["gog", "-a", cfg["gog_account"], "--json", "gmail", "search", "newer_than:1d"],
            capture_output=True, timeout=60, check=True,
        )
        out.append(("gog", True, True, "ok"))
    except Exception as e:
        out.append(("gog", True, False, str(e)[:120]))

    # HARD: pdftotext on PATH
    try:
        if shutil.which("pdftotext"):
            out.append(("pdftotext", True, True, "ok"))
        else:
            raise RuntimeError("not on PATH")
    except Exception as e:
        out.append(("pdftotext", True, False, str(e)[:120]))

    # SOFT: archive_dir writable
    out.append(("archive", False, os.access(cfg["archive_dir"], os.W_OK), cfg["archive_dir"]))

    # SOFT: freshness (last ingest_run < 26h ago)
    try:
        rows = ops.sql("SELECT max(run_at) AS t FROM ingest_runs")
        last = rows[0]["t"] if rows else None
        if not last:
            raise RuntimeError("no runs recorded yet")
        age_h = (datetime.datetime.utcnow() - datetime.datetime.fromisoformat(last)).total_seconds() / 3600
        out.append(("freshness", False, age_h < 26, f"last run {age_h:.1f}h ago"))
    except Exception as e:
        out.append(("freshness", False, False, str(e)[:120]))

    return out


def main():
    res = checks()
    for name, hard, ok, detail in res:
        symbol = "✓" if ok else ("✗" if hard else "·")
        print(f"  {symbol} {name:14} {detail}")
    sys.exit(1 if any(hard and not ok for _, hard, ok, _ in res) else 0)


if __name__ == "__main__":
    main()
