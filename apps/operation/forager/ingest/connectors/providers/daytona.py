"""Daytona balance connector.

Step 1: GET https://app.daytona.io/api/api-keys/current  (key validity check)
Step 2: GET https://billing.app.daytona.io/v2/organization/{org}/wallet
Auth: Authorization: Bearer <DAYTONA_API_KEY>
Mapping: wallet.balanceCents / 100 → prepaid_left_usd
         If wallet probe fails (OIDC-gated), raise RuntimeError — record manually.
Creds: DAYTONA_API_KEY (required), DAYTONA_ORGANIZATION_ID (required for wallet)
"""
import urllib.error

from ..common import http_json
from . import _brow


def balance(creds, now):
    key = creds["DAYTONA_API_KEY"]
    http_json(
        "https://app.daytona.io/api/api-keys/current",
        {"Authorization": f"Bearer {key}"},
    )
    org = creds.get("DAYTONA_ORGANIZATION_ID")
    try:
        wallet = http_json(
            f"https://billing.app.daytona.io/v2/organization/{org}/wallet",
            {"Authorization": f"Bearer {key}"},
        )
    except (urllib.error.HTTPError, urllib.error.URLError, Exception) as exc:
        raise RuntimeError(f"wallet OIDC-gated — record manually ({type(exc).__name__})") from exc
    cents = wallet.get("balanceCents")
    if cents is None:
        raise RuntimeError("wallet OIDC-gated — record manually")
    return _brow(now, "daytona", prepaid=float(cents) / 100.0)
