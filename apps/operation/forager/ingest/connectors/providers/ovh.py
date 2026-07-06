"""OVHcloud startup credit meter connector (signed API).

OVH requires HMAC-style request signing: each call is authenticated via
X-Ovh-Signature which is a SHA1 over the secret, consumer key, method,
full URL, body, and server timestamp.

Keys required in creds:
  OVH_APPLICATION_KEY   — application key (ak)
  OVH_APPLICATION_SECRET — application secret (used in signature)
  OVH_CONSUMER_KEY      — consumer key (ck, scoped to account)

Meter rows are USE movements from the STARTUP_PROGRAM credit balance.
"""
import hashlib

from ..common import http_json
from . import _mrow

BASE = "https://eu.api.ovh.com/1.0"
_BALANCE_NAME = "STARTUP_PROGRAM"


def _time():
    """Fetch server timestamp from OVH for request signing."""
    d = http_json(f"{BASE}/auth/time", timeout=20)
    return int(d)


def _signed(creds, method, path, body="", timestamp=None):
    """Build the X-Ovh-Signature value for a request.

    Signature = "$1$" + SHA1( APP_SECRET + "+" + CONSUMER_KEY + "+" +
                               METHOD + "+" + full_url + "+" + body + "+" + timestamp )

    Args:
        creds:     dict with OVH_APPLICATION_SECRET and OVH_CONSUMER_KEY
        method:    HTTP verb (e.g. "GET")
        path:      API path starting with "/" (e.g. "/me/credit/balance/STARTUP_PROGRAM")
        body:      Request body string (empty for GETs)
        timestamp: Integer server timestamp; fetched if None
    Returns:
        Signature string starting with "$1$"
    """
    secret = creds.get("OVH_APPLICATION_SECRET") or ""
    consumer = creds.get("OVH_CONSUMER_KEY") or ""
    ts = timestamp if timestamp is not None else _time()
    full_url = f"{BASE}{path}"
    sig_str = f"{secret}+{consumer}+{method}+{full_url}+{body}+{ts}"
    return "$1$" + hashlib.sha1(sig_str.encode()).hexdigest()  # nosec B324 — OVH protocol mandates SHA1


def _get(creds, path, timestamp):
    """Signed GET request against the OVH API, returns parsed JSON."""
    ak = creds.get("OVH_APPLICATION_KEY")
    consumer = creds.get("OVH_CONSUMER_KEY")
    if not ak or not consumer:
        raise RuntimeError("OVH_APPLICATION_KEY or OVH_CONSUMER_KEY missing")
    sig = _signed(creds, "GET", path, "", timestamp)
    url = f"{BASE}{path}"
    headers = {
        "X-Ovh-Application": ak,
        "X-Ovh-Consumer": consumer,
        "X-Ovh-Timestamp": str(timestamp),
        "X-Ovh-Signature": sig,
    }
    return http_json(url, headers)


def _amount(row):
    """Extract float value from OVH amount object {"value": "123.45", ...}."""
    return float((row or {}).get("amount", {}).get("value") or 0)


def meter(creds, months, today):
    """Fetch OVHcloud credit burn per month from the movements ledger.

    GETs /me/credit/balance/STARTUP_PROGRAM/movement (list of IDs), then
    fetches each movement detail. Only type=USE movements are counted; VOUCHER
    and other types are ignored. Amounts are kept in native EUR.

    Args:
        creds:  dict with OVH_APPLICATION_KEY/SECRET and OVH_CONSUMER_KEY
        months: list of "YYYY-MM" strings (filter for output; all movements fetched)
        today:  current ingest date
    Returns:
        list of _mrow dicts, one per month with nonzero USE burn
    """
    import collections
    import urllib.parse as _up

    ts = _time()
    movement_ids = _get(creds, f"/me/credit/balance/{_BALANCE_NAME}/movement", ts)
    if not movement_ids:
        return []

    month_set = set(months)
    totals = collections.defaultdict(float)
    for mid in movement_ids:
        path = f"/me/credit/balance/{_BALANCE_NAME}/movement/{_up.quote(str(mid), safe='')}"
        mov = _get(creds, path, ts)
        if (mov or {}).get("type") != "USE":
            continue
        month = (mov.get("creationDate") or "")[:7]
        if month not in month_set:
            continue
        totals[month] += -_amount(mov)  # USE amounts are negative; negate to get positive burn

    rows = []
    for month, eur in sorted(totals.items()):
        if eur > 0:
            rows.append(_mrow(
                month=month,
                provider="ovhcloud",
                amount=eur,
                currency="EUR",
                funding="credit",
                source="api",
                today=today,
            ))
    return rows
