"""OpenAI organization costs connector.

Fetches cumulative spend from the Organization Costs API (paginated) and
derives `left = granted - spent`. The grant amount is not available via any
OpenAI API — it is a hardcoded constant (PoC pattern) overrideable from creds.

Endpoint: GET https://api.openai.com/v1/organization/costs
Auth: Bearer OPENAI_ADMIN_KEY
Pagination: has_more / next_page, max 20 pages

Keys:
  OPENAI_ADMIN_KEY      — admin key with org read access
  OPENAI_GRANT_USD      — total grant in USD (default 1565.58, hardcoded)
  OPENAI_GRANT_START    — start date for cost accumulation (default "2025-12-01")
"""
import datetime
import urllib.parse

from ..common import http_json
from . import _brow

_DEFAULT_GRANT_USD = 1565.58
_DEFAULT_GRANT_START = "2025-12-01"
_COSTS_URL = "https://api.openai.com/v1/organization/costs"


def _epoch(day):
    """Convert "YYYY-MM-DD" to a UTC Unix timestamp integer."""
    return int(
        datetime.datetime.fromisoformat(day)
        .replace(tzinfo=datetime.timezone.utc)
        .timestamp()
    )


def _fetch_costs(key, start_day):
    """Paginate the costs endpoint and return total spent USD."""
    total = 0.0
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
            for res in bucket.get("results") or []:
                amt = res.get("amount") or {}
                total += float(amt.get("value") or 0)

        if not d.get("has_more"):
            break
        page_token = d.get("next_page")
        if not page_token:
            break
        if pages >= 20:
            raise RuntimeError("OpenAI costs pagination exceeded 20 pages")

    return round(total, 2)


def balance(creds, now):
    """Fetch OpenAI spend and derive remaining grant balance.

    Args:
        creds: dict with OPENAI_ADMIN_KEY (and optionally OPENAI_GRANT_USD,
               OPENAI_GRANT_START)
        now:   run_at timestamp string "YYYY-MM-DD HH:MM:SS"

    Returns:
        balances row dict; note="granted is HC" (hardcoded grant amount)
    """
    key = creds.get("OPENAI_ADMIN_KEY")
    if not key:
        raise RuntimeError("OPENAI_ADMIN_KEY missing")

    grant = float(creds.get("OPENAI_GRANT_USD") or _DEFAULT_GRANT_USD)
    start = creds.get("OPENAI_GRANT_START") or _DEFAULT_GRANT_START

    spent = _fetch_costs(key, start)

    return _brow(
        now,
        "openai",
        granted=round(grant, 2),
        spent=spent,
        left=round(grant - spent, 2),
        source="api",
        note="granted is HC",
    )
