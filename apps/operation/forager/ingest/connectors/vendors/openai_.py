"""OpenAI organization costs connector.

Fetches spend from the Organization Costs API (paginated, 1d buckets).
meter() buckets daily results by month → provider_monthly rows.

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
    """Fetch OpenAI metered spend per month, bucketed from daily cost data.

    Reuses the B4 costs pagination; groups 1d buckets by UTC month.
    Rides the grant → funding=credit.

    Args:
        creds:  dict with OPENAI_ADMIN_KEY (and optionally OPENAI_GRANT_START)
        months: list of "YYYY-MM" strings to include in output
        today:  current ingest date

    Returns:
        list of _mrow dicts with funding=credit for nonzero months
    """
    key = creds.get("OPENAI_ADMIN_KEY")
    if not key:
        raise RuntimeError("OPENAI_ADMIN_KEY missing")

    start = creds.get("OPENAI_GRANT_START") or _DEFAULT_GRANT_START
    month_set = set(months)

    _, buckets = _fetch_costs_with_buckets(key, start)

    # Group by month
    month_totals: dict = {}
    for ts, val in buckets:
        mo = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m")
        if mo not in month_set:
            continue
        month_totals[mo] = round(month_totals.get(mo, 0.0) + val, 2)

    rows = []
    for month in sorted(month_totals):
        cost = month_totals[month]
        if cost:
            rows.append(_mrow(
                month=month,
                vendor="openai",
                amount=cost,
                funding="credit",
                source="api",
                today=today,
            ))
    return rows
