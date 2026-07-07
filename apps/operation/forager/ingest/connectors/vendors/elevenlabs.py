"""ElevenLabs meter connector — workspace analytics with a grant waterfall.

Witness = `POST /v1/workspace/analytics/query/usage-by-product-over-time`
(admin-scoped xi-api-key): columnar daily rows; `total_cost` with
column_units=usd is the fiat cost of consumption.

Funding is a grant waterfall (fireworks/runpod/anthropic precedent): the
$3,300 startup grant covered usage from 2026-02 until it ran dry — usage
alone exceeded it mid-April (Feb 954.00 + Mar 1,821.77 crossed 3,300 during
April), after which Elliot paid via top-ups and then a monthly subscription.
Months before GRANT_FROM are cash. The meter's cost can differ from the card
total (the subscription plan fee and overage timing live on the invoice, not
in analytics) — that gap is the Δ column's story, not an error.

Creds: ELEVENLABS_API_KEY (must be admin/usage-scoped; a plain key 401s).
"""
import datetime
from collections import defaultdict

from ..common import http_json, months_ytd
from . import _mrow

_URL = "https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time"

GRANT_USD = 3_300.0
GRANT_FROM = "2026-02"
MONTHS_START = "2026-01"


def _ms(month):
    """First instant of 'YYYY-MM' as unix milliseconds."""
    y, m = int(month[:4]), int(month[5:7])
    return int(datetime.datetime(y, m, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def _next_month(month):
    y, m = int(month[:4]), int(month[5:7])
    return f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"


def meter(creds, months, today):
    """Fetch ElevenLabs fiat cost per month, credit/paid via the waterfall.

    The waterfall always replays from MONTHS_START so scoped runs still see
    the grant state; only the requested months are emitted.

    Args:
        creds:  dict with ELEVENLABS_API_KEY
        months: list of "YYYY-MM" strings to query
        today:  current ingest date

    Returns:
        list of _mrow dicts (USD) — at most one credit and one cash row per
        month (merge_meter_rows folds them into a single table row).
    """
    if not months:
        raise RuntimeError("elevenlabs meter requires at least one month")
    key = creds.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY missing")

    walk = months_ytd(MONTHS_START, today)
    body = {
        "start_time": _ms(MONTHS_START),
        "end_time": _ms(_next_month(max(list(months) + list(walk)))),
        "interval_seconds": 86400,
        "column_units": "usd",
    }
    d = http_json(_URL, {"xi-api-key": key}, data=body)
    columns = d.get("columns") or []
    if "timestamp" not in columns or "total_cost" not in columns:
        raise RuntimeError("elevenlabs analytics response missing expected columns")
    ti, ci = columns.index("timestamp"), columns.index("total_cost")

    totals = defaultdict(float)
    for row in d.get("rows") or []:
        totals[str(row[ti])[:7]] += float(row[ci] or 0)

    wanted = set(months)
    remaining = GRANT_USD
    rows = []
    for month in walk:
        usage = round(totals.get(month, 0.0), 2)
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
                    vendor="elevenlabs",
                    amount=amount,
                    funding=funding,
                    source="api",
                    today=today,
                ))
    return rows
