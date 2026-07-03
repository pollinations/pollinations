"""DeepInfra REST balance connector.

GET https://api.deepinfra.com/v1/me?checklist=true
Auth: Authorization: Bearer <DEEPINFRA_API_KEY>
Mapping: -checklist.stripe_balance → prepaid_left_usd
  (stripe_balance is negative when credit is held; negating gives the prepaid amount)
"""
from ..common import http_json
from . import _brow


def balance(creds, now):
    key = creds["DEEPINFRA_API_KEY"]
    me = http_json(
        "https://api.deepinfra.com/v1/me?checklist=true",
        {"Authorization": f"Bearer {key}"},
    )
    bal = (me.get("checklist") or {}).get("stripe_balance")
    if bal is None:
        raise RuntimeError("unexpected /v1/me checklist response: stripe_balance missing")
    return _brow(now, "deepinfra", prepaid=-float(bal))
