"""Scaleway Billing API balance connector.

GET https://api.scaleway.com/billing/v2beta1/discounts?organization_id={org}
Auth: X-Auth-Token: <SCW_SECRET_KEY>
Mapping: Σvalue → granted, Σvalue_used → spent, Σvalue_remaining → left
Money objects may be {units, nanos} dicts — handled by _money().
"""
import urllib.parse

from ..common import http_json
from . import _brow


def _money(v):
    """Parse a Scaleway money value (float, str, or {units,nanos} dict)."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        return float(v)
    if isinstance(v, dict):
        if v.get("value") is not None:
            return float(v.get("value") or 0)
        units = float(v.get("units") or 0)
        nanos = float(v.get("nanos") or 0) / 1_000_000_000
        return units + nanos
    raise RuntimeError(f"unexpected Scaleway money value: {v!r}")


def balance(creds, now):
    key = creds["SCW_SECRET_KEY"]
    org = creds["SCW_ORGANIZATION_ID"]
    url = (
        "https://api.scaleway.com/billing/v2beta1/discounts?"
        + urllib.parse.urlencode({"organization_id": org})
    )
    d = http_json(url, {"X-Auth-Token": key}, timeout=60)
    discounts = d.get("discounts") or []
    if not discounts:
        raise RuntimeError("Scaleway discounts response contained no discounts")
    granted = sum(_money(x.get("value")) for x in discounts)
    spent = sum(_money(x.get("value_used")) for x in discounts)
    left = sum(_money(x.get("value_remaining")) for x in discounts)
    return _brow(now, "scaleway", granted=granted, spent=spent, left=left)
