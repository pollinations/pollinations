"""Fireworks meter connector via firectl CLI.

Keys:
  FIREWORKS_API_KEY            — API key for firectl

Security: --api-key value is never echoed in exception messages.
"""
import subprocess

from . import _mrow


def meter(creds, months, today, run_cmd=subprocess.run):
    """Fetch Fireworks cash cost by usage month from the invoice ledger.

    Calls `firectl billing list-invoices --api-key …`. Only POSTPAID_BILLING+PAID
    rows count. The monthly invoice is cut on the 1st and covers the PREVIOUS month
    (invoice date 2026-07-01 → usage month 2026-06). PREPAID_CREDITS top-ups are
    ignored.  Zero-amount invoices are excluded.

    Args:
        creds:   dict with FIREWORKS_API_KEY
        months:  list of "YYYY-MM" strings to include in output
        today:   current ingest date
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts with funding=cash for nonzero usage months
    """
    key = creds.get("FIREWORKS_API_KEY")
    if not key:
        raise RuntimeError("FIREWORKS_API_KEY missing")

    r = run_cmd(
        ["firectl", "billing", "list-invoices", "--api-key", key],
        capture_output=True, text=True, timeout=60,
    )
    if r.returncode != 0:
        raise RuntimeError("firectl billing list-invoices failed")
    txt = r.stdout

    month_set = set(months)
    totals: dict = {}
    for line in txt.splitlines():
        t = line.split()
        if "POSTPAID_BILLING" not in t:
            continue
        i = t.index("POSTPAID_BILLING")
        try:
            amt = float(t[i - 2].replace(",", ""))
        except (ValueError, IndexError):
            continue
        if len(t) <= i + 3:
            continue
        state = t[i + 2]
        target = t[i + 3]  # invoice date, e.g. "2026-07-01"
        if state != "PAID" or amt <= 0:
            continue
        ty, tm = int(target[:4]), int(target[5:7])
        # Invoice cut on the 1st covers the previous calendar month
        if tm == 1:
            usage_m = f"{ty - 1}-12"
        else:
            usage_m = f"{ty:04d}-{tm - 1:02d}"
        if usage_m not in month_set:
            continue
        d = totals.setdefault(usage_m, 0.0)
        totals[usage_m] = round(d + amt, 2)

    rows = []
    for month in sorted(totals):
        cost = totals[month]
        if cost:
            rows.append(_mrow(
                month=month,
                provider="fireworks",
                cost_usd=cost,
                funding="cash",
                source="cli",
                today=today,
            ))
    return rows
