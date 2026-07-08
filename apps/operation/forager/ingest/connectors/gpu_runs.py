"""gpu_runs connector — month-split helper + model mapping.

Exports:
    split_run_by_month(started_at, ended_at, cost, gpu_count=1)
        -> list[(month:'YYYY-MM', hours_in_month:float, cost_in_month:float)]

    stamp(vendor, deployment) -> tuple[str, str]
        Map a (vendor, deployment) pair to (models_csv, kind).
        models_csv is a comma-joined list of models served by that deployment.
        No hit -> ("", "gpu") — unmapped, caller must surface as an error.

Later tasks (Task 3–5) will add per-vendor run row collectors here.
"""

import calendar
import datetime
import json
from pathlib import Path

_GPU_MODELS_PATH = (
    Path(__file__).resolve().parents[2] / "config" / "gpu_models.json"
)

# Load once at module import. Keyed by vendor slug; each value is an ordered
# list of match entries. First hit wins (per brief). Match logic:
#   - "exact": true  -> case-sensitive exact match only
#   - match is a list -> case-insensitive substring match against any element
#   - match is "" (empty string) -> catch-all (matches anything)
#   - match is a str -> case-insensitive substring match
_GPU_MODELS: dict = json.loads(_GPU_MODELS_PATH.read_text())


def stamp(vendor: str, deployment: str) -> tuple[str, str]:
    """Return (models_csv, kind) for a (vendor, deployment) pair.

    models_csv is the comma-joined list of models the deployment serves.
    kind is "gpu" or "serverless".
    No matching entry -> ("", "gpu").
    """
    entries = _GPU_MODELS.get(vendor, [])
    for entry in entries:
        match = entry["match"]
        exact = entry.get("exact", False)
        if exact:
            # exact string comparison (case-sensitive per brief)
            if deployment == match:
                return (entry["model"], entry["kind"])
        elif isinstance(match, list):
            # any-of: case-insensitive substring test against each element
            dep_lower = deployment.lower()
            if any(m.lower() in dep_lower for m in match):
                return (entry["model"], entry["kind"])
        elif match == "":
            # catch-all
            return (entry["model"], entry["kind"])
        else:
            # single substring, case-insensitive
            if match.lower() in deployment.lower():
                return (entry["model"], entry["kind"])
    return ("", "gpu")


def split_run_by_month(started_at, ended_at, cost, gpu_count=1):
    """Split a run [started_at, ended_at) across calendar months.

    Args:
        started_at: datetime — run start (inclusive)
        ended_at:   datetime — run end (exclusive)
        cost:       float — total cost to pro-rate
        gpu_count:  int — gpu count (reserved for future per-gpu hour math)

    Returns:
        list of (month:'YYYY-MM', hours_in_month:float, cost_in_month:float)

        Cost is pro-rated by hours. All-but-last months are rounded to 2 decimal
        places; the last month receives the remainder so the sum equals `cost`
        exactly (exact-cents invariant).

    Raises:
        ValueError if ended_at <= started_at.
    """
    if ended_at <= started_at:
        raise ValueError(
            f"ended_at ({ended_at!r}) must be strictly after started_at ({started_at!r})"
        )

    total_seconds = (ended_at - started_at).total_seconds()
    total_hours = total_seconds / 3600.0

    # Collect (month_str, hours_in_month) segments by walking month boundaries.
    segments = []
    cursor = started_at
    while cursor < ended_at:
        # End of current month (first moment of next month)
        year, month = cursor.year, cursor.month
        if month == 12:
            next_month_start = datetime.datetime(year + 1, 1, 1)
        else:
            next_month_start = datetime.datetime(year, month + 1, 1)

        segment_end = min(ended_at, next_month_start)
        hours = (segment_end - cursor).total_seconds() / 3600.0
        month_str = f"{year:04d}-{month:02d}"
        segments.append((month_str, hours))
        cursor = segment_end

    # Pro-rate cost by hours; last month gets the remainder for exact-cents sum.
    # Accumulate in integer cents to avoid IEEE754 drift over long spans.
    total_cents = round(cost * 100)
    parts = []
    accumulated_cents = 0
    for i, (month_str, hours) in enumerate(segments):
        if i < len(segments) - 1:
            raw = cost * (hours / total_hours)
            month_cents = round(raw * 100)
            accumulated_cents += month_cents
        else:
            # Last month: exact remainder in cents — no float drift possible.
            month_cents = total_cents - accumulated_cents
        month_cost = month_cents / 100.0
        parts.append((month_str, hours, month_cost))

    return parts
