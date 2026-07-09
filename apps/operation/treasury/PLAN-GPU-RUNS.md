# GPU Runs Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace the two GPU datasources (`gpu_fleet`, `gpu_billing`) with ONE `gpu_runs` table at run×month grain, one pipe, one raw tab, one insights page — per-run detail (which GPU ran when, for how long, at what cost, serving which model).

**Architecture:** Connectors emit run rows (provider APIs/CLI where retroactive history exists, live-instance witnessing for Lambda, manual rows elsewhere). A shared month-split helper pro-rates runs that span month boundaries. Model attribution is stamped at ingest from a forager config mapping, so the frontend joins `gpu_runs.model` directly against `pollen_monthly.model` with no frontend mapping. Insights derivation keeps every witness invariant from the previous phase (Σ cost per vendor-month pins to the provider bill; drift/missing data → explicit error flags).

**Tech stack:** Python forager (`apps/operation/forager/`), Tinybird `operations` workspace (Forward), React/TS treasury web (`apps/operation/treasury/web/`), vitest + pytest.

## Global Constraints

- **No fallbacks — error loudly.** A missing input (no bill, no runs, unmapped deployment) renders an explicit error flag/row ("error: …"), NEVER a silent substitute or $0. Never name a code path "fallback".
- **Rent witness invariant:** in insights, Σ allocated cost per vendor-month == the witnessed `provider_monthly` bill (credit+paid → toUsd), remainder-to-last-group; billing-ledger drift >2% → `billing drift` flag on the max-cost row only.
- **Vendor names are canonical roster names** from `config/vendor_aliases.json` (`runpod`, `lambda`, `vast.ai`, `modal`, `io.net`, `ovhcloud`) — identical strings to every other table so cross-table filters work.
- **Requests** stay `countIf(cache_hit = false)` within the existing WHERE — do not touch `usage.py`.
- Modern ESM TS; `npx biome check --write` on touched web files before commit. Python matches existing forager style (no new deps).
- Tests: extend existing files where natural (`tests/test_gpu_billing.py` patterns, `src/lib/gpu.test.ts`); test real code via direct imports, no mock infrastructure.
- **Tinybird:** operations workspace, run `tb --cloud deploy --check --wait` before `tb --cloud deploy --wait`, from `apps/operation/forager/tinybird/`. NEVER `--allow-destructive-operations` without fresh explicit approval from Elliot (Task 13 requires asking him first).
- **Never push.** Local commits only.
- Kind values: `gpu` | `serverless`. Serverless rows have `hours = null`, empty times, and are never idle-candidates.
- Unknown times = `''` (String). Running = `started_at != '' && ended_at == ''`. Unknown hours = null.

## File Map

- Create: `forager/tinybird/datasources/gpu_runs.datasource`, `forager/tinybird/pipes/gpu_runs_api.pipe`, `forager/ingest/connectors/gpu_runs.py`, `forager/config/gpu_models.json`, `forager/tests/test_gpu_runs.py`
- Modify: `forager/ingest/run.py`, `forager/ingest/record.py`, `forager/ingest/inspect.py`, `web/src/types.ts`, `web/src/lib/tb.ts`, `web/src/lib/fixtures.ts`, `web/vite.config.ts`, `web/src/lib/gpu.ts`, `web/src/lib/gpu.test.ts`, `web/src/views/GpuTab.tsx`, `web/src/App.tsx`
- Delete (Task 13 only): `gpu_fleet.datasource`, `gpu_billing.datasource`, `gpu_fleet_api.pipe`, `gpu_billing_api.pipe`, `connectors/fleet.py`, `connectors/gpu_billing.py`, `web/src/views/FleetTab.tsx`, `web/src/views/BillingTab.tsx`

---

### Task 1: gpu_runs datasource + pipe + month-split helper + validator

**Files:** create `tinybird/datasources/gpu_runs.datasource`, `tinybird/pipes/gpu_runs_api.pipe`, `ingest/connectors/gpu_runs.py`, `tests/test_gpu_runs.py`; modify `ingest/run.py` (validator only).

