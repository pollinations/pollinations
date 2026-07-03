"""OVHcloud startup credit balance connector (signed API).

GET /me/credit/balance/STARTUP_PROGRAM on https://eu.api.ovh.com/1.0

OVH requires HMAC-style request signing: each call is authenticated via
X-Ovh-Signature which is a SHA1 over the secret, consumer key, method,
full URL, body, and server timestamp.

Keys required in creds:
  OVH_APPLICATION_KEY   — application key (ak)
  OVH_APPLICATION_SECRET — application secret (used in signature)
  OVH_CONSUMER_KEY      — consumer key (ck, scoped to account)

Row: balance (EUR) × fx → USD fields; currency="EUR"; note carries expiry.
Task B5's ovh meter will reuse _signed().
"""
import hashlib
import json
import urllib.request

from ..common import http_json
from . import _brow

BASE = "https://eu.api.ovh.com/1.0"
_BALANCE_NAME = "STARTUP_PROGRAM"


def _time():
    """Fetch server timestamp from OVH (unauthenticated). Falls back to local time."""
    import time
    try:
        d = http_json(f"{BASE}/auth/time", timeout=20)
        return int(d)
    except Exception:
        return int(time.time())


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


def balance(creds, now, fx=1.14):
    """Fetch OVHcloud startup credit balance.

    Args:
        creds: dict with OVH_APPLICATION_KEY/SECRET and OVH_CONSUMER_KEY
        now:   run_at timestamp string "YYYY-MM-DD HH:MM:SS"
        fx:    EUR→USD conversion rate (default 1.14, overrideable from config)

    Returns:
        balances row dict
    """
    if not creds.get("OVH_APPLICATION_SECRET"):
        raise RuntimeError("OVH_APPLICATION_SECRET missing")

    ts = _time()

    bal = _get(creds, f"/me/credit/balance/{_BALANCE_NAME}", ts)
    movement_ids = _get(creds, f"/me/credit/balance/{_BALANCE_NAME}/movement", ts)

    granted_eur = 0.0
    for mid in (movement_ids or []):
        import urllib.parse as _up
        path = f"/me/credit/balance/{_BALANCE_NAME}/movement/{_up.quote(str(mid), safe='')}"
        mov = _get(creds, path, ts)
        if (mov or {}).get("type") == "VOUCHER":
            granted_eur += _amount(mov)

    left_eur = float((bal or {}).get("amount", {}).get("value") or 0)

    expiring = (bal or {}).get("expiring") or []
    expires = (expiring[0].get("expirationDate") or "")[:10] if expiring else ""
    note = f"expires={expires}" if expires else ""

    return _brow(
        now,
        "ovhcloud",
        granted=round(granted_eur * fx, 2) if granted_eur else None,
        left=round(left_eur * fx, 2),
        currency="EUR",
        source="api",
        note=note,
    )
