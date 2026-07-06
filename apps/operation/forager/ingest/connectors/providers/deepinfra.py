"""DeepInfra REST meter connector.

  GET https://api.deepinfra.com/payment/usage?from={epoch}&to={epoch}
  Epoch-second windows only; total_cost is in CENTS — divide by 100.
  The `to` epoch is capped at time.time() so the current-month window
  never extends into the future.
"""
import datetime
import time

from ..common import http_json
from . import _mrow


def meter(creds, months, today):
    """Fetch DeepInfra metered usage per month.

    Uses /payment/usage with epoch-second from/to windows (date strings silently
    return empty results). total_cost is in CENTS — divided by 100 to get USD.

    Args:
        creds:  dict with DEEPINFRA_API_KEY
        months: list of "YYYY-MM" strings to query
        today:  current ingest date

    Returns:
        list of _mrow dicts, one per month with nonzero cost
    """
    key = creds.get("DEEPINFRA_API_KEY")
    if not key:
        raise RuntimeError("DEEPINFRA_API_KEY missing")

    rows = []
    for month in months:
        y, m = int(month[:4]), int(month[5:7])
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        frm = int(datetime.datetime(y, m, 1, tzinfo=datetime.timezone.utc).timestamp())
        to = min(
            int(datetime.datetime(ny, nm, 1, tzinfo=datetime.timezone.utc).timestamp()),
            int(time.time()),
        )
        d = http_json(
            f"https://api.deepinfra.com/payment/usage?from={frm}&to={to}",
            {"Authorization": f"Bearer {key}"},
        )
        cents = sum(float(mo.get("total_cost") or 0) for mo in d.get("months", []))
        if cents:
            rows.append(_mrow(
                month=month,
                provider="deepinfra",
                amount=round(cents / 100.0, 2),
                funding="prepaid",
                source="api",
                today=today,
            ))

    return rows