Datasource (house format, mirrors `gpu_billing.datasource` header/tokens):

```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `month` String        `json:$.month`,
    `vendor` String       `json:$.vendor`,
    `run_id` String       `json:$.run_id`,
    `deployment` String   `json:$.deployment`,
    `gpu` String          `json:$.gpu`,
    `gpu_count` UInt8     `json:$.gpu_count`,
    `started_at` String   `json:$.started_at`,
    `ended_at` String     `json:$.ended_at`,
    `hours` Nullable(Float64) `json:$.hours`,
    `cost` Float64        `json:$.cost`,
    `currency` String     `json:$.currency`,
    `model` String        `json:$.model`,
    `kind` String         `json:$.kind`,
    `source` String       `json:$.source`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "vendor, month, deployment"
```

Pipe `gpu_runs_api` mirrors `gpu_billing_api` (plain SELECT of all columns, `ORDER BY month DESC, vendor, deployment`, `TOKEN "treasury_web" READ`).

`gpu_runs.py` exports:

```python
def split_run_by_month(started_at, ended_at, cost, gpu_count=1):
    """Split a run [started_at, ended_at) (datetime) across calendar months.
    Returns list of (month:'YYYY-MM', hours_in_month:float, cost_in_month:float).
    Cost pro-rated by hours; last month gets the remainder so the
    per-run sum equals `cost` exactly (cents rounding on non-last parts).
    Raises ValueError if ended_at <= started_at."""
```

Validator in `run.py` next to the existing gpu_billing one: `_GPU_RUNS_ALLOWED_SOURCES = {"api", "cli", "manual"}`, kind in `{"gpu","serverless"}`, month `YYYY-MM`, vendor in CANONICAL, cost >= 0, hours None or >= 0, times '' or `YYYY-MM-DD HH:MM:SS`.

Tests (TDD, in `tests/test_gpu_runs.py`): single-month run; boundary-spanning run (io.net vmaas-b72b6c49: Dec 29 15:52:19 → Jan 25 15:56:43, $388.80 → Dec part + Jan part, parts sum EXACTLY to 388.80); three-month span; ended<=started raises; validator accept/reject cases.

Commit: `feat: add gpu_runs datasource, pipe, month-split helper`

### Task 2: model mapping config + stamp function

**Files:** create `config/gpu_models.json`; modify `ingest/connectors/gpu_runs.py`, `tests/test_gpu_runs.py`.

Port the deployment→model mapping currently hard-coded as `GPU_DEPLOYMENT_GROUPS` in `web/src/lib/gpu.ts` into `config/gpu_models.json` — read gpu.ts and translate faithfully (runpod zimage*/klein*/_storage groups; lambda GH200 shared → `ltx-2` (multi-model note in "note" field); vast → flux; modal serverless apps → flux-klein/klein/klein-large; io.net → flux/zimage). Shape:

```json
{ "runpod": [ {"match": "zimage", "model": "zimage", "kind": "gpu"}, ... ],
  "modal":  [ {"match": "", "model": "...", "kind": "serverless"} ] }
```

`match` = case-insensitive substring of deployment; first hit wins; no hit → `("", "gpu")`.

```python
def stamp(vendor, deployment): -> tuple[str, str]  # (model, kind)
```

Tests: each vendor's known deployment names resolve; unknown → `("", "gpu")`; modal always serverless.

Commit: `feat: gpu model mapping config + stamp`

### Task 3: runpod runs connector

**Files:** modify `ingest/connectors/gpu_runs.py`, `tests/test_gpu_runs.py`. Reuse the fixtures/patterns from `tests/test_gpu_billing.py` runpod section.

`runs_rows_runpod(secrets, months, http)` — same data sources as `gpu_billing.monthly_rows_runpod` (REST `billing/{pods,endpoints,networkvolumes}?bucketSize=month` for cost per (podId, month); GraphQL live-pod name resolution with key-in-URL sanitization preserved). Output row per (pod, month):

