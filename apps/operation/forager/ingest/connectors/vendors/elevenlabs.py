"""ElevenLabs meter connector — workspace analytics.

Witness = `POST /v1/workspace/analytics/query/usage-by-product-over-time`
(admin-scoped xi-api-key): columnar daily rows; `total_cost` with
column_units=usd is the fiat cost of consumption.

Funding cutover: the "3 months free" startup grant silently covered
2026-02..2026-04 (no Wise cash exists before 2026-05; card charges start
2026-05-02) — months before _CASH_FROM are credit, from it on cash. The
meter's cost can differ from the card total (the subscription plan fee and
overage timing live on the invoice, not in analytics) — that gap is the
Δ column's story, not an error.

Creds: ELEVENLABS_API_KEY (must be admin/usage-scoped; a plain key 401s).
"""
import datetime
from collections import defaultdict

from ..common import http_json
from . import _mrow

_URL = "https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time"
_CASH_FROM = "2026-05"  # first month billed for real; earlier = startup grant


def _ms(month):
    """First instant of 'YYYY-MM' as unix milliseconds."""
    y, m = int(month[:4]), int(month[5:7])
    return int(datetime.datetime(y, m, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def _next_month(month):
    y, m = int(month[:4]), int(month[5:7])
    return f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"


def meter(creds, months, today):
    """Fetch ElevenLabs fiat cost per month from workspace analytics.

    Args:
        creds:  dict with ELEVENLABS_API_KEY
        months: list of "YYYY-MM" strings to query
        today:  current ingest date

    Returns:
        list of _mrow dicts (USD), one per month with nonzero cost
    """
    if not months:
        raise RuntimeError("elevenlabs meter requires at least one month")
    key = creds.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY missing")

    body = {
        "start_time": _ms(min(months)),
        "end_time": _ms(_next_month(max(months))),
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

    rows = []
    for month in sorted(set(months) & set(totals)):
        amount = round(totals[month], 2)
        if amount:
            rows.append(_mrow(
                month=month,
                vendor="elevenlabs",
                amount=amount,
                funding="credit" if month < _CASH_FROM else "cash",
                source="api",
                today=today,
            ))
    return rows
