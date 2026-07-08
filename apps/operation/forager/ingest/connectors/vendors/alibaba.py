"""Alibaba Cloud meter connector — BSS bill overview via the aliyun CLI.

Witness = `aliyun bssopenapi QueryBillOverview --BillingCycle YYYY-MM
-p pollinations-finops`, one call per month; items are per-product rows in
USD, accruing in real time (the running month reads live). The CLI reads
its locally configured profile — no key in argv (vast precedent).

Funding per Elliot's standing ruling (2026-07-08): Alibaba discounts are not
grant pools. They only lower the net model cost, so the connector books
`PretaxAmount` (post-discount, post-coupon) as paid and ignores discount lines.
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
    """Alibaba metered usage per month, net paid cost per bill overview.

    Args:
        creds:   dict (unused for auth — the CLI reads its own profile)
        months:  list of "YYYY-MM" strings to emit
        today:   current ingest date
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts — at most one paid row per month.
    """
    if not months:
        raise RuntimeError("alibaba meter requires at least one month")

    rows = []
    for month in sorted(set(months)):
        items = _month_overview(month, run_cmd)
        cash = round(sum(float(i.get("PretaxAmount") or 0) for i in items), 2)
        if cash:
            rows.append(_mrow(
                month=month,
                vendor="alibaba",
                amount=cash,
                funding="cash",
                source="cli",
                today=today,
            ))
    return rows
