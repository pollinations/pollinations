"""GPU billing history connectors → gpu_billing (replace-managed).

One row per (vendor, month, deployment) with the billed USD amount.
Three connectors:
  - runpod:  REST billing API (Bearer auth) — per-podId monthly rollups.
  - modal:   `modal billing report --json` CLI per month.
  - vast.ai: `vastai show invoices --raw` CLI reusing vendors/vast._spread.

source = "api" for REST calls, "cli" for subprocess calls.
Manual rows (source="manual") survive across refreshes; the forager keeps
them when splicing so Elliot's hand-entered lambda rows are never lost.
"""

import collections
import datetime
import json
import re
import subprocess

from .common import http_json
from .vendors.vast import _spread, _window as _vast_window

_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

_RUNPOD_BASE = "https://rest.runpod.io/v1"
_RUNPOD_GRAPHQL = "https://api.runpod.io/graphql"
_RUNPOD_SURFACES = ("pods", "endpoints", "networkvolumes")


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


def monthly_rows_runpod(creds, months, http=http_json):
    """RunPod billing connector — REST per-pod/endpoint/volume monthly rollup.

    Args:
        creds:  dict with RUNPOD_API_KEY
        months: list of "YYYY-MM" strings to emit
        http:   injectable http_json replacement (for testing)

    Returns:
        list of gpu_billing row dicts; only rows in `months` are emitted.
        Zero-amount rows are skipped.

    RunPod REST billing note: pods have per-row {podId, amount, time:"YYYY-MM-01"};
    MULTIPLE rows per pod per month are possible — sum per (month, podId).
    Endpoints use endpointId → deployment "_serverless:<endpointId>".
    Networkvolumes use startDate (no id) → one "_storage" row per month.
    """
    if not months:
        return []
    key = creds.get("RUNPOD_API_KEY")
    if not key:
        raise RuntimeError("RUNPOD_API_KEY missing")

    start, end = _billing_window(months)
    headers = {"Authorization": f"Bearer {key}"}
    month_set = set(months)

    # Accumulate per (month, deployment) amounts across all surfaces.
    # Key: (month, deployment) → float
    totals: dict[tuple[str, str], float] = collections.defaultdict(float)

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
                deployment = "_storage"
            elif surface == "endpoints":
                month = str(row.get("time") or "")[:7]
                ep_id = str(row.get("endpointId") or "")
                deployment = f"_serverless:{ep_id}" if ep_id else "_serverless"
            else:
                # pods: per-podId rows
                month = str(row.get("time") or "")[:7]
                deployment = str(row.get("podId") or "")

            if not month or not _MONTH_RE.match(month):
                continue
            if month not in month_set:
                continue
            totals[(month, deployment)] += amount

    if not totals:
        return []

    # Resolve live pod names via one GraphQL call.
    pod_names = _resolve_pod_names(key, http)

    rows = []
    for (month, deployment), amount in sorted(totals.items()):
        amount_r = round(amount, 2)
        if not amount_r:
            continue
        # Resolve pod names (only for raw pod ids — not _storage/_serverless).
        if not deployment.startswith("_") and deployment in pod_names:
            deployment = pod_names[deployment]
        rows.append({
            "month": month,
            "vendor": "runpod",
            "deployment": deployment,
            "gpu": "",
            "amount": amount_r,
            "currency": "USD",
            "source": "api",
        })
    return rows


