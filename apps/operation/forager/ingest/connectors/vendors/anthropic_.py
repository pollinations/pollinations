"""Anthropic meter connector — Admin API cost report with a grant waterfall.

Witness = `GET api.anthropic.com/v1/organizations/cost_report` (admin key
sk-ant-admin..., header x-api-key + anthropic-version): daily buckets,
amounts are USD in CENTS as decimal strings. Requested month-by-month —
a month never exceeds the 31-bucket request cap, so no pagination.

Funding is a grant waterfall (fireworks/runpod precedent): months before
GRANT_FROM are our money (the 2025-11..2026-01 era of ~$15 auto-recharge
receipts proves cash funding then); from GRANT_FROM consumption is credit
until GRANT_USD is exhausted, our money after. GRANT_USD = 5,000 is
INFERRED, not yet console-confirmed: Feb–Mar burned $4.8k with zero bank
cash (a credit grant landed ~Feb 2026), card auto-recharges resumed
2026-04-01 exactly when Feb-onward consumption crossed $5k (Feb 229.98 +
Mar 4,586.60 + Apr 183.42 = 5,000.00 to the cent), and April's post-grant
consumption ($964) matches April's receipts (~$994) minus a small residual
balance. Confirm on console.anthropic.com; if the size differs, fix the
constant and re-run — the waterfall replays from MONTHS_START on every run.

Creds: ANTHROPIC_ADMIN_KEY (minted by an org admin in the Console).
"""
from ..common import http_json, months_ytd
from . import _mrow

_COST_URL = "https://api.anthropic.com/v1/organizations/cost_report"

GRANT_USD = 5_000.0
GRANT_FROM = "2026-02"
MONTHS_START = "2026-01"


def _month_window(month):
    """[start, end) RFC3339 window for one calendar month."""
    y, m = int(month[:4]), int(month[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    return (
        f"{month}-01T00:00:00Z",
        f"{ny:04d}-{nm:02d}-01T00:00:00Z",
    )


def _month_cost(key, month):
    """Total consumption for one month in USD (API reports cents)."""
    start, end = _month_window(month)
    url = f"{_COST_URL}?starting_at={start}&ending_at={end}&limit=31"
    d = http_json(url, {"x-api-key": key, "anthropic-version": "2023-06-01"})
    cents = 0.0
    for bucket in d.get("data") or []:
        for result in bucket.get("results") or []:
            cents += float(result.get("amount") or 0)
    return round(cents / 100, 2)


def meter(creds, months, today):
    """Anthropic consumption per month, credit/paid via the waterfall.

    The waterfall always replays from MONTHS_START so scoped runs still see
    the grant state; only the requested months are emitted.

    Args:
        creds:  dict with ANTHROPIC_ADMIN_KEY
        months: list of "YYYY-MM" strings to emit
        today:  current ingest date

    Returns:
        list of _mrow dicts — at most one credit and one cash row per month
        (merge_meter_rows folds them into a single table row).
    """
    if not months:
        raise RuntimeError("anthropic meter requires at least one month")
    key = creds.get("ANTHROPIC_ADMIN_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_ADMIN_KEY missing")

    wanted = set(months)
    remaining = GRANT_USD
    rows = []
    for month in months_ytd(MONTHS_START, today):
        usage = _month_cost(key, month)
        if not usage:
            continue
        credit = 0.0 if month < GRANT_FROM else round(min(usage, remaining), 2)
        remaining = round(remaining - credit, 2)
        if month not in wanted:
            continue
        for funding, amount in (("credit", credit), ("cash", round(usage - credit, 2))):
            if amount:
                rows.append(_mrow(
                    month=month,
                    vendor="anthropic",
                    amount=amount,
                    funding=funding,
                    source="api",
                    today=today,
                ))
    return rows
