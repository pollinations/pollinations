"""Azure startup credit balance connector.

Two-hop authentication:
  1. POST https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token
     with client-credentials grant (form-encoded body) → access_token
  2. GET  https://management.azure.com/providers/Microsoft.Billing/billingAccounts/
          {BILLING_ACCOUNT}/billingProfiles/{BILLING_PROFILE}/
          providers/Microsoft.Consumption/credits/balanceSummary?api-version=2023-11-01
     with Authorization: Bearer <access_token>

Endpoint verified 2026-07-02 against the Pollinations billing account (see
.claude/skills/provider-billing/providers/azure.md §4). The finance app's
azure.mjs uses az-rest CLI for MTD usage — a different endpoint — so this
connector uses the verified billing-profile credit-balance endpoint directly.

Keys:
  AZURE_TENANT_ID         — AAD tenant ID
  AZURE_CLIENT_ID         — service principal app ID
  AZURE_CLIENT_SECRET     — service principal secret
  AZURE_BILLING_ACCOUNT   — MCA billing account ID
  AZURE_BILLING_PROFILE   — MCA billing profile ID
"""
import urllib.parse

from ..common import http_json
from . import _brow

_MGMT_SCOPE = "https://management.azure.com/.default"
_API_VERSION = "2023-11-01"


def _token(creds):
    """Exchange client credentials for a management API bearer token."""
    tenant = creds.get("AZURE_TENANT_ID")
    client_id = creds.get("AZURE_CLIENT_ID")
    client_secret = creds.get("AZURE_CLIENT_SECRET")
    if not (tenant and client_id and client_secret):
        raise RuntimeError("AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET all required")

    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "scope": _MGMT_SCOPE,
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode()
    resp = http_json(url, {"Content-Type": "application/x-www-form-urlencoded"}, data=body)
    token = resp.get("access_token")
    if not token:
        raise RuntimeError("Azure token response missing access_token")
    return token


def balance(creds, now):
    """Fetch Azure startup credit balance (estimatedBalance).

    Args:
        creds: dict with AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
               AZURE_BILLING_ACCOUNT, AZURE_BILLING_PROFILE
        now:   run_at timestamp string "YYYY-MM-DD HH:MM:SS"

    Returns:
        balances row dict; left_usd = estimatedBalance; note includes currentBalance
    """
    ba = creds.get("AZURE_BILLING_ACCOUNT")
    bp = creds.get("AZURE_BILLING_PROFILE")
    if not (ba and bp):
        raise RuntimeError("AZURE_BILLING_ACCOUNT and AZURE_BILLING_PROFILE required")

    token = _token(creds)

    url = (
        f"https://management.azure.com/providers/Microsoft.Billing/billingAccounts/{ba}"
        f"/billingProfiles/{bp}/providers/Microsoft.Consumption/credits/balanceSummary"
        f"?api-version={_API_VERSION}"
    )
    resp = http_json(url, {"Authorization": f"Bearer {token}"})

    summary = (resp.get("properties") or {}).get("balanceSummary") or {}
    estimated = (summary.get("estimatedBalance") or {}).get("value")
    current = (summary.get("currentBalance") or {}).get("value")

    if estimated is None:
        raise RuntimeError(
            "Azure balanceSummary response missing properties.balanceSummary.estimatedBalance.value"
        )

    note = f"currentBalance={current}" if current is not None else ""

    return _brow(
        now,
        "azure",
        left=round(float(estimated), 2),
        source="api",
        note=note,
    )
