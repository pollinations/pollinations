"""Vast.ai CLI balance + meter connector.

Balance: `vastai show user --raw` → .credit (prepaid balance).
Meter:   `vastai show invoices --raw` → type=charge rows grouped by month.

No API key is passed on the command line (vastai reads ~/.config/vastai/vast_api_key),
so there is no key exposure risk in the subprocess call.

Source: cli
"""
import datetime
import json
import subprocess

from . import _brow, _mrow


def meter(creds, months, today, run_cmd=subprocess.run):
    """Fetch Vast.ai metered usage per month from the invoices ledger.

    Calls `vastai show invoices --raw`, filters type=charge rows, groups by
    UTC month of the timestamp, and sums amounts.

    Args:
        creds:   dict (unused for auth — CLI reads its own config file)
        months:  list of "YYYY-MM" strings to include in output
        today:   current ingest date
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts, one per month with nonzero charge total
    """
    import collections

    try:
        r = run_cmd(["vastai", "show", "invoices", "--raw"], capture_output=True, text=True, timeout=30)
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
                provider="vast.ai",
                cost_usd=cost,
                funding="prepaid",
                source="cli",
                today=today,
            ))
    return rows


def balance(creds, now, run_cmd=subprocess.run):
    """Fetch Vast.ai prepaid credit balance via the vastai CLI.

    Args:
        creds:   dict (unused for auth — CLI reads its own config file)
        now:     run_at timestamp string "YYYY-MM-DD HH:MM:SS"
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        balances row dict with prepaid_left_usd set
    """
    try:
        r = run_cmd(["vastai", "show", "user", "--raw"], capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        raise RuntimeError("vastai CLI not installed (pip install vastai)")

    if r.returncode != 0:
        raise RuntimeError("vastai show user failed (rc=%d)" % r.returncode)

    try:
        d = json.loads(r.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("vastai show user returned non-JSON output")

    if d.get("credit") is None:
        raise RuntimeError("no .credit field in vastai show user response")

    return _brow(
        now,
        "vast.ai",
        prepaid=round(float(d["credit"]), 2),
        source="cli",
    )
