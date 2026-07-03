"""DigitalOcean billing balance connector.

GET https://api.digitalocean.com/v2/customers/my/balance
Auth: Authorization: Bearer <DIGITALOCEAN_TOKEN>
Mapping: month_to_date_usage → spent_usd
         account_balance < 0 → left_usd = -account_balance (credit remaining)
         account_balance >= 0 → left_usd = None (owed, no credit)
Note: 403 expected until team-role bump; connector ships anyway.
"""
from ..common import http_json
from . import _brow


def balance(creds, now):
    tok = creds["DIGITALOCEAN_TOKEN"]
    d = http_json(
        "https://api.digitalocean.com/v2/customers/my/balance",
        {"Authorization": f"Bearer {tok}"},
    )
    spent = float(d.get("month_to_date_usage") or 0)
    acct = float(d.get("account_balance") or 0)
    left = -acct if acct < 0 else None
    return _brow(now, "digitalocean", spent=spent, left=left)
