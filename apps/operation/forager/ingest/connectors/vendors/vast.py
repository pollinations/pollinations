"""Vast.ai CLI meter connector.

Meter:   `vastai show invoices --raw -s <start> -e <end>` → type=charge rows
attributed to USAGE months. The explicit date window is LOAD-BEARING: without
-s/-e the (deprecated but working) command silently defaults to TODAY only,
which is how months of history went missing before 2026-07.

USAGE-MONTH ATTRIBUTION (the provider_monthly month contract): vast posts
charges at rollup events, not usage days — a long-running instance can bill
1,400 GPU-hours in a single entry weeks after the usage (Feb–Mar 2026 usage
posted Apr 3/5 was a $4.5k month shift). Every charge line is `hours × $/hr`
with wall-clock hours in `quantity`, so its covered window is exactly
[timestamp − quantity hours, timestamp]; amounts are spread across calendar
months by overlap. Lines without a usable quantity fall back to the posting
month. Because rollups post AFTER the usage they cover, the CLI window end
extends past `today`, not just past the requested months.

No API key is passed on the command line (vastai reads ~/.config/vastai/vast_api_key),
so there is no key exposure risk in the subprocess call.

Source: cli
"""
import datetime
import json
import subprocess

from . import _mrow


def _window(months, today):
    """CLI date window: first day of min month → the day after `today`.

    The end extends past today (not just past max(months)) because charges
    covering the requested months can be POSTED later — a rollup posted in
    July can cover June usage.
    """
    start = f"{min(months)}-01"
    end_day = datetime.date.fromisoformat(today) + datetime.timedelta(days=1)
    y, m = int(max(months)[:4]), int(max(months)[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    month_end = datetime.date(ny, nm, 1)
    return start, max(end_day, month_end).isoformat()


def _spread(ts, hours, amount):
    """Split one charge across the calendar months of its covered window.

    The window ends at the posting timestamp and spans `hours` wall-clock
    hours backwards. Returns {"YYYY-MM": part} with parts proportional to
    each month's overlap; hours <= 0 puts everything in the posting month.
    """
    end = datetime.datetime.utcfromtimestamp(float(ts))
    if hours <= 0:
        return {end.strftime("%Y-%m"): amount}
    start = end - datetime.timedelta(hours=hours)
    total = (end - start).total_seconds()
    parts = {}
    cur = start
    while cur < end:
        next_month = (
            cur.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            + datetime.timedelta(days=32)
        ).replace(day=1)
        segment_end = min(next_month, end)
        key = cur.strftime("%Y-%m")
        share = amount * (segment_end - cur).total_seconds() / total
        parts[key] = parts.get(key, 0.0) + share
        cur = segment_end
    return parts


def meter(creds, months, today, run_cmd=subprocess.run):
    """Fetch Vast.ai metered usage per USAGE month from the invoices ledger.

    Calls `vastai show invoices --raw` with an explicit date window, filters
    type=charge rows, spreads each charge over its covered usage window
    (see _spread), and sums per month.

    Args:
        creds:   dict (unused for auth — CLI reads its own config file)
        months:  list of "YYYY-MM" strings to include in output
        today:   current ingest date ("YYYY-MM-DD")
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts, one per month with nonzero charge total
    """
    import collections

    if not months:
        raise RuntimeError("vast.ai meter requires at least one month")
    start, end = _window(months, today)
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
        try:
            hours = float(row.get("quantity") or 0)
        except (TypeError, ValueError):
            hours = 0.0
        for mo, part in _spread(ts, hours, float(row.get("amount") or 0)).items():
            if mo in month_set:
                totals[mo] += part

    rows = []
    for month in sorted(totals):
        cost = round(totals[month], 2)
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
