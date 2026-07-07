"""Vast.ai CLI meter connector.

Meter:   `vastai show invoices --raw -s <start> -e <end>` → type=charge rows
grouped by month. The explicit date window is LOAD-BEARING: without -s/-e the
(deprecated but working) command silently defaults to TODAY only, which is how
months of history went missing before 2026-07.

No API key is passed on the command line (vastai reads ~/.config/vastai/vast_api_key),
so there is no key exposure risk in the subprocess call.

Source: cli
"""
import datetime
import json
import subprocess

from . import _mrow


def _window(months):
    """CLI date window covering every requested month (end = first day after)."""
    start = f"{min(months)}-01"
    y, m = int(max(months)[:4]), int(max(months)[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    end = f"{ny:04d}-{nm:02d}-01"
    return start, end


def meter(creds, months, today, run_cmd=subprocess.run):
    """Fetch Vast.ai metered usage per month from the invoices ledger.

    Calls `vastai show invoices --raw` with an explicit date window, filters
    type=charge rows, groups by UTC month of the timestamp, and sums amounts.

    Args:
        creds:   dict (unused for auth — CLI reads its own config file)
        months:  list of "YYYY-MM" strings to include in output
        today:   current ingest date
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts, one per month with nonzero charge total
    """
    import collections

    if not months:
        raise RuntimeError("vast.ai meter requires at least one month")
    start, end = _window(months)
    try:
        r = run_cmd(
            ["vastai", "show", "invoices", "--raw", "-s", start, "-e", end],
            capture_output=True, text=True, timeout=30,
        )
    except FileNotFoundError:
        raise RuntimeError("vastai CLI not installed (pip install vastai)")

    if r.returncode != 0:
        raise RuntimeError("vastai show invoices failed (rc=%d)" % r.returncode)

    try:
        d = json.loads(r.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("vastai show invoices returned non-JSON output")

    month_set = set(months)
    totals = collections.defaultdict(float)
    for row in (d or []):
        if row.get("type") != "charge":
            continue
        ts = row.get("timestamp")
        if not ts:
            continue
        mo = datetime.datetime.utcfromtimestamp(float(ts)).strftime("%Y-%m")
        if mo not in month_set:
            continue
        totals[mo] = round(totals[mo] + float(row.get("amount") or 0), 2)

    rows = []
    for month in sorted(totals):
        cost = totals[month]
        if cost:
            rows.append(_mrow(
                month=month,
                vendor="vast.ai",
                amount=cost,
                funding="prepaid",
                source="cli",
                today=today,
            ))
    return rows
