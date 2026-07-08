"""GPU fleet snapshot connectors → gpu_fleet (append-only).

One row per RUNNING pod/instance per vendor per run. Snapshots are the
allocation + runway witness only — rent truth stays in provider_monthly.
balance_usd is the vendor prepaid balance at recorded_at, repeated on the
vendor's rows (None where the provider has no balance API: lambda, modal).
ovhcloud contributes no rows: the consumer key is scoped to /me/credit and
/cloud/project/* 403s (broader key = flagged to Elliot, PLAN-GPU.md §4).
modal is serverless: rows only when containers are actually running (no
$/hr in `modal container list`, so usd_per_hr is 0 — modal rent comes from
its meter rows, never from fleet allocation).
"""
import base64
import json
import subprocess

from .common import http_json

_RUNPOD_QUERY = ("query { myself { clientBalance currentSpendPerHr pods { "
                 "name desiredStatus costPerHr gpuCount machine { gpuDisplayName } } } }")


def _row(now, vendor, deployment, gpu, gpu_count, usd_per_hr, balance_usd):
    return {
        "recorded_at": now,
        "vendor": vendor,
        "deployment": str(deployment),
        "gpu": gpu or "",
        "gpu_count": int(gpu_count or 0),
        "usd_per_hr": round(float(usd_per_hr or 0), 4),
        "balance_usd": None if balance_usd is None else round(float(balance_usd), 2),
    }


def snapshot_runpod(creds, now, http=http_json):
    key = creds.get("RUNPOD_API_KEY")
    if not key:
        raise RuntimeError("RUNPOD_API_KEY missing")
    # GraphQL quirk: the key goes in the URL query string, not a header.
    resp = http(f"https://api.runpod.io/graphql?api_key={key}",
                data={"query": _RUNPOD_QUERY})
    me = (resp.get("data") or {}).get("myself") or {}
    balance = me.get("clientBalance")
    rows = [
        _row(now, "runpod", p.get("name"), (p.get("machine") or {}).get("gpuDisplayName"),
             p.get("gpuCount"), p.get("costPerHr"), balance)
        for p in me.get("pods") or []
        if p.get("desiredStatus") == "RUNNING"
    ]
    # account burn > pod sum: the delta is disk/storage — keep the vendor sum honest
    delta = round(float(me.get("currentSpendPerHr") or 0)
                  - sum(r["usd_per_hr"] for r in rows), 4)
    if delta > 0.001:
        rows.append(_row(now, "runpod", "_storage", "", 0, delta, balance))
    # zero pods but a balance: keep the balance timeline unbroken (PLAN-GPU §2)
    if not rows and balance is not None:
        rows.append(_row(now, "runpod", "", "", 0, 0, balance))
    return rows


def snapshot_lambda(creds, now, http=http_json):
    key = creds.get("LAMBDA_LABS_API_KEY")
    if not key:
        raise RuntimeError("LAMBDA_LABS_API_KEY missing")
    auth = base64.b64encode(f"{key}:".encode()).decode()
    resp = http("https://cloud.lambdalabs.com/api/v1/instances",
                headers={"Authorization": f"Basic {auth}"})
    rows = []
    for inst in resp.get("data") or []:
        if inst.get("status") not in (None, "active", "booting"):
            continue
        itype = inst.get("instance_type") or {}
        rows.append(_row(now, "lambda", inst.get("name") or inst.get("id"),
                         itype.get("description") or itype.get("name"),
                         1, (itype.get("price_cents_per_hour") or 0) / 100,
                         None))  # no balance API (architectural)
    return rows


def snapshot_vast(creds, now, http=http_json):
    key = creds.get("VAST_API_KEY")
    if not key:
        raise RuntimeError("VAST_API_KEY missing")
    headers = {"Authorization": f"Bearer {key}"}
    balance = (http("https://console.vast.ai/api/v0/users/current/", headers)
               or {}).get("credit")
    resp = http("https://console.vast.ai/api/v0/instances/", headers) or {}
    rows = [
        _row(now, "vast.ai", inst.get("id"), inst.get("gpu_name"),
             inst.get("num_gpus"), inst.get("dph_total"), balance)
        for inst in resp.get("instances") or []
        if inst.get("actual_status") == "running"
    ]
    # zero instances but a balance: keep the balance timeline unbroken (PLAN-GPU §2)
    if not rows and balance is not None:
        rows.append(_row(now, "vast.ai", "", "", 0, 0, balance))
    return rows


def snapshot_modal(creds, now, run_cmd=subprocess.run):
    tid, tsec = creds.get("MODAL_TOKEN_ID"), creds.get("MODAL_TOKEN_SECRET")
    if not tid or not tsec:
        raise RuntimeError("MODAL_TOKEN_ID/MODAL_TOKEN_SECRET missing")
    proc = run_cmd(["modal", "container", "list", "--json"],
                   capture_output=True, text=True, timeout=60,
                   env={"MODAL_TOKEN_ID": tid, "MODAL_TOKEN_SECRET": tsec,
                        "PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin"})
    if proc.returncode != 0:
        raise RuntimeError(f"modal cli failed: {proc.stderr.strip()[:120]}")
    containers = json.loads(proc.stdout or "[]")
    # container list has no $/hr — usd_per_hr 0; modal rent comes from its meter
    return [
        _row(now, "modal", c.get("App Name") or c.get("app_name") or c.get("Container ID"),
             c.get("GPU") or c.get("gpu") or "", 1, 0, None)
        for c in containers
    ]


_SNAPSHOTS = [
    ("runpod", snapshot_runpod),
    ("lambda", snapshot_lambda),
    ("vast.ai", snapshot_vast),
]


def snapshot_all(creds, now, http=http_json, run_cmd=subprocess.run):
    """All vendors, per-vendor failure isolation. Returns (rows, statuses)."""
    rows, statuses = [], {}
    for slug, fn in _SNAPSHOTS:
        try:
            got = fn(creds, now, http=http)
            rows.extend(got)
            statuses[f"fleet:{slug}"] = f"ok:{len(got)} rows"
        except Exception as e:
            statuses[f"fleet:{slug}"] = "err:" + str(e)[:120]
    try:
        got = snapshot_modal(creds, now, run_cmd=run_cmd)
        rows.extend(got)
        statuses["fleet:modal"] = f"ok:{len(got)} rows"
    except Exception as e:
        statuses["fleet:modal"] = "err:" + str(e)[:120]
    return rows, statuses