def monthly_rows_modal(creds, months, run_cmd=subprocess.run):
    """Modal billing connector — `modal billing report --json` per month.

    Each month is fetched separately (≤31-day windows).
    The CLI returns daily per-app dicts; we sum per (month, app).

    Args:
        creds:    dict with MODAL_TOKEN_ID and MODAL_TOKEN_SECRET
        months:   list of "YYYY-MM" strings to emit
        run_cmd:  injectable subprocess.run replacement (for testing)

    Returns:
        list of gpu_billing row dicts; zero-cost months are skipped.
    """
    if not months:
        return []
    tid = creds.get("MODAL_TOKEN_ID")
    tsec = creds.get("MODAL_TOKEN_SECRET")
    if not tid or not tsec:
        raise RuntimeError("MODAL_TOKEN_ID/MODAL_TOKEN_SECRET missing")

    import os
    env = {**os.environ, "MODAL_TOKEN_ID": tid, "MODAL_TOKEN_SECRET": tsec}

    rows = []
    for month in months:
        y, m = int(month[:4]), int(month[5:7])
        start = f"{y:04d}-{m:02d}-01"
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        # end is the first day of the next month (exclusive)
        end = f"{ny:04d}-{nm:02d}-01"

        try:
            proc = run_cmd(
                ["modal", "billing", "report",
                 "--start", start, "--end", end, "--json"],
                capture_output=True, text=True, timeout=60, env=env,
            )
        except FileNotFoundError:
            raise RuntimeError("modal CLI not installed")

        if proc.returncode != 0:
            raise RuntimeError(
                f"modal billing report failed for {month} "
                f"(rc={proc.returncode}): {(proc.stderr or '').strip()[:120]}"
            )

        try:
            daily_rows = json.loads(proc.stdout or "[]") or []
        except (ValueError, TypeError):
            raise RuntimeError(f"modal billing report returned non-JSON for {month}")

        # Sum per app for the month.
        # The CLI returns rows with varying field names: accept "app",
        # "description", or "app_name" style keys (defensive, mirrors fleet.py).
        app_totals: dict[str, float] = collections.defaultdict(float)
        for drow in daily_rows:
            app = (
                drow.get("app")
                or drow.get("description")
                or drow.get("app_name")
                or ""
            )
            cost_raw = drow.get("cost") or drow.get("amount") or 0
            try:
                cost = float(cost_raw)
            except (TypeError, ValueError):
                cost = 0.0
            if app and cost:
                app_totals[app] += cost

        for app, total in sorted(app_totals.items()):
            amount_r = round(total, 2)
            if not amount_r:
                continue
            rows.append({
                "month": month,
                "vendor": "modal",
                "deployment": app,
                "gpu": "",
                "amount": amount_r,
                "currency": "USD",
                "source": "cli",
            })

    return rows


def monthly_rows_vast(creds, months, today, run_cmd=subprocess.run):
    """Vast.ai billing connector — reuses vendors/vast._spread for usage attribution.

    Calls `vastai show invoices --raw -s <start> -e <end>` (same window rules
    as the meter connector). For each charge row, attributes the amount to
    usage months via _spread (imported, not duplicated). Per-instance
    attribution: each charge row carries an instance/machine id field.

    Args:
        creds:    dict (unused for auth — CLI reads its own config file)
        months:   list of "YYYY-MM" strings to emit
        today:    current ingest date "YYYY-MM-DD"
        run_cmd:  injectable subprocess.run replacement (for testing)

    Returns:
        list of gpu_billing row dicts; zero rows skipped.
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
    # Accumulate per (month, instance_id) → float
    totals: dict[tuple[str, str], float] = collections.defaultdict(float)

    for row in (d or []):
        if row.get("type") != "charge":
            continue
        ts = row.get("timestamp")
        if not ts:
            continue

        # Resolve instance id: vast charge rows may carry id, instance_id, or
        # machine_id. Use the first non-None one we find.
        instance_id = (
            row.get("instance_id")
            or row.get("id")
            or row.get("machine_id")
            or ""
        )
        instance_id = str(instance_id) if instance_id else ""

        try:
            hours = float(row.get("quantity") or 0)
        except (TypeError, ValueError):
            hours = 0.0

        amount = float(row.get("amount") or 0)
        for mo, part in _spread(ts, hours, amount).items():
            if mo in month_set and part:
                totals[(mo, instance_id)] += part

    rows = []
    for (month, deployment), total in sorted(totals.items()):
        amount_r = round(total, 2)
        if not amount_r:
            continue
        rows.append({
            "month": month,
            "vendor": "vast.ai",
            "deployment": deployment,
            "gpu": "",
            "amount": amount_r,
            "currency": "USD",
            "source": "cli",
        })
    return rows