```python
{"month": m, "vendor": "runpod", "run_id": pod_id, "deployment": name_or_id,
 "gpu": "", "gpu_count": 1, "started_at": "", "ended_at": "",
 "hours": None, "cost": amt, "currency": "USD",
 "model": stamp(...)[0], "kind": kind, "source": "api"}
```

Live pods additionally provide `started_at` (and gpu type/count when the GraphQL payload has them) for their current-month row; dead pods keep `''`/None (explicit unknown, not fabricated). Keep `_serverless:<id>` (kind `serverless`) and `_storage` conventions.

Commit: `feat: runpod runs connector`

### Task 4: vast runs connector

**Files:** modify `ingest/connectors/gpu_runs.py`, `tests/test_gpu_runs.py`.

`runs_rows_vast(secrets, months, today, run_cmd)` — same invoice source as `gpu_billing.monthly_rows_vast` (reuse `vendors/vast.py` `_window`; do NOT reuse `_spread` — replace with `split_run_by_month` since invoices carry `timestamp` (end) + `quantity` (hours): started = ts − hours). Row per (instance, month) with real `started_at`/`ended_at`/`hours`, `run_id` = instance_id, `kind: "gpu"`. Charge-type rows only. Per-instance per-month sums must equal the old `monthly_rows_vast` totals (assert in test against the shared `_VAST_INVOICES` fixture: total 30.00 ± 0.02).

Commit: `feat: vast runs connector`

### Task 5: modal + lambda runs connectors

**Files:** modify `ingest/connectors/gpu_runs.py`, `tests/test_gpu_runs.py`.

