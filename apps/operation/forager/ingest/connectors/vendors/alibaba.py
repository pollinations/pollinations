"""Alibaba Cloud meter connector — BSS bill overview via the aliyun CLI.

Witness = `aliyun bssopenapi QueryBillOverview --BillingCycle YYYY-MM
-p pollinations-finops`, one call per month; items are per-product rows in
USD, accruing in real time (the running month reads live). The CLI reads
its locally configured profile — no key in argv (vast precedent).

Funding per Elliot's standing ruling (finance-app precedent): money we
didn't pay — `InvoiceDiscount` + `DeductedByCoupons` — is credit;
`PretaxAmount` (post-discount, post-coupon) is our cash, booked paid.
Cross-checked 2026-07-07: Jan–Jul cash $5,167.28 vs Wise alibaba card
charges $5,161.75 — FX noise only.

Requires aliyun CLI (>=3.3) with the `pollinations-finops` profile.
"""
import json
import subprocess

from . import _mrow

_PROFILE = "pollinations-finops"


def _month_overview(month, run_cmd):
    try:
        r = run_cmd(
            ["aliyun", "bssopenapi", "QueryBillOverview",
             "--BillingCycle", month, "-p", _PROFILE],
            capture_output=True, text=True, timeout=60,
        )
    except FileNotFoundError:
        raise RuntimeError("aliyun CLI not installed (brew install aliyun-cli)")
    if r.returncode != 0:
        raise RuntimeError(f"aliyun QueryBillOverview failed (rc={r.returncode})")
    try:
        d = json.loads(r.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("aliyun QueryBillOverview returned non-JSON output")
    if d.get("Code") != "Success":
        raise RuntimeError(f"aliyun QueryBillOverview code={d.get('Code')}")
    return (d.get("Data") or {}).get("Items", {}).get("Item") or []


def meter(creds, months, today, run_cmd=subprocess.run):
    """Alibaba metered usage per month, split credit/paid per bill overview.

    Args:
        creds:   dict (unused for auth — the CLI reads its own profile)
        months:  list of "YYYY-MM" strings to emit
        today:   current ingest date
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts — at most one credit and one cash row per month
        (merge_meter_rows folds them into a single table row).
    """
    if not months:
        raise RuntimeError("alibaba meter requires at least one month")

    rows = []
    for month in sorted(set(months)):
        items = _month_overview(month, run_cmd)
        credit = round(sum(
            float(i.get("InvoiceDiscount") or 0) + float(i.get("DeductedByCoupons") or 0)
            for i in items
        ), 2)
        cash = round(sum(float(i.get("PretaxAmount") or 0) for i in items), 2)
        for funding, amount in (("credit", credit), ("cash", cash)):
            if amount:
                rows.append(_mrow(
                    month=month,
                    vendor="alibaba",
                    amount=amount,
                    funding=funding,
                    source="cli",
                    today=today,
                ))
    return rows
