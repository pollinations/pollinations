# OVH regime split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Split OVH's mixed provider bill into GPU / inference / infra using the existing `category` field (new value `compute-gpu`), so `gpuEconomics` witnesses OVH's GPU-rent slice and OVH re-enters per-model margin. Fix the €200 understatement by switching OVH to invoice-based manual rows.

**Architecture:** No new column, no schema/pipe deploy. `provider_monthly.category` gains value `compute-gpu`, written AT INGEST (Tinybird `FORWARD_QUERY` is migration-only, verified 2026-07-08 — appended rows take category from the payload). `_mrow` category is set by the connectors (cloudflare→infra, aws per-service); the provider refresh remaps GPU-basis vendors' default `compute` rows → `compute-gpu` using the existing `aliases.GPU_VENDORS` frozenset. OVH `provider_monthly` becomes manual/invoice-based (connector dropped); its manual rows carry explicit categories (compute-gpu / compute / infra). Re-running the provider refresh rewrites stored rows (guarded_replace — no deploy). `gpuEconomics` witnesses `category=='compute-gpu'` provider rows (replacing the hardcoded GPU_VENDORS web list). OVH's `gpu_runs` re-recorded as the 4 real instances.

## Status 2026-07-08

- R1/R3 code is committed:
  - `692e6379cb` — `provider_monthly` compute-gpu category for GPU vendors; OVH manual-only.
  - `790a64dd97` — `gpuEconomics` witnesses the `compute-gpu` provider slice.
- R4 live data correction completed in `operations.provider_monthly`.
  - Backup: `~/Documents/treasury-backups/20260708T203022Z/provider_monthly.ndjson`.
  - Replaced old OVH API/manual workaround rows with Jan-May invoice split.
  - Retagged existing GPU-basis vendor rows from `compute` to `compute-gpu`.
  - OVH invoice totals now match: Jan EUR 2542.75, Feb EUR 896.80, Mar EUR 766.81, Apr EUR 1059.81, May EUR 1021.61.
- R5 live data correction completed in `operations.gpu_runs`.
  - Backup: `~/Documents/treasury-backups/20260708T203211Z/gpu_runs.ndjson`.
  - Replaced lump run IDs `ovh-gpu-2026-01` and `ovh-gpu-2026-02`.
  - Added four invoice line-item rows: Jan `rtx5000-84 gra9`, Jan `t2-le-90 de1`, Jan `t2-le-90 uk1`, Feb `rtx5000-84 gra9`.
  - OVH `gpu_runs` totals now match the GPU slice: Jan EUR 1856.80 / 1466 hours, Feb EUR 224.64 / 208 hours.

