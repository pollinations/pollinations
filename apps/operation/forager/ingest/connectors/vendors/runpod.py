"""RunPod meter connector — REST billing rollup with a grant waterfall.

Witness = `rest.runpod.io/v1/billing/{pods,endpoints,networkvolumes}` with
bucketSize=month (the REST billing surface shipped mid-2026; the GraphQL API
still has no historical ledger — only live clientBalance/currentSpendPerHr).
Amounts are USD accrual per pod/endpoint/volume, summed per month across the
three surfaces. The month key is `time` on pods/endpoints but `startDate` on
networkvolumes.

Funding is a grant waterfall (fireworks precedent): the account was seeded by
a $2,500 credit code redeemed 2026-03-24 (transferred by zach.gulsby@runpod.io
— March invoice, "Credit codes redeemed"), so consumption is credit until the
grant is exhausted and our money after. Purchased "GPU compute credits" (the
$15 in March, the $300 card top-ups from June on) are our cash, booked paid.
The old credits.json roster said granted:false — the invoices outrank it.
The waterfall always replays from MONTHS_START so scoped runs still see the
grant state; only the requested months are emitted.

Invoice cross-checks (Mar–Jun 2026 PDFs): debits match this API to the cent
per month; the waterfall's grant remnant entering June is $81.92 vs the
invoice starting balance $107.85 — the gap is the purchased-credit slice of
the balance, which this model deliberately books as paid, not credit.

Creds: RUNPOD_API_KEY (read scope). Bearer header — the GraphQL
`?api_key=` query-string quirk does not apply to the REST API.
"""
from collections import defaultdict

from ..common import http_json
from . import _mrow

_BASE = "https://rest.runpod.io/v1"
_SURFACES = ("pods", "endpoints", "networkvolumes")

GRANT_USD = 2_500.0
MONTHS_START = "2026-03"


def _window(months):
    """UTC window from the grant era start through every requested month."""
    start = f"{min(min(months), MONTHS_START)}-01T00:00:00Z"
    y, m = int(max(months)[:4]), int(max(months)[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    end = f"{ny:04d}-{nm:02d}-01T00:00:00Z"
    return start, end


def meter(creds, months, today):
    """Fetch RunPod metered usage per month, credit/paid via the waterfall.

    Args:
        creds:  dict with RUNPOD_API_KEY
        months: list of "YYYY-MM" strings to emit
        today:  current ingest date

    Returns:
        list of _mrow dicts — at most one credit and one cash row per month
        (merge_meter_rows folds them into a single table row).
    """
    if not months:
        raise RuntimeError("runpod meter requires at least one month")
    key = creds.get("RUNPOD_API_KEY")
    if not key:
        raise RuntimeError("RUNPOD_API_KEY missing")

    start, end = _window(months)
    headers = {"Authorization": f"Bearer {key}"}
    totals = defaultdict(float)
    for surface in _SURFACES:
        url = (
            f"{_BASE}/billing/{surface}?bucketSize=month"
            f"&startTime={start}&endTime={end}"
        )
        for row in http_json(url, headers) or []:
            month = str(row.get("time") or row.get("startDate") or "")[:7]
            if month:
                totals[month] += float(row.get("amount") or 0)

    wanted = set(months)
    remaining = GRANT_USD
    rows = []
    for month in sorted(totals):
        usage = round(totals[month], 2)
        if not usage:
            continue
        credit = round(min(usage, remaining), 2)
        remaining = round(remaining - credit, 2)
        if month not in wanted:
            continue
        for funding, amount in (("credit", credit), ("cash", round(usage - credit, 2))):
            if amount:
                rows.append(_mrow(
                    month=month,
                    vendor="runpod",
                    amount=amount,
                    funding=funding,
                    source="api",
                    today=today,
                ))
    return rows
