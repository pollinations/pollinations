"""Fireworks meter connector via firectl billing get-usage + list-invoices.

Rated monthly consumption ("account costs") per account is the provider's
meter, on an accrual basis. Funding is a per-account waterfall: every account
started with a $10k credit grant, so consumption is credit until the grant is
exhausted and our money (postpaid invoice / prepaid top-up) after. The
postpaid invoice ledger anchors the exact cash amount in the cutover month
(invoice cut on the 1st covers the previous month's usage).

  FIREWORKS_API_KEY              accounts/pollinations         Pollinations.AI (grant emptied 2026-06)
  FIREWORKS_API_KEY_MYCELI       accounts/elliot-l6mb8f24ewds  Myceli AI (grant emptied 2026-04)
  FIREWORKS_API_KEY_NEO_GLYPH    accounts/elliot-neoglyph      NGLPH OÜ (in use)
  FIREWORKS_API_KEY_PIXELMARKET  accounts/thomas-nqdgpxxgxvk8  Pixelmarket.AI (untouched)

Security: --api-key values are never echoed in exception messages.
"""
import datetime
import json
import subprocess

from . import _mrow
from ..common import months_ytd

GRANT_USD = 10_000.0

ACCOUNT_KEYS = [
    "FIREWORKS_API_KEY",
    "FIREWORKS_API_KEY_MYCELI",
    "FIREWORKS_API_KEY_NEO_GLYPH",
    "FIREWORKS_API_KEY_PIXELMARKET",
]

MONTHS_START = "2026-01"


def _money(value):
    return int(value.get("units", 0)) + value.get("nanos", 0) / 1e9


def _month_window(month, today):
    """[start, end) for one month, end clamped to tomorrow for the running month."""
    year, mon = [int(part) for part in month.split("-")]
    next_year, next_mon = (year + 1, 1) if mon == 12 else (year, mon + 1)
    end = f"{next_year:04d}-{next_mon:02d}-01"
    day_after = (
        datetime.date.fromisoformat(today) + datetime.timedelta(days=1)
    ).isoformat()
    return f"{month}-01", min(end, day_after)


def _run(args, run_cmd, what):
    r = run_cmd(args, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"firectl billing {what} failed")
    return r.stdout


def _account_month_usage(key, month, today, run_cmd):
    start, end = _month_window(month, today)
    out = _run(
        ["firectl", "billing", "get-usage", "--api-key", key,
         "--start-time", start, "--end-time", end,
         "--account-costs-only", "-o", "json"],
        run_cmd, "get-usage",
    )
    items = json.loads(out)["account_costs"]["cost_data_items"]
    return round(sum(_money(item.get("total", {})) for item in items), 2)


def _invoiced_cash_by_month(key, run_cmd):
    """Postpaid billed cash per USAGE month (invoice cut m+1 covers m).

    PREPAID_CREDITS top-ups are balance funding, not consumption; DRAFT and
    zero-amount invoices are skipped.
    """
    out = _run(
        ["firectl", "billing", "list-invoices", "--api-key", key],
        run_cmd, "list-invoices",
    )
    cash = {}
    for line in out.splitlines():
        t = line.split()
        if "POSTPAID_BILLING" not in t:
            continue
        i = t.index("POSTPAID_BILLING")
        try:
            amount = float(t[i - 2].replace(",", ""))
        except (ValueError, IndexError):
            continue
        if len(t) <= i + 3:
            continue
        state, target = t[i + 2], t[i + 3]
        if state == "DRAFT" or amount <= 0:
            continue
        year, mon = int(target[:4]), int(target[5:7])
        usage_month = f"{year - 1}-12" if mon == 1 else f"{year:04d}-{mon - 1:02d}"
        cash[usage_month] = round(cash.get(usage_month, 0.0) + amount, 2)
    return cash


def _account_funding(key, months, today, run_cmd):
    """(month -> (credit, paid)) via the grant waterfall, invoice-anchored.

    Months without a postpaid invoice draw down the grant; the invoice month
    fixes the exact cash and closes the grant; later months are our money.
    """
    invoiced = _invoiced_cash_by_month(key, run_cmd)
    remaining = GRANT_USD
    funding = {}
    for month in months:
        usage = _account_month_usage(key, month, today, run_cmd)
        if not usage:
            funding[month] = (0.0, 0.0)
            continue
        cash = invoiced.get(month, 0.0)
        if cash:
            credit = max(usage - cash, 0.0)
            remaining = 0.0
        else:
            credit = min(usage, remaining)
            remaining = round(remaining - credit, 2)
        funding[month] = (round(credit, 2), round(usage - credit, 2))
    return funding


def meter(creds, months, today, run_cmd=subprocess.run):
    """Fireworks rated consumption per month, credit/paid via the waterfall.

    The waterfall always replays from MONTHS_START so scoped runs still see
    the grant state; only the requested months are emitted.

    Args:
        creds:   dict with the four FIREWORKS_API_KEY* entries
        months:  list of "YYYY-MM" strings to emit
        today:   current ingest date
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts — at most one cash and one credit row per month
        (merge_meter_rows folds them into a single table row).
    """
    missing = [name for name in ACCOUNT_KEYS if not creds.get(name)]
    if missing:
        raise RuntimeError(f"missing fireworks keys: {', '.join(missing)}")

    all_months = months_ytd(MONTHS_START, today)
    wanted = set(months)
    totals = {}
    for name in ACCOUNT_KEYS:
        for month, (credit, paid) in _account_funding(
            creds[name], all_months, today, run_cmd
        ).items():
            entry = totals.setdefault(month, {"credit": 0.0, "paid": 0.0})
            entry["credit"] += credit
            entry["paid"] += paid

    rows = []
    for month in sorted(wanted & totals.keys()):
        for funding, column in (("credit", "credit"), ("cash", "paid")):
            amount = round(totals[month][column], 2)
            if amount:
                rows.append(_mrow(
                    month=month,
                    vendor="fireworks",
                    amount=amount,
                    funding=funding,
                    source="cli",
                    today=today,
                ))
    return rows
