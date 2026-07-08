# GPU Economics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the time-based GPU cost lens from `apps/operation/treasury/PLAN-GPU.md`: roster `cost_basis` flag, `gpu_fleet` snapshot witness, `requests` on pollen_monthly (successful non-cached only), raw **Fleet** tab, insights **GPU** tab, runway alarms.

**Architecture:** Forager (Python stdlib, hermetic tests) appends fleet snapshots to a new append-only Tinybird table and adds one aggregate to the pollen pull; the treasury web app (React 19 + @pollinations/ui, pure client-side derivation) reads two more pipes and derives deployment-grain economics. Vendor rent always reconciles to `provider_monthly` (witnessed bills) — fleet $/hr shares only *allocate*, never *impute*.

**Tech Stack:** Python 3 stdlib (urllib, subprocess), Tinybird datafiles, TypeScript/React 19, vitest, @pollinations/ui.

## Global Constraints

- GPU vendors: exactly `runpod`, `lambda`, `vast.ai`, `ovhcloud`, `modal`. AWS is NOT a GPU vendor (never used for gen AI — Elliot 2026-07-08).
- `requests` counts ONLY successful, non-cached generations: `countIf(cache_hit = false)` inside the existing WHERE (already has `environment='production'`, `is_billed_usage=true`, `response_status` 2xx).
- Missing plane renders "–", never $0.
- All UI from `@pollinations/ui`; follow existing tab conventions (DataTable, TableScroller, useSortableRows, HeaderHint for calculated columns).
- Every new pipe must be added to vite.config.ts `READ_PIPES` (forgetting 404s — recurring trap).
- Commits: short lowercase messages, no AI/Claude mentions, no Co-Authored-By. Run `npx biome check --write` on changed web files before each web commit.
- Tinybird deploys are CONTROLLER-GATED: agents edit datafiles only; `tb --cloud deploy` runs only in the controller session with Elliot's go (operations workspace; `--check` first; never `--allow-destructive-operations`).
- Forager tests: `cd /Users/comsom/Github/pollinations-B/apps/operation/forager && python3 -m pytest tests/ -q`. Web tests: `cd /Users/comsom/Github/pollinations-B/apps/operation/treasury/web && npx vitest run`.
- Work on branch `feat/treasury-app` (verify with `git branch --show-current`). Never push.

---

### Task 1: Roster `cost_basis` + web `costBasis()`

**Files:**
- Modify: `apps/operation/forager/config/vendor_aliases.json` (5 entries)
- Modify: `apps/operation/treasury/web/src/lib/vendor-vocabulary.ts`
- Test: `apps/operation/treasury/web/src/lib/vendor-vocabulary.test.ts`

**Interfaces:**
- Produces: `costBasis(vendor: string): "gpu" | "request"` and `GPU_VENDORS: Set<string>` exported from `lib/vendor-vocabulary.ts`. Later tasks import both.