- `runs_rows_modal(secrets, months, run_cmd)` — same `modal billing report --json` source as `monthly_rows_modal`; rows `kind:"serverless"`, `hours:None`, times `''`, `run_id` = app name. Env passing `{**os.environ, tokens}` preserved.
- **Lambda: manual-only, NO programmatic connector.** Verified 2026-07-08 against the live Lambda Cloud API (`GET /api/v1/instances`): the instance object exposes no launch/created/started timestamp (fields: id, name, status, instance_type, region, …) and no balance. Run-grain elapsed hours and cost therefore cannot be witnessed without fabricating a start time — forbidden by the no-fallback law. Lambda run/cost history comes entirely from manual `record gpu lambda …` entry off the weekly invoice PDFs (already the plan's "history stays manual"). Do NOT build `runs_rows_lambda`; do NOT emit zero-cost placeholder rows.

Tests: modal serverless shape (kind serverless, hours None, empty times, app name as run_id/deployment); modal per-app month totals equal `monthly_rows_modal` on the same fixture.

Commit: `feat: modal + lambda runs connectors`

### Task 6: refresh_gpu_runs + record + inspect

**Files:** modify `ingest/run.py`, `ingest/record.py`, `ingest/inspect.py`, tests (`test_gpu_runs.py`, extend `tests/test_record.py`).

- `refresh_gpu_runs(...)`: collect rows from the three programmatic connectors (runpod/vast/modal — lambda is manual-only, no connector) with per-vendor status on failure (sanitized); merge with existing table rows using the same semantics as `refresh_gpu_billing` (manual outranks api/cli per `(vendor, month, run_id)`, splice, guarded_replace). `--only runs` CLI flag; `--vendor` filter works. **Runway is NOT ported here** — `refresh_gpu_fleet` keeps producing the `gpu_runway:<vendor>` 🚨 alarm untouched until Task 13. Task 13 moves the runway probe into `refresh_gpu_runs` when it deletes the fleet DATASOURCE (fleet.py's snapshot functions survive as the balance/rate probe). This avoids double-probing during Tasks 6–12.
- `record gpu <vendor> <month> --deployment X --amount N` gains optional `--run-id` (default = deployment), `--gpu`, `--gpu-count`, `--started`, `--ended`, `--model`, `--kind`, `--currency`. When `--started`+`--ended` given WITHOUT month conflict, use `split_run_by_month` and emit ALL month rows in one command (month arg then acts as a guard: error if the split produces no row for it). Writes to gpu_runs, `source:"manual"`.
- `inspect gpu_runs` registered.
- Keep `refresh_gpu_fleet`/`refresh_gpu_billing` and their flags untouched until Task 13 (cutover is one clean break there).

Commit: `feat: refresh_gpu_runs + record/inspect support`

### Task 7: Tinybird deploy + programmatic backfill

Controller task (not a subagent): `tb --cloud deploy --check --wait` then `tb --cloud deploy --wait` (additive only — gpu_runs + pipe; old datasources untouched). Backfill: `python3 -m ingest.run --only runs` (runpod + vast + modal + lambda). Verify with `inspect gpu_runs`: per vendor-month totals must equal the gpu_billing totals already verified (runpod 2026-06 = 981.34; vast 2026-03 = 4086.08; modal 2026-02 = 3197.80).

### Task 8: manual migration — io.net runs (with real times) + ovh months

Controller task. Re-record io.net at run grain (times from Elliot's ledger; `--started/--ended` auto-splits Dec/Jan/Feb; the 2025-12 parts are emitted too — fine, table holds them, web filters by year):

```
vmaas-6acf35ab  RTX 4090 x2  2025-12-29 15:49:41 → 2026-01-12 15:54:05  $201.60
vmaas-e2c905fc  RTX 4090 x2  2025-12-29 15:51:33 → 2026-01-12 15:56:08  $201.60
vmaas-b72b6c49  RTX 4090 x2  2025-12-29 15:52:19 → 2026-01-25 15:56:43  $388.80
vmaas-688fd0dc  RTX 4090 x2  2025-12-29 15:52:53 → 2026-01-25 15:59:29  $388.80
vmaas-41a7d908  RTX 4090 x2  2025-12-29 15:53:40 → 2026-01-25 16:00:14  $388.80
vmaas-22e58f05  RTX 4090 x2  2026-01-19 18:20:57 → 2026-02-01 18:23:13  $187.20
vmaas-41e2e564  RTX 4090 x2  2026-01-25 19:01:57 → 2026-01-29 19:06:23  $57.60
vmaas-46665737  RTX 4090 x2  2026-01-25 19:03:16 → 2026-01-29 19:09:40  $57.60
vmaas-8afc966b  RTX 4090 x2  2026-01-25 19:04:12 → 2026-01-29 19:10:35  $57.60
vmaas-d24ab335  L40      x8  2026-01-30 11:04:25 → 2026-02-01 11:04:30  $384.00
```

ovhcloud month-grain (no run detail): `record gpu ovhcloud 2026-01 --deployment "rtx5000-84,t2-le-90" --amount 1856.80 --currency EUR` and `... 2026-02 --amount 224.64 --currency EUR`. Verify io.net 2026-01 total ≈ $2045.59 equivalent minus Dec parts (recompute expected from split, don't force old numbers).

### Task 9: web plumbing + raw "GPU Runs" tab

**Files:** modify `web/src/types.ts` (GpuRunRow), `web/src/lib/tb.ts`, `web/src/lib/fixtures.ts`, `web/vite.config.ts` (READ_PIPES + `gpu_runs_api`), `web/src/App.tsx`, create `web/src/views/GpuRunsTab.tsx`. FleetTab/BillingTab stay until Task 13.

Raw tab = DataTable of gpu_runs verbatim (columns: month, vendor, run_id, deployment, gpu, gpu_count, started_at, ended_at, hours, cost, currency, model, kind, source), month-filter aware, explicit empty-notice when filter excludes all rows (same pattern as `fleetEmptyNotice`). Vendor cell uses the same vendor vocabulary/chips as EconTable.

Commit: `feat: gpu_runs web plumbing + raw tab`

### Task 10: gpu.ts derivation rework

**Files:** modify `web/src/lib/gpu.ts`, `web/src/lib/gpu.test.ts`.

`gpuEconomics(data, monthFilter)` consumes `data.gpuRuns` (not gpuBilling/gpuFleet). Keep the exact invariant structure that passed final review — port, don't rewrite:
- rent = witnessed provider bill per vendor-month (rentByMonth map); runs are allocation weights; Σ allocated == bill (remainder-to-last); drift flag >2% on max-cost row; dust fold <$10; billing-only months seeded; EUR via toUsd.
- Grouping: by `model` column from the rows (NOT by a frontend mapping — delete `GPU_DEPLOYMENT_GROUPS`). `model == ""` → explicit row `error: unmapped deployment <name>` (danger).
- Missing vendor bill → explicit error row (unchanged). No runs but bill exists → `error: no gpu runs this month — deployment split unavailable`.
- NEW per-GPU aggregation `gpuByType(data, monthFilter)`: group runs by `gpu` (`''` → "unknown GPU"), Σ hours (null-hours rows excluded from hours but included in cost with an `hours unknown` flag), cost, implied $/hr = cost/hours, distinct models list.
- Coverage/verdicts/requests joins unchanged (join on model vs pollen_monthly).
- `runwayChips` now reads statuses? NO — runway chips came from fleet rows. Rework: drop `fleetRunRate`/`runwayChips` fleet-row inputs; runway chips read the `gpu_runway:<vendor>` STATUS rows already loaded by the app for other status chips (look at how statuses reach the web app — the statuses table/pipe used by App header; wire from there). If statuses are not exposed to the web app, keep chips sourced from current-month running runs (`ended_at == ''`) for $/hr burn and DROP balance display with an explicit `balance: see forager statuses` hint — pick whichever the codebase supports without a new pipe, document choice in the task report.

Port all gpu.test.ts invariant tests to runs fixtures (Σ==bill exact with 3+ groups, drift pins to bill, multi-month isolation, dust fold, error states, serverless never idle-candidate, unmapped-model error row).

Commit: `feat: gpu economics derive from gpu_runs`

### Task 11: GpuTab insights UI rework

**Files:** modify `web/src/views/GpuTab.tsx` (+ its test if present).

Two sections per the approved wireframe: per-MODEL table (model, gpu cost, revenue retained, margin %, coverage, verdict, flags — column set as today minus deployment-group naming) and per-GPU table (gpu, hours, implied $/hr, cost, models). Header strip + runway chips + HeaderHints preserved; error/warning chips identical semantics (`flagIntent`).

Commit: `feat: GPU insights per-model + per-GPU views`

### Task 12: live verify (controller)

Dev server, screenshot GPU Runs raw tab + GPU insights for June and January. June per-model numbers must reproduce the verified figures (zimage ≈ $693.4, klein ≈ $144.8 keep, lambda explicit error/manual-gap state). January io.net rent $1,782.50 with drift flag vs run ledger (Jan portion). No console errors. Full suites green.

### Task 13: cutover + removal (GATED)

**Ask Elliot for fresh approval before the destructive Tinybird deploy.** Then:
- **Move the runway probe into `refresh_gpu_runs`**: port the `gpu_runway:<vendor>` computation (balance + $/hr burn, 🚨 <7d) from `refresh_gpu_fleet` — factor the runway loop into a shared `_runway_statuses(fleet_rows, statuses)` helper; `refresh_gpu_runs` calls `fleet.snapshot_all(secrets, now)` purely for balance/rate, computes statuses, writes NO datasource. Wrap in try/except so a live-probe failure only records a status and never breaks the runs refresh.
- **KEEP `connectors/fleet.py`'s snapshot functions** (they are now the runway balance/rate probe). Delete `connectors/gpu_billing.py`, `refresh_gpu_fleet` (the datasource-writing one), `refresh_gpu_billing`, `--only fleet|billing` flags, FleetTab.tsx, BillingTab.tsx, their App.tsx tab entries, types (GpuFleetRow, GpuBillingRow), fixtures, READ_PIPES entries, and the gpu_fleet + gpu_billing datasource+pipe files.
- `tb --cloud deploy --check --wait` then deploy with `--allow-destructive-operations` (approved), verify gpu_fleet/gpu_billing datasources gone and gpu_runs intact. Full suites + biome. Ledger PHASE COMPLETE.

Commit: `feat: remove gpu_fleet + gpu_billing (replaced by gpu_runs)`
