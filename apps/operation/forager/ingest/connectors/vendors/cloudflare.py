"""Cloudflare meter connector — two accounts, one vendor.

Witness = `GET api.cloudflare.com/client/v4/user/billing/history` per account
token. Despite the /user/ path the endpoint scopes to the token: the old
pollinations account uses an account-owned token minted from Thomas's login
(his card paid that account's invoices until the 2026-06 migration; we
reimbursed him — see config/transaction_splits.json), the myceli account uses
our own token.

Entry math per month (occurred_at month, USD): `invoice` amounts add,
`credit` amounts subtract (billing corrections — e.g. myceli's 2026-06 charge
was credited back to the account balance two days later, netting June to the
$48 the old account billed). Zero/None amounts (free-tier invoices) are
skipped. Months netting <= 0 emit no row. All cash, all category="infra"
(Cloudflare serves no models — Elliot's ruling 2026-07: "cloudflare is all
infra"), so these rows fund cash flow views but stay out of the compute
lenses.

Source: api
"""

from ..common import http_json
from . import _mrow

_HISTORY_URL = "https://api.cloudflare.com/client/v4/user/billing/history?per_page=50"

_TOKEN_KEYS = (
    "CLOUDFLARE_POLLINATIONS_BILLING_TOKEN",
    "CLOUDFLARE_MYCELI_API_TOKEN",
)


def meter(creds, months, today, http=http_json):
    """Fetch Cloudflare billed cost per month across both accounts.

    Args:
        creds:  dict with the two account token keys
        months: list of "YYYY-MM" strings to include in output
        today:  current ingest date
        http:   injectable http_json replacement (for testing)

    Returns:
        list of _mrow dicts; one cash row per month with positive net billing.
    """
    missing = [key for key in _TOKEN_KEYS if not creds.get(key)]
    if missing:
        raise RuntimeError(f"missing cloudflare tokens: {', '.join(missing)}")

    month_set = set(months)
    totals = {}
    for key in _TOKEN_KEYS:
        d = http(_HISTORY_URL, {"Authorization": f"Bearer {creds[key]}"}, timeout=60)
        if not d.get("success", True):
            raise RuntimeError(f"cloudflare billing history failed ({key})")
        for entry in d.get("result") or []:
            month = (entry.get("occurred_at") or "")[:7]
            amount = entry.get("amount")
            if month not in month_set or not amount:
                continue
            kind = entry.get("type")
            if kind == "invoice":
                totals[month] = totals.get(month, 0.0) + float(amount)
            elif kind == "credit":
                totals[month] = totals.get(month, 0.0) - float(amount)

    rows = []
    for month in sorted(totals):
        net = round(totals[month], 2)
        if net > 0:
            rows.append(_mrow(
                month=month,
                vendor="cloudflare",
                amount=net,
                currency="USD",
                funding="cash",
                source="api",
                today=today,
                category="infra",
            ))
    return rows
