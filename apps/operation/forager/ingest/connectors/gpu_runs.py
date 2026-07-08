"""gpu_runs connector — month-split helper + model mapping + run row collectors.

Exports:
    split_run_by_month(started_at, ended_at, cost, gpu_count=1)
        -> list[(month:'YYYY-MM', hours_in_month:float, cost_in_month:float)]

    stamp(vendor, deployment) -> tuple[str, str]
        Map a (vendor, deployment) pair to (models_csv, kind).
        models_csv is a comma-joined list of models served by that deployment.
        No hit -> ("", "gpu") — unmapped, caller must surface as an error.

    runs_rows_runpod(secrets, months, http)
        -> list of gpu_runs row dicts for RunPod billing data.
"""

import calendar
import collections
import datetime
import json
import re
import subprocess
from pathlib import Path

from .common import http_json as _http_json
from .vendors.vast import _window as _vast_window

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


# ---------------------------------------------------------------------------
# RunPod run rows
# ---------------------------------------------------------------------------

_RUNPOD_BASE = "https://rest.runpod.io/v1"
_RUNPOD_GRAPHQL = "https://api.runpod.io/graphql"
_RUNPOD_SURFACES = ("pods", "endpoints", "networkvolumes")
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _billing_window(months):
    """UTC window covering min..max of the requested months."""
    start = f"{min(months)}-01T00:00:00Z"
    y, m = int(max(months)[:4]), int(max(months)[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    end = f"{ny:04d}-{nm:02d}-01T00:00:00Z"
    return start, end


def _resolve_pod_names(key, http):
    """One GraphQL call to get live pod id→name map.

    GraphQL quirk: key goes in the URL query string, not in the Authorization
    header. Returns {} on any failure so unresolved ids stay raw — the caller
    must not crash on a name-resolution failure.
    """
    query = {"query": "query { myself { pods { id name } } }"}
    try:
        resp = http(f"{_RUNPOD_GRAPHQL}?api_key={key}", data=query)
        pods = ((resp.get("data") or {}).get("myself") or {}).get("pods") or []
        return {p["id"]: p["name"] for p in pods if p.get("id") and p.get("name")}
    except Exception:
        return {}


def runs_rows_runpod(secrets, months, http=None):
    """RunPod gpu_runs connector — REST per-pod/endpoint/volume monthly rollup.

    Same data sources as gpu_billing.monthly_rows_runpod (REST billing/{pods,
    endpoints,networkvolumes}?bucketSize=month; GraphQL live-pod name resolution
    with key-in-URL sanitization preserved). Outputs one gpu_runs row per
    (pod/endpoint/volume, month).

    Args:
        secrets: dict with RUNPOD_API_KEY
        months:  list of "YYYY-MM" strings to emit
        http:    injectable http_json replacement (for testing)

    Returns:
        list of gpu_runs row dicts; zero-amount rows are skipped.

    Row shape:
        {"month", "vendor", "run_id", "deployment", "gpu", "gpu_count",
         "started_at", "ended_at", "hours", "cost", "currency",
         "model", "kind", "source"}

    Conventions:
        - _serverless:<id> rows always get kind="serverless" (overrides stamp).
        - _storage rows use stamp("runpod", "_storage") → ("zimage", "gpu").
        - Dead pods (no live name in GraphQL) keep pod_id as deployment,
          started_at="" and hours=None.
    """
    if http is None:
        http = _http_json

    if not months:
        return []
    key = secrets.get("RUNPOD_API_KEY")
    if not key:
        raise RuntimeError("RUNPOD_API_KEY missing")

    start, end = _billing_window(months)
    headers = {"Authorization": f"Bearer {key}"}
    month_set = set(months)

    # Accumulate per (month, pod_id, surface) amounts — surface needed so we
    # can track the raw pod_id separately from the resolved name and to handle
    # _serverless kind override.
    # Key: (month, raw_id, surface) → float
    totals: dict[tuple[str, str, str], float] = collections.defaultdict(float)

    for surface in _RUNPOD_SURFACES:
        url = (
            f"{_RUNPOD_BASE}/billing/{surface}?bucketSize=month"
            f"&startTime={start}&endTime={end}"
        )
        try:
            raw_rows = http(url, headers) or []
        except Exception:
            raw_rows = []

        for row in raw_rows:
            amount = float(row.get("amount") or 0)
            if not amount:
                continue

            if surface == "networkvolumes":
                month = str(row.get("startDate") or "")[:7]
                raw_id = "_storage"
            elif surface == "endpoints":
                month = str(row.get("time") or "")[:7]
                ep_id = str(row.get("endpointId") or "")
                raw_id = f"_serverless:{ep_id}" if ep_id else "_serverless"
            else:
                month = str(row.get("time") or "")[:7]
                raw_id = str(row.get("podId") or "")

            if not month or not _MONTH_RE.match(month):
                continue
            if month not in month_set:
                continue
            totals[(month, raw_id, surface)] += amount

    if not totals:
        return []

    # Resolve live pod names via one GraphQL call.
    pod_names = _resolve_pod_names(key, http)

    rows = []
    for (month, raw_id, surface), amount in sorted(totals.items()):
        amount_r = round(amount, 2)
        if not amount_r:
            continue

        # Resolve deployment name: only for raw pod ids (not _storage/_serverless).
        if not raw_id.startswith("_") and raw_id in pod_names:
            deployment = pod_names[raw_id]
        else:
            deployment = raw_id

        # Determine model + kind via stamp, then apply serverless override.
        model_csv, kind = stamp("runpod", deployment)
        if surface == "endpoints":
            # Serverless endpoints are always kind=serverless regardless of stamp.
            kind = "serverless"

        rows.append({
            "month": month,
            "vendor": "runpod",
            "run_id": raw_id,
            "deployment": deployment,
            "gpu": "",
            "gpu_count": 1,
            "started_at": "",
            "ended_at": "",
            "hours": None,
            "cost": amount_r,
            "currency": "USD",
            "model": model_csv,
            "kind": kind,
            "source": "api",
        })

    return rows


# ---------------------------------------------------------------------------
# Vast.ai run rows
# ---------------------------------------------------------------------------

def runs_rows_vast(secrets, months, today, run_cmd=subprocess.run):
    """Vast.ai gpu_runs connector — per-run, per-month rows from invoice charges.

    Reuses the same invoice source as gpu_billing.monthly_rows_vast (same CLI
    call, same _window helper). KEY DIFFERENCE: instead of _spread (which just
    pro-rates by month with no run identity), we derive real run boundaries from
    the charge fields:

        ended   = datetime.utcfromtimestamp(int(timestamp))
        started = ended − timedelta(hours=float(quantity))

    Then call split_run_by_month(started, ended, cost) to split across calendar
    months. This preserves run identity (one row per (instance_id, month)) and
    real wall-clock hours.

    started_at / ended_at CLIPPING CHOICE:
        Each emitted row's started_at and ended_at are CLIPPED to the month
        boundary it belongs to — not the overall run's true start/end. This
        ensures each row's [started_at, ended_at] lies within its own month and
        is consistent with its hours value. For a charge entirely within one
        month, started_at/ended_at equal the true run start/end.

    Args:
        secrets:  dict (unused — vastai CLI reads ~/.config/vastai/vast_api_key)
        months:   list of "YYYY-MM" strings to emit
        today:    current ingest date "YYYY-MM-DD"
        run_cmd:  injectable subprocess.run replacement (for testing)

    Returns:
        list of gpu_runs row dicts; only rows for months in `months` are emitted.
        Rows with zero hours or zero cost are skipped.

    Row shape:
        {"month", "vendor", "run_id", "deployment", "gpu", "gpu_count",
         "started_at", "ended_at", "hours", "cost", "currency",
         "model", "kind", "source"}
    """
    if not months:
        return []

    start, end = _vast_window(months, today)
    try:
        r = run_cmd(
            ["vastai", "show", "invoices", "--raw", "-s", start, "-e", end],
            capture_output=True, text=True, timeout=60,
        )
    except FileNotFoundError:
        raise RuntimeError("vastai CLI not installed (pip install vastai)")

    if r.returncode != 0:
        raise RuntimeError(
            f"vastai show invoices failed (rc={r.returncode}): "
            f"{(r.stderr or '').strip()[:120]}"
        )

    try:
        d = json.loads(r.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("vastai show invoices returned non-JSON")

    month_set = set(months)
    rows = []

    for row in (d or []):
        if row.get("type") != "charge":
            continue
        ts = row.get("timestamp")
        if not ts:
            continue

        # Resolve instance id: vast charge rows may carry instance_id, id, or machine_id.
        instance_id = (
            row.get("instance_id")
            or row.get("id")
            or row.get("machine_id")
            or ""
        )
        instance_id = str(instance_id) if instance_id else ""

        try:
            quantity = float(row.get("quantity") or 0)
        except (TypeError, ValueError):
            quantity = 0.0

        cost = float(row.get("amount") or 0)

        # Derive true run boundaries from invoice fields.
        ended = datetime.datetime.utcfromtimestamp(int(ts))
        if quantity > 0:
            started = ended - datetime.timedelta(hours=quantity)
        else:
            # No quantity — treat as a zero-duration point; skip (can't split).
            continue

        try:
            parts = split_run_by_month(started, ended, cost)
        except ValueError:
            continue  # ended <= started — skip malformed rows

        # Walk the calendar-month boundaries to compute clipped started_at/ended_at.
        # We re-walk the same segments split_run_by_month used internally, clipping
        # each segment to its month boundary so the row timestamps stay inside the month.
        cursor = started
        part_idx = 0
        for month_str, hours_in_month, cost_in_month in parts:
            if month_str not in month_set:
                cursor = _advance_to_next_month(cursor)
                continue
            if hours_in_month <= 0 or cost_in_month <= 0:
                cursor = _advance_to_next_month(cursor)
                continue

            # Clipped start = cursor (i.e. max(true_start, start_of_month))
            # Clipped end   = min(ended, start_of_next_month)
            clipped_start = cursor
            next_month_start = _next_month_start(cursor)
            clipped_end = min(ended, next_month_start)

            model_csv, kind = stamp("vast.ai", instance_id)

            rows.append({
                "month": month_str,
                "vendor": "vast.ai",
                "run_id": instance_id,
                "deployment": instance_id,
                "gpu": "",
                "gpu_count": 1,
                "started_at": clipped_start.strftime("%Y-%m-%d %H:%M:%S"),
                "ended_at": clipped_end.strftime("%Y-%m-%d %H:%M:%S"),
                "hours": round(hours_in_month, 4),
                "cost": round(cost_in_month, 2),
                "currency": "USD",
                "model": model_csv,
                "kind": kind,
                "source": "cli",
            })

            cursor = clipped_end

    return rows


def _next_month_start(dt):
    """Return the first moment of the month after dt's month."""
    year, month = dt.year, dt.month
    if month == 12:
        return datetime.datetime(year + 1, 1, 1)
    return datetime.datetime(year, month + 1, 1)


def _advance_to_next_month(cursor):
    """Move cursor to the start of the next calendar month (for skipped months)."""
    return _next_month_start(cursor)
