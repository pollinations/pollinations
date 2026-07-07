"""xAI meter connector — management-API invoice ledger.

Witness = `GET management-api.x.ai/v1/billing/teams/{team}/invoices`
(management key, Bearer; the team id is auto-discovered via
`GET /auth/teams` — note NOT /v1/). Two invoice species share the ledger:

  - cycle invoices (multi-line): created a few days into month m+1, they
    bill calendar month m's usage; gross usage = sum of line `amount`s
    (cents), while `total` is net of any prepaid-token offset. PENDING
    cycle invoices are included — the consumption is real even before the
    charge settles.
  - prepaid top-ups (single line, `unitType == "prepaid_tokens"`): balance
    funding, not consumption — excluded entirely.

Funding = cash always: every prepaid purchase and cycle charge is a
Wise-witnessed card payment (verified 2026-07-07 against the mailbox
receipts and the bank ledger; no grant exists on this team).

Creds: XAI_MANAGEMENT_API_KEY (console.x.ai → Settings → Management Keys).
"""
from collections import defaultdict

from ..common import http_json
from . import _mrow

_BASE = "https://management-api.x.ai"


def _team_id(headers):
    d = http_json(f"{_BASE}/auth/teams", headers)
    teams = d.get("teams") or []
    if len(teams) != 1:
        raise RuntimeError(f"xai expects exactly one team, got {len(teams)}")
    return teams[0]["teamId"]


def _usage_month(create_time):
    """Cycle invoices created in month m+1 bill calendar month m."""
    y, m = int(create_time[:4]), int(create_time[5:7])
    py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
    return f"{py:04d}-{pm:02d}"


def meter(creds, months, today):
    """xAI usage per month from cycle invoices (gross, cents → USD).

    Args:
        creds:  dict with XAI_MANAGEMENT_API_KEY
        months: list of "YYYY-MM" strings to emit
        today:  current ingest date

    Returns:
        list of _mrow dicts, one paid row per month with nonzero usage
    """
    if not months:
        raise RuntimeError("xai meter requires at least one month")
    key = creds.get("XAI_MANAGEMENT_API_KEY")
    if not key:
        raise RuntimeError("XAI_MANAGEMENT_API_KEY missing")

    headers = {"Authorization": f"Bearer {key}"}
    team = _team_id(headers)
    d = http_json(f"{_BASE}/v1/billing/teams/{team}/invoices", headers)

    totals = defaultdict(float)
    for invoice in d.get("invoices") or []:
        cents = sum(
            int(line.get("amount") or 0)
            for line in invoice.get("lines") or []
            if line.get("unitType") != "prepaid_tokens"
        )
        if not cents:
            continue
        totals[_usage_month(invoice.get("createTime") or "")] += cents / 100

    rows = []
    for month in sorted(set(months) & set(totals)):
        amount = round(totals[month], 2)
        if amount:
            rows.append(_mrow(
                month=month,
                vendor="xai",
                amount=amount,
                funding="cash",
                source="api",
                today=today,
            ))
    return rows
