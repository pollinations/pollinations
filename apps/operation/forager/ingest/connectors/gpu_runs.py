"""gpu_runs connector — month-split helper.

Exports:
    split_run_by_month(started_at, ended_at, cost, gpu_count=1)
        -> list[(month:'YYYY-MM', hours_in_month:float, cost_in_month:float)]

Later tasks (Task 3–5) will add per-vendor run row collectors here.
"""

import calendar
import datetime


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
    parts = []
    accumulated_cost = 0.0
    for i, (month_str, hours) in enumerate(segments):
        if i < len(segments) - 1:
            raw = cost * (hours / total_hours)
            month_cost = round(raw, 2)
            accumulated_cost += month_cost
        else:
            # Last month: give it the exact remainder.
            month_cost = round(cost - accumulated_cost, 2)
        parts.append((month_str, hours, month_cost))

    return parts
