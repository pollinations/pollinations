"""OpenAI organization costs connector — grant waterfall.

Fetches spend from the Organization Costs API (paginated, 1d buckets).
meter() buckets daily results by month → provider_monthly rows.

Funding (dashboard-witnessed 2026-07-07): ONE credit grant of $1,565.58
received 2025-12-04, expires 2026-08-01 ($411.19 left at the reading —
reconciles with this API to the dollar). Usage from GRANT_FROM is credit
until the grant exhausts or past GRANT_LAST_MONTH (expiry), cash after.
Aug–Nov 2025 pre-grant usage was card auto-recharges (manual paid rows).

Endpoint: GET https://api.openai.com/v1/organization/costs
Auth: Bearer OPENAI_ADMIN_KEY
Pagination: has_more / next_page, max 20 pages

Keys:
  OPENAI_ADMIN_KEY      — admin key with org read access
  OPENAI_GRANT_START    — start date for cost accumulation (default "2025-12-01")
"""
import datetime
import urllib.parse

from ..common import http_json
from . import _mrow

_DEFAULT_GRANT_START = "2025-12-01"
_COSTS_URL = "https://api.openai.com/v1/organization/costs"

GRANT_USD = 1_565.58
GRANT_FROM = "2025-12"
GRANT_LAST_MONTH = "2026-07"  # credits expire 2026-08-01


def _epoch(day):
    """Convert "YYYY-MM-DD" to a UTC Unix timestamp integer."""
    return int(
        datetime.datetime.fromisoformat(day)
        .replace(tzinfo=datetime.timezone.utc)
        .timestamp()
    )


def _fetch_costs_with_buckets(key, start_day):
    """Paginate the costs endpoint; return (total_usd, [(start_time_epoch, amount), ...])."""
    total = 0.0
    buckets = []
    pages = 0
    page_token = None

    while True:
        params = {
            "start_time": str(_epoch(start_day)),
            "bucket_width": "1d",
            "limit": "180",
        }
        if page_token:
            params["page"] = page_token

        url = _COSTS_URL + "?" + urllib.parse.urlencode(params)
        d = http_json(url, {"Authorization": f"Bearer {key}"}, timeout=60)
        pages += 1

        for bucket in d.get("data") or []:
            start_ts = bucket.get("start_time")
            for res in bucket.get("results") or []:
                amt = res.get("amount") or {}
                val = float(amt.get("value") or 0)
                total += val
                if start_ts is not None:
                    buckets.append((int(start_ts), val))

        if not d.get("has_more"):
            break
        page_token = d.get("next_page")
        if not page_token:
            break
        if pages >= 20:
            raise RuntimeError("OpenAI costs pagination exceeded 20 pages")

    return round(total, 2), buckets


def meter(creds, months, today):
    """Fetch OpenAI metered spend per month, credit/paid via the waterfall.

    Reuses the B4 costs pagination; groups 1d buckets by UTC month. The
    waterfall always walks from GRANT_FROM so scoped runs still see the
    grant state; only the requested months are emitted. Credit stops when
    the grant exhausts or after GRANT_LAST_MONTH (the Aug 1 expiry).

    Args:
        creds:  dict with OPENAI_ADMIN_KEY (and optionally OPENAI_GRANT_START)
        months: list of "YYYY-MM" strings to include in output
        today:  current ingest date

    Returns:
        list of _mrow dicts — at most one credit and one cash row per month
        (merge_meter_rows folds them into a single table row).
    """
    key = creds.get("OPENAI_ADMIN_KEY")
    if not key:
        raise RuntimeError("OPENAI_ADMIN_KEY missing")

    start = creds.get("OPENAI_GRANT_START") or _DEFAULT_GRANT_START
    month_set = set(months)

    _, buckets = _fetch_costs_with_buckets(key, start)

    # Group by month (all months from GRANT_FROM — the waterfall needs them)
    month_totals: dict = {}
    for ts, val in buckets:
        mo = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m")
        month_totals[mo] = round(month_totals.get(mo, 0.0) + val, 2)

    remaining = GRANT_USD
    rows = []
    for month in sorted(month_totals):
        usage = month_totals[month]
        if not usage:
            continue
        in_grant_window = GRANT_FROM <= month <= GRANT_LAST_MONTH
        credit = round(min(usage, remaining), 2) if in_grant_window else 0.0
        remaining = round(remaining - credit, 2)
        if month not in month_set:
            continue
        for funding, amount in (("credit", credit), ("cash", round(usage - credit, 2))):
            if amount:
                rows.append(_mrow(
                    month=month,
                    vendor="openai",
                    amount=amount,
                    funding=funding,
                    source="api",
                    today=today,
                ))
    return rows
