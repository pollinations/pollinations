"""Azure meter connector — billing-profile invoices.

Witness = the monthly Azure invoice on our MCA billing profile (EUR, issued
~day 9 covering the previous calendar month). Per invoice:

    billedAmount   gross consumption billed for the period
    creditAmount   sponsorship credit applied at invoice level (negative;
                   the $250k startup lot runs 2026-04-06 → 2028-04-06, so
                   Jan–Mar 2026 invoices show 0 and were card-charged in full)
    paid           billedAmount + creditAmount = the card charge Wise sees

Only invoices spanning a full calendar month count; zero-billed one-day
invoices (purchase receipts) are skipped. The running month has no invoice
until ~day 9 of the next month, so it emits no row.

Creds: AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET (service
principal pollinations-finance-billing-reader, role: Billing profile reader)
+ AZURE_BILLING_ACCOUNT / AZURE_BILLING_PROFILE.
"""
import calendar
import urllib.parse

from ..common import http_json
from . import _mrow

_LOGIN = "https://login.microsoftonline.com"
_ARM = "https://management.azure.com"
_API_VERSION = "2024-04-01"

_REQUIRED = (
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_BILLING_ACCOUNT",
    "AZURE_BILLING_PROFILE",
)


def _token(creds):
    """Client-credentials token for the ARM scope (no az CLI)."""
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": creds["AZURE_CLIENT_ID"],
        "client_secret": creds["AZURE_CLIENT_SECRET"],
        "scope": f"{_ARM}/.default",
    }).encode()
    d = http_json(
        f"{_LOGIN}/{creds['AZURE_TENANT_ID']}/oauth2/v2.0/token", data=body
    )
    token = d.get("access_token")
    if not token:
        raise RuntimeError("azure token response missing access_token")
    return token


def _invoice_month(props):
    """Map a full-calendar-month invoice period to 'YYYY-MM'; None otherwise."""
    start = str(props.get("invoicePeriodStartDate") or "")[:10]
    end = str(props.get("invoicePeriodEndDate") or "")[:10]
    if len(start) < 10 or len(end) < 10 or start[8:10] != "01":
        return None
    y, m = int(start[:4]), int(start[5:7])
    last = calendar.monthrange(y, m)[1]
    if end != f"{y:04d}-{m:02d}-{last:02d}":
        return None
    return f"{y:04d}-{m:02d}"


def meter(creds, months, today):
    """Fetch Azure invoiced cost per month, split credit vs card cash.

    Args:
        creds:  dict with the _REQUIRED azure keys
        months: list of "YYYY-MM" strings to query
        today:  current ingest date (upper bound for the invoice window)

    Returns:
        list of _mrow dicts (EUR): ≤1 credit + ≤1 cash row per month
    """
    if not months:
        raise RuntimeError("azure meter requires at least one month")
    missing = [k for k in _REQUIRED if not creds.get(k)]
    if missing:
        raise RuntimeError("azure creds missing: " + ", ".join(missing))

    token = _token(creds)
    account = urllib.parse.quote(creds["AZURE_BILLING_ACCOUNT"], safe="")
    profile = urllib.parse.quote(creds["AZURE_BILLING_PROFILE"], safe="")
    url = (
        f"{_ARM}/providers/Microsoft.Billing/billingAccounts/{account}"
        f"/billingProfiles/{profile}/invoices?api-version={_API_VERSION}"
        f"&periodStartDate={min(months)}-01&periodEndDate={str(today)[:10]}"
    )

    invoices = []
    while url:
        d = http_json(url, {"Authorization": f"Bearer {token}"})
        invoices.extend(d.get("value") or [])
        url = d.get("nextLink")

    month_set = set(months)
    gross, credit = {}, {}
    for invoice in invoices:
        props = invoice.get("properties") or {}
        month = _invoice_month(props)
        if month is None or month not in month_set:
            continue
        billed = float((props.get("billedAmount") or {}).get("value") or 0)
        applied = float((props.get("creditAmount") or {}).get("value") or 0)
        if not billed and not applied:
            continue
        gross[month] = gross.get(month, 0.0) + billed
        credit[month] = credit.get(month, 0.0) + applied

    rows = []
    for month in sorted(set(gross) | set(credit)):
        burn = -credit.get(month, 0.0)  # creditAmount is negative on the invoice
        cash = gross.get(month, 0.0) - burn
        if burn > 0.005:
            rows.append(_mrow(
                month=month,
                vendor="azure",
                amount=round(burn, 2),
                funding="credit",
                source="api",
                today=today,
                currency="EUR",
            ))
        if cash > 0.005:
            rows.append(_mrow(
                month=month,
                vendor="azure",
                amount=round(cash, 2),
                funding="cash",
                source="api",
                today=today,
                currency="EUR",
            ))

    return rows