- [ ] **Step 1: Write the failing test** — append to `vendor-vocabulary.test.ts` (follow the file's existing describe/it style):

```ts
import { costBasis, GPU_VENDORS } from "./vendor-vocabulary";

describe("costBasis", () => {
    it("flags the five GPU vendors", () => {
        expect([...GPU_VENDORS].sort()).toEqual([
            "lambda",
            "modal",
            "ovhcloud",
            "runpod",
            "vast.ai",
        ]);
    });
    it("returns gpu for fleet vendors and request otherwise", () => {
        expect(costBasis("runpod")).toBe("gpu");
        expect(costBasis("fireworks")).toBe("request");
        expect(costBasis("")).toBe("request");
    });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/vendor-vocabulary.test.ts` → FAIL (no export `costBasis`).

- [ ] **Step 3: Implement.** In `vendor_aliases.json` add `"cost_basis": "gpu"` to the `runpod`, `lambda`, `vast.ai`, `ovhcloud`, `modal` entries, e.g.:

```json
"runpod": { "aliases": ["runpod"], "category": "compute", "cost_basis": "gpu" },
```

In `vendor-vocabulary.ts` (after `VENDOR_SET`):

```ts
type VendorEntry = { cost_basis?: string };

export const GPU_VENDORS = new Set(
    Object.entries(vendorAliases as Record<string, VendorEntry>)
        .filter(([, entry]) => entry.cost_basis === "gpu")
        .map(([slug]) => slug),
);

export function costBasis(vendor: string): "gpu" | "request" {
    return GPU_VENDORS.has(vendor) ? "gpu" : "request";
}
```

- [ ] **Step 4: Run web tests AND forager tests** (forager loads the same json — confirm nothing validates entry keys strictly): both suites green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: cost_basis flag for gpu vendors"`

---

### Task 2: Fleet snapshot connectors (forager)

**Files:**
- Create: `apps/operation/forager/ingest/connectors/fleet.py`
- Test: `apps/operation/forager/tests/test_fleet.py`

**Interfaces:**
- Consumes: `ingest.connectors.common.http_json`, `ingest.creds` dict keys `RUNPOD_API_KEY`, `LAMBDA_LABS_API_KEY`, `VAST_API_KEY`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`.
- Produces: `snapshot_all(creds, now, http=http_json, run_cmd=subprocess.run) -> (rows, statuses)` where each row is `{recorded_at, vendor, deployment, gpu, gpu_count, usd_per_hr, balance_usd}` (`balance_usd` None where unqueryable) and `statuses` maps `fleet:<vendor>` → `"ok:<n> rows"` or `"err:<msg>"`. Task 3 wires it into run.py.

- [ ] **Step 1: Write failing tests** (`tests/test_fleet.py`) — hermetic, injectable http/run_cmd, fixtures from the 2026-07-08 live shapes:

```python
"""gpu_fleet snapshot connector tests — hermetic, no network."""
import json

from ingest.connectors import fleet

NOW = "2026-07-08 10:00:00"

RUNPOD_RESP = {"data": {"myself": {
    "clientBalance": 80.06,
    "currentSpendPerHr": 1.439,
    "pods": [
        {"name": "zimage-4090-secure", "desiredStatus": "RUNNING", "costPerHr": 0.69,
         "gpuCount": 1, "machine": {"gpuDisplayName": "RTX 4090"}},
        {"name": "klein-a5000-v4", "desiredStatus": "RUNNING", "costPerHr": 0.27,
         "gpuCount": 1, "machine": {"gpuDisplayName": "RTX A5000"}},
        {"name": "zimage-3090-a", "desiredStatus": "EXITED", "costPerHr": 0.22,
         "gpuCount": 1, "machine": {"gpuDisplayName": "RTX 3090"}},
    ],
}}}

LAMBDA_RESP = {"data": [
    {"name": "Sana - LTX-2.3 - AceStep", "status": "active",
     "region": {"name": "us-east-3"},
     "instance_type": {"name": "gpu_1x_gh200", "description": "1x GH200 (96 GB)",
                       "price_cents_per_hour": 229}},
]}

VAST_INSTANCES = {"instances": [
    {"id": 43575766, "actual_status": "running", "gpu_name": "RTX 5090",
     "num_gpus": 1, "dph_total": 0.4278},
    {"id": 43575000, "actual_status": "exited", "gpu_name": "RTX 5090",
     "num_gpus": 1, "dph_total": 0.4278},
]}
VAST_USER = {"credit": 225.43}


def test_runpod_rows_running_only_with_storage_delta():
    rows = fleet.snapshot_runpod({"RUNPOD_API_KEY": "k"}, NOW,
                                 http=lambda url, headers=None, data=None: RUNPOD_RESP)
    names = [r["deployment"] for r in rows]
    assert "zimage-3090-a" not in names           # EXITED filtered
    assert "_storage" in names                     # 1.439 - 0.96 delta row
    storage = next(r for r in rows if r["deployment"] == "_storage")
    assert storage["usd_per_hr"] == 0.479
    assert all(r["balance_usd"] == 80.06 for r in rows)
    assert all(r["vendor"] == "runpod" and r["recorded_at"] == NOW for r in rows)


def test_runpod_key_in_url_not_header():
    seen = {}
    def http(url, headers=None, data=None):
        seen["url"], seen["headers"] = url, headers or {}
        return RUNPOD_RESP
    fleet.snapshot_runpod({"RUNPOD_API_KEY": "SEKRET"}, NOW, http=http)
    assert "api_key=SEKRET" in seen["url"]
    assert "Authorization" not in seen["headers"]


def test_lambda_rows_price_from_cents():
    def http(url, headers=None, data=None):
        assert "Basic" in (headers or {}).get("Authorization", "")
        return LAMBDA_RESP
    rows = fleet.snapshot_lambda({"LAMBDA_LABS_API_KEY": "k"}, NOW, http=http)
    assert rows == [{
        "recorded_at": NOW, "vendor": "lambda",
        "deployment": "Sana - LTX-2.3 - AceStep", "gpu": "1x GH200 (96 GB)",
        "gpu_count": 1, "usd_per_hr": 2.29, "balance_usd": None,
    }]


def test_vast_rows_running_only_with_balance():
    def http(url, headers=None, data=None):
        return VAST_USER if "users/current" in url else VAST_INSTANCES
    rows = fleet.snapshot_vast({"VAST_API_KEY": "k"}, NOW, http=http)
    assert len(rows) == 1
    assert rows[0]["deployment"] == "43575766"
    assert rows[0]["usd_per_hr"] == 0.4278
    assert rows[0]["balance_usd"] == 225.43


def test_modal_zero_containers_zero_rows():
    class Proc:
        returncode = 0
        stdout = json.dumps([])
        stderr = ""
    rows = fleet.snapshot_modal(
        {"MODAL_TOKEN_ID": "ak", "MODAL_TOKEN_SECRET": "as"}, NOW,
        run_cmd=lambda *a, **k: Proc())
    assert rows == []


def test_snapshot_all_isolates_vendor_failures():
    def boom(*a, **k):
        raise RuntimeError("down")
    rows, statuses = fleet.snapshot_all(
        {"RUNPOD_API_KEY": "k", "LAMBDA_LABS_API_KEY": "k", "VAST_API_KEY": "k",
         "MODAL_TOKEN_ID": "ak", "MODAL_TOKEN_SECRET": "as"},
        NOW, http=boom, run_cmd=boom)
    assert rows == []
    assert all(v.startswith("err:") for k, v in statuses.items() if k.startswith("fleet:"))


def test_missing_key_is_an_error_status_not_a_crash():
    rows, statuses = fleet.snapshot_all({}, NOW,
                                        http=lambda *a, **k: {}, run_cmd=lambda *a, **k: None)
    assert statuses["fleet:runpod"].startswith("err:")
```

- [ ] **Step 2: Run to verify failure** — `python3 -m pytest tests/test_fleet.py -q` → FAIL (module missing).

- [ ] **Step 3: Implement `ingest/connectors/fleet.py`:**

```python
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
```

- [ ] **Step 4: Run tests** — `python3 -m pytest tests/test_fleet.py -q` → all pass; then the full forager suite.
- [ ] **Step 5: Commit** — `git commit -m "feat: gpu fleet snapshot connectors"`

---

### Task 3: `gpu_fleet` datafiles + run.py wiring + runway statuses

**Files:**
- Create: `apps/operation/forager/tinybird/datasources/gpu_fleet.datasource`
- Create: `apps/operation/forager/tinybird/pipes/gpu_fleet_api.pipe`
- Modify: `apps/operation/forager/ingest/run.py` (choices, refresh fn, main)
- Modify: `apps/operation/forager/ingest/inspect.py` (TABLES + _ORDER)
- Test: `apps/operation/forager/tests/test_fleet.py` (extend)

**Interfaces:**
- Consumes: `fleet.snapshot_all` from Task 2.
- Produces: `run.refresh_gpu_fleet(ops_ingest, secrets, now, statuses)` — appends rows via `ops_ingest.append("gpu_fleet", rows)`, merges fleet statuses, adds `gpu_runway:<vendor>` statuses, prints a 🚨 line when runway < 7 days. `--only fleet` CLI scope.

- [ ] **Step 1: Datafiles.** `gpu_fleet.datasource`:

```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `recorded_at` DateTime          `json:$.recorded_at`,
    `vendor` String                 `json:$.vendor`,
    `deployment` String             `json:$.deployment`,
    `gpu` String                    `json:$.gpu`,
    `gpu_count` UInt8               `json:$.gpu_count`,
    `usd_per_hr` Float64            `json:$.usd_per_hr`,
    `balance_usd` Nullable(Float64) `json:$.balance_usd`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "vendor, recorded_at"
```

`gpu_fleet_api.pipe`:

```
TOKEN "treasury_web" READ

NODE endpoint
SQL >
    SELECT
        formatDateTime(recorded_at, '%F %T') AS recorded_at,
        vendor, deployment, gpu, gpu_count, usd_per_hr, balance_usd
    FROM gpu_fleet
    ORDER BY recorded_at DESC, vendor, deployment

TYPE endpoint
```

- [ ] **Step 2: Failing tests** — append to `tests/test_fleet.py`:

```python
from ingest import run as ingest_run


class FakeTB:
    def __init__(self):
        self.appended = []
    def append(self, table, rows):
        self.appended.append((table, rows))


def test_refresh_gpu_fleet_appends_and_flags_runway(capsys):
    statuses = {}
    def fake_all(creds, now, **kw):
        return ([
            {"recorded_at": NOW, "vendor": "runpod", "deployment": "p", "gpu": "RTX 4090",
             "gpu_count": 1, "usd_per_hr": 1.439, "balance_usd": 80.06},
        ], {"fleet:runpod": "ok:1 rows"})
    tb = FakeTB()
    ingest_run.refresh_gpu_fleet(tb, {}, NOW, statuses, snapshot_all=fake_all)
    assert tb.appended[0][0] == "gpu_fleet"
    assert statuses["fleet:runpod"] == "ok:1 rows"
    # 80.06 / (1.439*24) ≈ 2.3 days → alarm
    assert statuses["gpu_runway:runpod"].endswith("d")
    assert "🚨" in capsys.readouterr().out


def test_refresh_gpu_fleet_no_rows_appends_nothing():
    tb = FakeTB()
    ingest_run.refresh_gpu_fleet(tb, {}, NOW, {},
                                 snapshot_all=lambda c, n, **kw: ([], {}))
    assert tb.appended == []
```

- [ ] **Step 3: Run to verify failure**, then implement in `run.py`. Import at top: `from .connectors import fleet as _fleet`. Add function (after `refresh_transactions`):

```python
def refresh_gpu_fleet(ops_ingest, secrets, now, statuses,
                      snapshot_all=None):
    """Append a fleet snapshot (append-only — no replace guard needed)."""
    snap = snapshot_all or _fleet.snapshot_all
    rows, fleet_statuses = snap(secrets, now)
    statuses.update(fleet_statuses)
    if rows:
        ops_ingest.append("gpu_fleet", rows)
    statuses["gpu_fleet_rows"] = len(rows)

    burn = {}
    balance = {}
    for row in rows:
        burn[row["vendor"]] = burn.get(row["vendor"], 0.0) + row["usd_per_hr"]
        if row.get("balance_usd") is not None:
            balance[row["vendor"]] = row["balance_usd"]
    for vendor, bal in balance.items():
        rate = burn.get(vendor, 0.0)
        if rate <= 0:
            continue
        days = bal / (rate * 24)
        statuses[f"gpu_runway:{vendor}"] = f"${bal:.2f} · {rate:.3f}/hr · ~{days:.1f}d"
        if days < 7:
            print(f"🚨 {vendor} runway {days:.1f} days (${bal:.2f} at {rate:.3f}/hr) — top up")
```

In `parse_args`: `choices=["provider", "pollen", "revenue", "transactions", "fleet"]`. In `main()`, after the transactions block:

```python
        if args.only in (None, "fleet"):
            now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            refresh_gpu_fleet(ops_ingest, secrets, now, statuses)
```

Also add `"gpu_fleet"` to the `guard["existing"]` snapshot tuple in `main()` (backup consistency), and in `inspect.py`: `TABLES["gpu_fleet"] = None` plus `_ORDER["gpu_fleet"] = "recorded_at"`.

- [ ] **Step 4: Full forager suite green.**
- [ ] **Step 5: Commit** — `git commit -m "feat: gpu_fleet datasource, pipe, ingest scope + runway alarm"`

**CONTROLLER STEP (not for subagents):** `cd apps/operation/forager/tinybird && tb --cloud deploy --check --wait` → verify plan = gpu_fleet + gpu_fleet_api only → Elliot's go → deploy → `python3 -m ingest.run --only fleet` → readback via `python3 -m ingest.inspect gpu_fleet`.

---

### Task 4: `requests` on pollen_monthly (successful, non-cached only)

**Files:**
- Modify: `apps/operation/forager/ingest/connectors/usage.py` (`_SQL`, `numeric_fields`)
- Modify: `apps/operation/forager/tinybird/datasources/pollen_monthly.datasource`
- Modify: `apps/operation/forager/tinybird/pipes/pollen_monthly_api.pipe`
- Test: `apps/operation/forager/tests/test_usage_revenue.py` (extend)

**Interfaces:**
- Produces: every pollen_monthly row dict gains `requests` (int, summed across canonicalized duplicates); the pipe exposes it. Web Task 5 adds it to `PollenMonthlyRow`.

- [ ] **Step 1: Failing tests** — add to `test_usage_revenue.py` (reuse the file's existing FakeTB/fixture helpers where present; shown standalone):

```python
def test_usage_query_counts_only_noncached_requests():
    query = _usage._SQL.format(month="2026-06", next_month="2026-07")
    assert "countIf(cache_hit = false) AS requests" in query
    # the WHERE already excludes failures + unbilled — requests inherits it
    assert "response_status >= 200 AND response_status < 300" in query
    assert "is_billed_usage = true" in query


def test_usage_rows_carry_requests_and_sum_on_canonical_merge():
    class FakeTB:
        def sql(self, q):
            return [
                {"vendor": "bedrock", "model": "m", "requests": 5,
                 "cost_paid": 1, "cost_quests": 0, "cost_other": 0,
                 "price_paid": 2, "price_quests": 0, "price_other": 0,
                 "byop_paid": 0, "byop_quests": 0, "byop_other": 0,
                 "model_paid": 0, "model_quests": 0, "model_other": 0},
                {"vendor": "aws-bedrock", "model": "m", "requests": 7,
                 "cost_paid": 1, "cost_quests": 0, "cost_other": 0,
                 "price_paid": 2, "price_quests": 0, "price_other": 0,
                 "byop_paid": 0, "byop_quests": 0, "byop_other": 0,
                 "model_paid": 0, "model_quests": 0, "model_other": 0},
            ]
    rows = _usage.monthly_rows(FakeTB(), ["2026-06"], "2026-07-08")
    aws = [r for r in rows if r["vendor"] == "aws" and r["model"] == "m"]
    assert len(aws) == 1 and aws[0]["requests"] == 12
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `usage.py` `_SQL`, add one line after the `model_quests` aggregate (before `FROM`):

```sql
  countIf(cache_hit = false) AS requests
```

(with a trailing comma on the previous line). Add `"requests"` to the `numeric_fields` tuple in `monthly_rows` (it sums across canonicalized duplicates; it is NOT in `_SPLIT_FIELDS`, so `_split_other` never touches it). Datasource: append to SCHEMA:

```
    `requests` UInt64 `json:$.requests` DEFAULT 0
```

Pipe: add `requests` to the SELECT column list (after `model_quests`).

- [ ] **Step 4: Full forager suite green.**
- [ ] **Step 5: Commit** — `git commit -m "feat: pollen requests count, successful non-cached only"`

**CONTROLLER STEP:** `tb --cloud deploy --check` (plan = pollen_monthly forward-query column + pipe), Elliot's go, deploy, then full backfill: `python3 -m ingest.run --only pollen` (all months re-pulled, column populated everywhere).

---

### Task 5: Web plumbing + raw **Fleet** tab

**Files:**
- Modify: `apps/operation/treasury/web/src/types.ts`
- Modify: `apps/operation/treasury/web/src/lib/tb.ts`
- Modify: `apps/operation/treasury/web/src/fixtures.ts`
- Modify: `apps/operation/treasury/web/vite.config.ts` (READ_PIPES)
- Modify: `apps/operation/treasury/web/src/views/PollenTab.tsx` (requests column — pipe mirror)
- Create: `apps/operation/treasury/web/src/views/FleetTab.tsx`
- Modify: `apps/operation/treasury/web/src/App.tsx` (raw tab entry)
- Test: `apps/operation/treasury/web/src/views/FleetTab.test.ts`

**Interfaces:**
- Produces: `GpuFleetRow` type; `Data.gpuFleet: GpuFleetRow[]`; fixture key `gpu_fleet_api`; `visibleFleetRows({fleetRows, month, vendor})` exported from FleetTab. Task 6 consumes `Data.gpuFleet` and `PollenMonthlyRow.requests`.

- [ ] **Step 1: Types + plumbing.** `types.ts`:

```ts
export type GpuFleetRow = {
    recorded_at: string; // "YYYY-MM-DD HH:MM:SS"
    vendor: string;
    deployment: string;
    gpu: string;
    gpu_count: number;
    usd_per_hr: number;
    balance_usd: number | null;
};
```

Add `requests: number;` to `PollenMonthlyRow` and `gpuFleet: GpuFleetRow[];` to `Data`. In `tb.ts` `loadAll`, add `fetchPipe<GpuFleetRow>("gpu_fleet_api")` to the `Promise.all` and `gpuFleet` to the returned object. In `vite.config.ts` add `"gpu_fleet_api"` to `READ_PIPES`. In `fixtures.ts` add `requests` to every pollen fixture row (plausible ints, e.g. 1200) and:

```ts
const gpuFleet: GpuFleetRow[] = [
    { recorded_at: "2026-07-08 10:00:00", vendor: "runpod", deployment: "zimage-4090-secure",
      gpu: "RTX 4090", gpu_count: 1, usd_per_hr: 0.69, balance_usd: 80.06 },
    { recorded_at: "2026-07-08 10:00:00", vendor: "runpod", deployment: "klein-a5000-v4",
      gpu: "RTX A5000", gpu_count: 1, usd_per_hr: 0.27, balance_usd: 80.06 },
    { recorded_at: "2026-07-08 10:00:00", vendor: "lambda", deployment: "Sana - LTX-2.3 - AceStep",
      gpu: "1x GH200 (96 GB)", gpu_count: 1, usd_per_hr: 2.29, balance_usd: null },
    { recorded_at: "2026-06-15 10:00:00", vendor: "vast.ai", deployment: "43575766",
      gpu: "RTX 5090", gpu_count: 1, usd_per_hr: 0.4278, balance_usd: 225.43 },
];
// … FIXTURES map: gpu_fleet_api: gpuFleet,
```

Make sure fixture pollen rows exist for models `zimage`, `klein`, `ltx-2` under vendors runpod/lambda in a month matching the fleet fixture (June/July) so the GPU tab fixture view renders.

- [ ] **Step 2: Failing test** (`FleetTab.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { visibleFleetRows } from "./FleetTab";
import type { GpuFleetRow } from "../types";

const rows: GpuFleetRow[] = [
    { recorded_at: "2026-07-08 10:00:00", vendor: "runpod", deployment: "a",
      gpu: "RTX 4090", gpu_count: 1, usd_per_hr: 0.69, balance_usd: 80 },
    { recorded_at: "2026-06-01 09:00:00", vendor: "vast.ai", deployment: "b",
      gpu: "RTX 5090", gpu_count: 1, usd_per_hr: 0.43, balance_usd: 225 },
];

describe("visibleFleetRows", () => {
    it("filters by month prefix and vendor", () => {
        expect(visibleFleetRows({ fleetRows: rows, month: "2026-07", vendor: "all" }))
            .toHaveLength(1);
        expect(visibleFleetRows({ fleetRows: rows, month: "2026", vendor: "vast.ai" }))
            .toHaveLength(1);
    });
});
```

- [ ] **Step 3: Implement `FleetTab.tsx`** — copy the GrantsTab shape exactly (TableScroller → DataTable → useSortableRows). Columns: `recorded at · vendor · deployment · gpu · count · $/hr · balance`. Filter helper:

```ts
export function visibleFleetRows({
    fleetRows, month, vendor,
}: { fleetRows: GpuFleetRow[]; month: string; vendor: string }) {
    return fleetRows.filter(
        (row) =>
            matchesMonth(row.recorded_at.slice(0, 7), month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}
```

(`matchesMonth` from `../lib/months`.) Cells: `fmtNumber(row.usd_per_hr)` for $/hr, `row.balance_usd === null ? "–" : fmtUsd(row.balance_usd)` for balance. Default sort `recorded at` desc.

In `App.tsx`: extend `type Tab` with `"fleet"`; append to `TABS`:

```ts
{
    id: "fleet",
    label: "Fleet",
    codes: ["API", "CLI"],
    pipe: "gpu_fleet_api",
    note: "GPU fleet snapshots: one row per running pod/instance per forager run, with $/hr and prepaid balance where the vendor exposes it. Rent truth stays in Provider - this is the allocation and runway witness.",
    icon: DatabaseIcon,
    rows: (data) => data.gpuFleet.length,
},
```

Wire `vendorOptionsForTab` (`tab === "fleet"` → vendors from `data.gpuFleet`), keep period+vendor filters on (fleet is month-filterable), and render `{data && section === "raw" && tab === "fleet" && (<FleetTab data={data} month={activeMonth} vendor={vendor} />)}`. Add a `requests` column to `PollenTab.tsx` (pipe mirror; `fmtNumber`).

- [ ] **Step 4: Run** `npx vitest run` (all web tests), `npx tsc --noEmit`, `npx biome check --write src`. Visual check: `npm run dev` → `http://127.0.0.1:4180/?fixtures=1`, Fleet tab renders 4 fixture rows.
- [ ] **Step 5: Commit** — `git commit -m "feat: raw fleet tab + gpu_fleet plumbing + pollen requests column"`

---

### Task 6: `lib/gpu.ts` — deployment economics derivation

**Files:**
- Create: `apps/operation/treasury/web/src/lib/gpu.ts`
- Test: `apps/operation/treasury/web/src/lib/gpu.test.ts`

**Interfaces:**
- Consumes: `Data` (gpuFleet, providerMonthly, pollenMonthly, revenueMonthly, grants), `toUsd` from `./fx`, `globalNetRatio`, `creditRunway` from `./insights`, `matchesMonth` from `./months`, `GPU_VENDORS` from `./vendor-vocabulary`.
- Produces (Task 7 consumes verbatim):

```ts
export type GpuDeploymentRow = {
    group: string;            // "GH200 (shared)"
    vendor: string;
    month: string;
    rentUsd: number | null;   // null = no provider bill witnessed that month
    models: string[];
    requests: number;
    paidUsd: number;          // Σ price_paid over mapped models
    questUsd: number;         // Σ price_quests
    retainedUsd: number;      // Σ (price_paid − byop_paid − model_paid)
    coverage: number | null;  // retained × netRatio ÷ rent
    effUsdPerReq: number | null;
    breakEven: { model: string; unit: string; volume: number }[];
    verdict: "keep" | "raise?" | "idle-candidate" | null;
    flags: string[];          // "unmapped fleet", "no fleet visibility", …
};
export function gpuEconomics(data: Data, monthFilter: string): GpuDeploymentRow[];
export type RunwayChip = { vendor: string; label: string; days: number | null; tone: "danger" | "warning" | "neutral" };
export function fleetRunRate(data: Data): { usdPerHr: number; usdPerMonth: number } | null;
export function runwayChips(data: Data, now: Date): RunwayChip[];
export const GPU_DEPLOYMENT_GROUPS: { vendor: string; match: RegExp; group: string; models: string[] }[];
```

- [ ] **Step 1: Failing tests** (`gpu.test.ts`) — build a minimal `Data` literal (copy the empty-Data helper pattern from `insights.test.ts` if one exists; otherwise inline all planes as `[]` and fill only what each test needs):

```ts
import { describe, expect, it } from "vitest";
import { fleetRunRate, gpuEconomics, runwayChips } from "./gpu";
import type { Data } from "../types";

const base: Data = {
    transactions: [], providerMonthly: [], pollenMonthly: [],
    grants: [], runs: [], revenueMonthly: [], gpuFleet: [],
};

const JUNE_FLEET = [
    { recorded_at: "2026-06-10 10:00:00", vendor: "runpod", deployment: "zimage-4090-secure",
      gpu: "RTX 4090", gpu_count: 1, usd_per_hr: 0.75, balance_usd: 500 },
    { recorded_at: "2026-06-10 10:00:00", vendor: "runpod", deployment: "klein-a5000-v4",
      gpu: "RTX A5000", gpu_count: 1, usd_per_hr: 0.25, balance_usd: 500 },
];

const data: Data = {
    ...base,
    gpuFleet: JUNE_FLEET,
    providerMonthly: [{ month: "2026-06", vendor: "runpod", currency: "USD",
        category: "compute", credit: 800, paid: 200, source: "api" }],
    pollenMonthly: [
        { source: "tinybird", month: "2026-06", vendor: "runpod", model: "zimage",
          currency: "POLLEN", cost_paid: 100, cost_quests: 50, price_paid: 1200,
          price_quests: 300, byop_paid: 100, byop_quests: 0, model_paid: 100,
          model_quests: 0, requests: 400000 },
        { source: "tinybird", month: "2026-06", vendor: "runpod", model: "klein",
          currency: "POLLEN", cost_paid: 10, cost_quests: 5, price_paid: 300,
          price_quests: 60, byop_paid: 0, byop_quests: 0, model_paid: 0,
          model_quests: 0, requests: 30000 },
    ],
    revenueMonthly: [{ source: "stripe", month: "2026-06", currency: "EUR",
        gross_amount: 10000, fees_amount: 500, refunds_amount: 400 }],
};

describe("gpuEconomics", () => {
    it("allocates vendor rent by $/hr share and sums to the bill", () => {
        const rows = gpuEconomics(data, "2026-06");
        const total = rows.reduce((acc, r) => acc + (r.rentUsd ?? 0), 0);
        expect(total).toBeCloseTo(1000, 2); // credit 800 + paid 200, USD
        const zimage = rows.find((r) => r.models.includes("zimage"));
        expect(zimage?.rentUsd).toBeCloseTo(750, 2); // 0.75 / 1.00 share
    });
    it("computes effective unit cost from requests", () => {
        const zimage = gpuEconomics(data, "2026-06").find((r) =>
            r.models.includes("zimage"));
        expect(zimage?.effUsdPerReq).toBeCloseTo(750 / 400000, 6);
    });
    it("renders null rent (not 0) when no provider bill exists", () => {
        const noBill = { ...data, providerMonthly: [] };
        const zimage = gpuEconomics(noBill, "2026-06").find((r) =>
            r.models.includes("zimage"));
        expect(zimage?.rentUsd).toBeNull();
        expect(zimage?.coverage).toBeNull();
    });
    it("flags fleet deployments no group matches", () => {
        const stray = { ...data, gpuFleet: [...JUNE_FLEET,
            { recorded_at: "2026-06-10 10:00:00", vendor: "runpod", deployment: "mystery-pod",
              gpu: "H100", gpu_count: 1, usd_per_hr: 2, balance_usd: 500 }] };
        const rows = gpuEconomics(stray, "2026-06");
        expect(rows.some((r) => r.flags.includes("unmapped fleet"))).toBe(true);
    });
});

describe("fleetRunRate", () => {
    it("sums the latest snapshot only", () => {
        const rate = fleetRunRate(data);
        expect(rate?.usdPerHr).toBeCloseTo(1.0, 3);
        expect(rate?.usdPerMonth).toBeCloseTo(730, 0);
    });
});

describe("runwayChips", () => {
    it("derives days from balance and burn, danger under 7d", () => {
        const low = { ...data, gpuFleet: JUNE_FLEET.map((r) =>
            ({ ...r, balance_usd: 50 })) };
        const chip = runwayChips(low, new Date("2026-06-11")).find(
            (c) => c.vendor === "runpod");
        expect(chip?.tone).toBe("danger"); // 50 / 24 ≈ 2.1d
    });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `lib/gpu.ts`.** Complete logic (follow insights.ts commenting style — comments state constraints, not narration):

```ts
import { toUsd } from "./fx";
import { creditRunway, globalNetRatio } from "./insights";
import { matchesMonth } from "./months";
import { GPU_VENDORS } from "./vendor-vocabulary";
import type { Data, GpuFleetRow } from "../types";

// Deployment-name → model mapping, hardcoded (INTERNAL_VENDORS precedent).
// A vendor-level entry (match /.*/ on an otherwise unmatched name) catches
// single-purpose vendors; unmatched names surface as an "unmapped fleet" flag.
export const GPU_DEPLOYMENT_GROUPS = [
    { vendor: "runpod", match: /zimage/i, group: "zimage pods", models: ["zimage"] },
    { vendor: "runpod", match: /klein/i, group: "klein (A5000)", models: ["klein"] },
    { vendor: "runpod", match: /^_storage$/, group: "zimage pods", models: ["zimage"] },
    { vendor: "lambda", match: /gh200|sana|ltx|ace/i, group: "GH200 (shared)",
      models: ["ltx-2", "acestep", "sana"] },
    { vendor: "lambda", match: /./, group: "lambda other", models: [] },
    { vendor: "vast.ai", match: /./, group: "vast.ai box", models: ["flux"] },
];

// Registry unit prices for break-even (shared/registry/image.ts; hardcoded —
// no registry ingestion this phase, PLAN-INSIGHTS ruling).
export const REGISTRY_UNIT_PRICES: Record<string, { price: number; unit: string }> = {
    zimage: { price: 0.002, unit: "img" },
    klein: { price: 0.01, unit: "img" },
    "ltx-2": { price: 0.005, unit: "s" },
};
```

Then the three functions:

- `latestFleet(rows)`: group by vendor, keep rows whose `recorded_at` equals the vendor's max — the current fleet.
- `fleetRunRate(data)`: Σ `usd_per_hr` over `latestFleet`; null when no fleet rows. `usdPerMonth = usdPerHr * 730`.
- `groupFor(vendor, deployment)`: first `GPU_DEPLOYMENT_GROUPS` entry with matching vendor + regex; null → unmapped.
- `gpuEconomics(data, monthFilter)`: for each GPU vendor (from `GPU_VENDORS`):
  1. Vendor rent per month = Σ `toUsd(credit + paid, currency, month)` over `providerMonthly` rows with `vendor` + `matchesMonth(month, monthFilter)` + category not infra. Zero provider rows → rent null.
  2. Fleet shares per month: over snapshots within the month (`recorded_at.slice(0,7)`), compute each group's mean share of the vendor's per-snapshot Σ`usd_per_hr`. No snapshots that month → single vendor-level group `"(vendor total)"` with 100% share and a `"no fleet that month"` flag. ovhcloud always takes this path (+ `"no fleet visibility"` flag).
  3. Pollen per group = Σ over `pollenMonthly` rows matching vendor + month + `model ∈ group.models`: `requests`, `price_paid`, `price_quests`, retained = `price_paid − byop_paid − model_paid`.
  4. `coverage = rent ? (retained × netRatio) / rent : null` with `netRatio = globalNetRatio(data.revenueMonthly)` (null-safe: netRatio null → coverage null). `effUsdPerReq = rent && requests ? rent / requests : null`. `breakEven` = for each model in the group with a `REGISTRY_UNIT_PRICES` entry and non-null rent+netRatio: `volume = rent / (price × netRatio)`.
  5. `verdict`: null when coverage null; `coverage < 0.4` → "idle-candidate"; `< 1.1` → "raise?"; else "keep".
  6. Unmatched fleet deployments (groupFor null): emit a row with group = deployment name, models [], rent share allocated, flag `"unmapped fleet"`.
  Rounding: keep raw floats; formatting is the view's job. Invariant the test pins: Σ group rents == vendor rent (allocate the last group by remainder to kill float drift).
- `runwayChips(data, now)`: for runpod/vast.ai take latest fleet `balance_usd` ÷ (Σ latest `usd_per_hr` × 24) → days; tone danger < 7, warning < 21. For lambda + ovhcloud reuse `creditRunway(data, now)` rows (match by vendor; label from its remaining/depletion fields; days null when absent). Skip vendors with no signal.

- [ ] **Step 4: Run tests** — gpu.test.ts green, whole suite green, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat: gpu deployment economics derivation"`

---

### Task 7: Insights **GPU** tab

**Files:**
- Create: `apps/operation/treasury/web/src/views/GpuTab.tsx`
- Modify: `apps/operation/treasury/web/src/App.tsx`
- Test: `apps/operation/treasury/web/src/views/GpuTab.test.ts`

**Interfaces:**
- Consumes: `gpuEconomics`, `fleetRunRate`, `runwayChips`, `REGISTRY_UNIT_PRICES` from `../lib/gpu`.
- Produces: `<GpuTab data={data} month={month} vendor={vendor} />` + exported `visibleGpuRows` for tests.

- [ ] **Step 1: Failing test** (`GpuTab.test.ts`): `visibleGpuRows({ rows, vendor })` filters by vendor and sorts coverage-ascending nulls-last (worst boxes first):

```ts
import { describe, expect, it } from "vitest";
import { visibleGpuRows } from "./GpuTab";

const mk = (vendor: string, coverage: number | null) => ({
    group: vendor, vendor, month: "2026-06", rentUsd: 1, models: [],
    requests: 0, paidUsd: 0, questUsd: 0, retainedUsd: 0, coverage,
    effUsdPerReq: null, breakEven: [], verdict: null, flags: [],
});

describe("visibleGpuRows", () => {
    it("filters by vendor and sorts worst coverage first, nulls last", () => {
        const rows = [mk("runpod", 1.8), mk("lambda", 0.3), mk("ovhcloud", null)];
        const out = visibleGpuRows({ rows, vendor: "all" });
        expect(out.map((r) => r.vendor)).toEqual(["lambda", "runpod", "ovhcloud"]);
        expect(visibleGpuRows({ rows, vendor: "lambda" })).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `GpuTab.tsx`.** Structure (all @pollinations/ui; HeaderHint on every calculated column header; follow VendorsTab's table conventions):

1. **Header strip**: `fleetRunRate` → `Text` line "fleet run-rate $X.XX/hr ≈ $X,XXX/mo · latest snapshot <date>"; `runwayChips` → `Chip intent="danger"|"warning"|"neutral"` per vendor (`runpod $80.06 · ~2.3d`). No fleet rows at all → `Alert intent="warning"` "No fleet snapshots yet — run python3 -m ingest.run --only fleet".
2. **Table** via DataTable/useSortableRows. Columns and hints:
   - `deployment` (group; sub-line `Text size="micro" tone="soft"` with models joined)
   - `vendor`
   - `rent $` — hint "vendor's witnessed monthly bill (provider plane, credit+paid → USD) × this deployment's share of fleet $/hr that month. Sums to the bill — never imputed." `rentUsd === null ? "–" : fmtUsd(...)`
   - `req` — hint "successful, non-cached generations (pollen requests)" `fmtNumber`
   - `paid ℗` / `quest ℗` — `fmtUsd`; quest hint "free usage occupying the box — earns $0"
   - `coverage` — hint "retained paid pollen × net ratio ÷ rent — does money in pay this box's rent" — `fmtPct(coverage)`, red Text tone when < 1, "–" when null
   - `eff $/req` — hint "rent ÷ requests served — the true unit cost" — 4-decimal format, "–" null
   - `break-even` — per entry `${fmtNumber(volume)} ${unit}/mo` joined by line breaks, "–" when empty
   - `verdict` — Chip: keep = neutral, raise? = warning, idle-candidate = danger + title "consider modal (serverless, $0 idle)"
   - flags rendered as small warning Chips under the deployment cell (`unmapped fleet`, `no fleet visibility`, `no fleet that month`).
3. Sorting default: coverage asc nulls-last via `visibleGpuRows`; header sorting through `useSortableRows` like other tabs.

In `App.tsx`: extend `InsightTab` union with `"gpu"`; add to `INSIGHT_TABS` after `models`:

```ts
{
    id: "gpu",
    label: "GPU",
    note: "Time-based economics for rented GPU boxes: witnessed monthly rent allocated per deployment by fleet $/hr share, vs retained pollen on the models it serves - coverage, true unit cost, break-even volume, runway.",
    icon: DatabaseIcon,
},
```

Render branch `insightTab === "gpu"` → `<GpuTab data={data} month={activeMonth} vendor={vendor} />`. Vendor filter: keep enabled (insightVendors already unions data vendors); period filter applies. Add a `viewInfoContent` block for `gpu` mirroring the note (3 InfoLines: rent allocation, coverage meaning, requests definition).

- [ ] **Step 4: Run** all web tests + tsc + biome. Fixture walk: `?fixtures=1` → GPU tab shows zimage/klein/GH200 rows with rent split, runway chips.
- [ ] **Step 5: Commit** — `git commit -m "feat: gpu insights tab"`

---

### Task 8: `gpu` chip on Models/Vendors rows

**Files:**
- Modify: `apps/operation/treasury/web/src/views/ModelsTab.tsx`
- Modify: `apps/operation/treasury/web/src/views/VendorsTab.tsx`
- Test: `apps/operation/treasury/web/src/views/EconTable.test.ts` (or the existing econ view test file — extend where the row-rendering helpers are tested)

**Interfaces:**
- Consumes: `costBasis` from `../lib/vendor-vocabulary`.

- [ ] **Step 1: Failing test** — wherever the vendor-cell render helper lives, assert a row with vendor "runpod" carries the gpu marker and "fireworks" does not (if rendering is not unit-tested in that file, test `costBasis` usage via a tiny exported helper `isGpuVendor(vendor)` re-export and assert the two cases).
- [ ] **Step 2–3: Implement** — next to the vendor name in both tabs render:

```tsx
{costBasis(row.vendor) === "gpu" && (
    <Chip
        data-theme="neutral"
        intent="neutral"
        size="sm"
        title="time-based vendor — per-request margin here is allocation, not truth; see the GPU tab"
    >
        gpu
    </Chip>
)}
```

No math changes anywhere in economics().
- [ ] **Step 4: Web suite + tsc + biome green.**
- [ ] **Step 5: Commit** — `git commit -m "feat: gpu basis chip on models and vendors tabs"`

---

### Task 9: Live verification (CONTROLLER, after both deploys)

- [ ] `python3 -m ingest.run --only fleet` → statuses show `fleet:runpod ok`, `gpu_runway:runpod` (~expect the 🚨 unless topped up); `ingest.inspect gpu_fleet` shows the rows.
- [ ] `python3 -m ingest.run --only pollen` → diff adds `requests` everywhere; spot-check one month: `requests` for a GPU model is plausible vs the Q2 audit volumes.
- [ ] Dev server against live pipes: Fleet tab mirrors `gpu_fleet_api`; GPU tab June: Σ deployment rents == provider_monthly runpod June ($981.32) and lambda June to the cent; coverage/eff-$ sane vs PLAN-GPU.md baseline.
- [ ] Puppeteer screenshot walk (borrow `myceli-ai/docs/node_modules` puppeteer-core, drive FilterSelect by clicking trigger+items): GPU tab, Fleet tab, gpu chips, runway chips. No console errors.
- [ ] Report numbers to Elliot; nothing pushed without his go.

---

## Self-review notes (already applied)

- Requests inherit success/billed filters from the WHERE; only `cache_hit = false` is new — matches Elliot's rule exactly.
- `requests` deliberately NOT in `_SPLIT_FIELDS` (counts must not be ratio-split); IS in `numeric_fields` (canonical-vendor merge sums it).
- Fleet append is guard-free by design (append-only, no replace); backup snapshot still taken.
- ovhcloud/modal degrade gracefully: flags + meter-based rows, never fake $/hr.
- Rent allocation invariant (Σ groups == vendor bill) is pinned by a test.