## Global Constraints
- **No fallbacks — error loudly.** Unchanged from the gpu_runs phase.
- **Σ rentUsd == witnessed bill exactly** — the witness is now the `compute-gpu` provider slice. Allocation invariants unchanged.
- Only `isInfraRow` (`category==='infra'`) consumes `provider_monthly.category`; `compute-gpu` is non-infra (compute-like) everywhere. The `=== "compute"` checks in insights.ts (646, 736) are on the TRANSACTIONS plane — do NOT touch them.
- GPU-basis vendors = vendor_aliases.json `cost_basis === "gpu"`: runpod, lambda, vast.ai, modal, io.net.
- Tinybird: operations workspace, `--check` before deploy, additive where possible; the FORWARD_QUERY change is non-destructive (re-derives on read). Never `--allow-destructive-operations` without fresh approval.
- OVH GPU model stays UNMAPPED (Elliot's call 2026-07-08) — OVH shows as `(unmapped)` in per-model margin until he names it. Per-GPU + raw views show it fully.

---

### Task R1: provider_monthly writes compute-gpu at ingest + record + OVH manual-only

**Files:** `apps/operation/forager/ingest/connectors/vendors/__init__.py`, `apps/operation/forager/ingest/run.py`, `apps/operation/forager/ingest/record.py` (+ tests). NO .datasource / Tinybird deploy — category is written at ingest (FORWARD_QUERY is migration-only, verified).

- `connectors/vendors/__init__.py`: add `"compute-gpu"` to `ALLOWED_CATEGORIES` (currently `{"compute","infra"}`).
- `run.py` `refresh_provider_monthly`: after `merge_meter_rows` (before validate/write), remap category: for each merged row, `if row["vendor"] in GPU_VENDORS and row["category"] == "compute": row["category"] = "compute-gpu"`. Import `GPU_VENDORS` from `.aliases` (the existing `cost_basis=='gpu'` frozenset = runpod/lambda/modal/vast.ai/io.net). This leaves manual/explicit categories (cloudflare infra, aws per-service split, OVH manual) untouched — GPU vendors are pure compute so the default `compute` unambiguously means GPU rent.
- `run.py` `refresh_provider_monthly`: remove `ovhcloud` from the connector/meter list so OVH is NOT auto-fetched (the credit-burn lump understated by €200). OVH `provider_monthly` becomes manual-only. Existing manual-outranks + manual-row-loss-guard already protect manual rows. Confirm no other path re-adds ovh.
- `record.py`: add `"compute-gpu"` to the `mp` provider subcommand `--category` choices (currently `["compute","infra"]`).
- Tests: a GPU-vendor row (runpod, default compute) is written as `compute-gpu` after the remap; cloudflare stays `infra`; aws split untouched; `record provider --category compute-gpu` accepted; the ovh connector is not invoked by refresh_provider_monthly (assert via injected connectors map).

Commit: `feat: provider_monthly compute-gpu category for gpu vendors; OVH manual-only`

*(R2 folded into R1.)*

### Task R3: gpuEconomics witnesses compute-gpu rows

**Files:** `apps/operation/treasury/web/src/lib/gpu.ts`, `gpu.test.ts`.

Rework `gpuEconomics` vendor/rent selection: the GPU-rent witness per (vendor, month) = Σ `toUsd(credit+paid)` over `providerMonthly` rows with `category === "compute-gpu"` (was: `!isInfraRow` compute rows for GPU_VENDORS). Iterate vendors that have EITHER a `compute-gpu` provider row OR a gpu_runs row in the filter (so OVH — compute-gpu provider + gpu_runs — is included; pure-GPU vendors unchanged since their rows now derive to compute-gpu). Everything else (multi-model split, Σ==bill remainder, drift, error flags, gpuByType) unchanged. Remove the `GPU_VENDORS` import if now unused.

Tests: a vendor with a `compute-gpu` provider row is witnessed; a `compute` (non-gpu) provider row is NOT a GPU rent witness; OVH (compute-gpu provider + gpu_runs, model "") → appears with rent from the compute-gpu slice + `(unmapped)` model row; Σ==bill still exact. Keep all existing gpuEconomics invariant tests (retarget fixtures to use `category: "compute-gpu"`).

Commit: `feat: gpuEconomics witnesses compute-gpu provider slice`

### Task R4: controller — record OVH invoice-based provider rows

Controller task. From `_local/2026-07-01-spend-audit/ovh-invoice-reconciliation.md`, record OVH `provider_monthly` rows (EUR, source=manual) per month:
```
Jan: compute-gpu 1856.80 · compute 684.20 · infra 1.75
Feb: compute-gpu 224.64  · compute 624.33 · infra 47.83
Mar: compute 711.01 · infra 55.80
Apr: compute 1002.43 · infra 57.38
May: compute 962.32 · infra 59.29
```
via `record provider ovhcloud <month> --currency EUR --credit <amt> --category <cat>` (credit-funded; paid 0 — all voucher-offset). Verify OVH provider total per month equals the invoice total (Jan €2542.75, etc.) and that the old connector lump is gone. NOTE: the record `mp` subcommand writes one row per (vendor,month,currency,category) — confirm multiple categories per month coexist (grain includes category via the merge key; if not, adjust the provider merge key to include category in R2).

### Task R5: controller — re-record OVH gpu_runs as real instances

Controller task. Replace the 2 OVH lump gpu_runs rows (`ovh-gpu-2026-01`, `ovh-gpu-2026-02`) with the 4 real instances (model unmapped per Elliot):
```
Jan rtx5000-84 : 940h €1015.20 (2026-01-03 00:00 → 2026-01-31 00:00 approx from invoice window)
Jan t2-le-90-de1: 263h €420.80 (2026-01-03 → 2026-01-14)
Jan t2-le-90-uk1: 263h €420.80 (2026-01-03 → 2026-01-14)
Feb rtx5000-84 : 208h €224.64 (2026-02-01 → 2026-02-09)
```
Because gpu_runs is append-only and the lump run_ids differ from the instance run_ids, a one-off `ops_replace` on gpu_runs is needed to DROP the 2 lumps while adding the 4 instances (record alone would double-count). Write a small controller script: read current gpu_runs, drop rows where run_id IN (ovh-gpu-2026-01, ovh-gpu-2026-02), add the 4 instance rows (via `record gpu` semantics / split_run_rows for hours), guarded_replace. Verify OVH gpu_runs Jan total €1856.80, Feb €224.64 (unchanged), now across 4 rows with real hours.

### Task R6: controller — deploy + live verify

No Tinybird schema deploy is needed for this phase. Live-verify: OVH appears in per-model GPU margin with rent = €1856.80 GPU slice (Jan), `(unmapped)` model row; per-GPU view shows OVH's rtx5000-84/t2-le-90 with hours + $/hr; runpod/etc. unaffected (still witnessed via compute-gpu). Full web + forager suites green. Ledger PHASE COMPLETE.
