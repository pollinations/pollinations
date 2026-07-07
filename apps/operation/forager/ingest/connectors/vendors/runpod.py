"""RunPod meter connector — REST billing rollup.

Witness = `rest.runpod.io/v1/billing/{pods,endpoints,networkvolumes}` with
bucketSize=month (the REST billing surface shipped mid-2026; the GraphQL API
still has no historical ledger — only live clientBalance/currentSpendPerHr).
Amounts are USD accrual per pod/endpoint/volume, summed per month across the
three surfaces. The month key is `time` on pods/endpoints but `startDate` on
networkvolumes.

Funding = prepaid (roster: kind=prepaid, granted:false — the balance has
always been our own card top-ups, never a grant), stored as paid.

Cross-checked 2026-07-07 against finance pool-history balance deltas: Mar
$2.87 / Apr $1,190.85 exact to the cent; June proves the API right where
balance-delta tracking was corrupted by mid-month top-ups.

Creds: RUNPOD_API_KEY (read scope). Bearer header — the GraphQL
`?api_key=` query-string quirk does not apply to the REST API.
"""
from collections import defaultdict

from ..common import http_json
from . import _mrow

_BASE = "https://rest.runpod.io/v1"
_SURFACES = ("pods", "endpoints", "networkvolumes")


def _window(months):
    """UTC window covering every requested month (end = first day after)."""
    start = f"{min(months)}-01T00:00:00Z"
    y, m = int(max(months)[:4]), int(max(months)[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    end = f"{ny:04d}-{nm:02d}-01T00:00:00Z"
    return start, end


def meter(creds, months, today):
    """Fetch RunPod metered usage per month from the REST billing endpoints.

    Args:
        creds:  dict with RUNPOD_API_KEY
        months: list of "YYYY-MM" strings to include in output
        today:  current ingest date

    Returns:
        list of _mrow dicts, one paid row per month with nonzero total
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

    rows = []
    for month in sorted(set(months) & set(totals)):
        amount = round(totals[month], 2)
        if amount:
            rows.append(_mrow(
                month=month,
                vendor="runpod",
                amount=amount,
                funding="prepaid",
                source="api",
                today=today,
            ))
    return rows
