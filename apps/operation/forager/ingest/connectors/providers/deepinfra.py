"""DeepInfra REST balance + meter connector.

Balance:
  GET https://api.deepinfra.com/v1/me?checklist=true
  Auth: Authorization: Bearer <DEEPINFRA_API_KEY>
  Mapping: -checklist.stripe_balance → prepaid_left_usd
    (stripe_balance is negative when credit is held; negating gives the prepaid amount)

Meter:
  GET https://api.deepinfra.com/payment/usage?from={epoch}&to={epoch}
  Epoch-second windows only; total_cost is in CENTS — divide by 100.
  The `to` epoch is capped at time.time() so the current-month window
  never extends into the future.
"""
import datetime
import time

from ..common import http_json
from . import _brow, _mrow


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


def meter(creds, months, today):
    """Fetch DeepInfra metered usage per month.

    Uses /payment/usage with epoch-second from/to windows (date strings silently
    return empty results). total_cost is in CENTS — divided by 100 to get USD.

    Args:
        creds:  dict with DEEPINFRA_API_KEY
        months: list of "YYYY-MM" strings to query
        today:  retrieved_at date string "YYYY-MM-DD"

    Returns:
        list of _mrow dicts, one per month with nonzero cost
    """
    key = creds.get("DEEPINFRA_API_KEY")
    if not key:
        return []

    rows = []
    for month in months:
        y, m = int(month[:4]), int(month[5:7])
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        frm = int(datetime.datetime(y, m, 1, tzinfo=datetime.timezone.utc).timestamp())
        to = min(
            int(datetime.datetime(ny, nm, 1, tzinfo=datetime.timezone.utc).timestamp()),
            int(time.time()),
        )
        try:
            d = http_json(
                f"https://api.deepinfra.com/payment/usage?from={frm}&to={to}",
                {"Authorization": f"Bearer {key}"},
            )
            cents = sum(float(mo.get("total_cost") or 0) for mo in d.get("months", []))
            if cents:
                rows.append(_mrow(
                    month=month,
                    provider="deepinfra",
                    cost_usd=round(cents / 100.0, 2),
                    funding="prepaid",
                    source="api",
                    method="deepinfra /payment/usage",
                    today=today,
                ))
        except Exception:
            pass

    return rows
