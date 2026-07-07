"""OpenRouter meter connector — daily activity rollup.

Witness = `GET /api/v1/activity` (management key): one row per day × model
with `usage` in USD, drawn from the $3,000 credit grant (roster: kind=grant;
no cash has ever left the bank for OpenRouter). The endpoint only reaches
back ~30 days, so a month is emitted ONLY when the window covers it from its
first day — completed months that predate the window must live as manual
rows (2026-05 $245 / 2026-06 $1,051 were recorded from the roster snapshot
re-verified against the dashboard on 2026-07-02; manual outranks api at
merge time anyway). The running month is fully covered by construction and
grows with each run.

Creds: OPENROUTER_MANAGEMENT_API_KEY (the runtime key cannot read activity).
"""
from collections import defaultdict

from ..common import http_json
from . import _mrow

_ACTIVITY_URL = "https://openrouter.ai/api/v1/activity"


def meter(creds, months, today):
    """Fetch OpenRouter credit burn per month from the activity endpoint.

    Args:
        creds:  dict with OPENROUTER_MANAGEMENT_API_KEY
        months: list of "YYYY-MM" strings to query
        today:  current ingest date

    Returns:
        list of _mrow dicts: one credit row per fully-window-covered month
        with nonzero usage
    """
    if not months:
        raise RuntimeError("openrouter meter requires at least one month")
    key = creds.get("OPENROUTER_MANAGEMENT_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_MANAGEMENT_API_KEY missing")

    d = http_json(_ACTIVITY_URL, {"Authorization": f"Bearer {key}"})
    daily = defaultdict(float)
    for row in d.get("data") or []:
        day = str(row.get("date") or "")[:10]
        if len(day) == 10:
            daily[day] += float(row.get("usage") or 0)
    if not daily:
        return []

    window_start = min(daily)
    totals = defaultdict(float)
    for day, usage in daily.items():
        totals[day[:7]] += usage

    rows = []
    for month in sorted(set(months) & set(totals)):
        if f"{month}-01" < window_start:
            continue  # window truncates this month — a partial row would understate it
        amount = round(totals[month], 2)
        if amount:
            rows.append(_mrow(
                month=month,
                vendor="openrouter",
                amount=amount,
                funding="credit",
                source="api",
                today=today,
            ))
    return rows
