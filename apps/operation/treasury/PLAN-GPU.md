# PLAN — GPU economics (time-based cost lens)

Compute vendors split into two cost regimes. `request` vendors (APIs: bedrock,
vertex, fireworks, deepinfra, …) scale cost with usage — the existing
`economics()` math is correct and stays untouched. `gpu` vendors rent boxes
that bill by the hour whether requests arrive or not — their unit economics
invert: monthly rent is the given, and the questions are coverage (revenue on
the box ÷ rent), effective unit cost (rent ÷ units served), and break-even
volume. This plan adds that lens without forking the accounting: vendor totals
always reconcile to the witnessed bill (provider_monthly), never imputation.

GPU vendors: **runpod, lambda, vast.ai, ovhcloud, modal**.
Out of scope: AWS (never used for gen-AI GPU — Elliot 2026-07-08), scaleway
(zero servers in all 9 zones, nothing billed since Feb 2026, verified live).
Modal is the serverless hybrid: fleet rows only when containers run (usually
none, $0/hr idle); its meter is per-run so it behaves like `request` in
practice but belongs on the GPU tab as the migration target for underused
boxes.

## Live baseline (2026-07-08, for post-build verification)

| Vendor | Fleet | $/hr | ~$/mo | Balance |
|---|---|---|---|---|
| runpod | zimage-4090-secure 0.69 · klein-a5000-v4 0.27 · zimage-3090-a/c 0.22×2 (+disk) | 1.439 | 1,050 | $80.06 🚨 ~2.3d |
| lambda | GH200 96GB "Sana - LTX-2.3 - AceStep" 2.29 · A10 "bonsai" 1.29 | 3.58 | 2,613 | console-only; grant $7,500 − burn ≈ $1,579 left |
| vast.ai | 1× RTX 5090 (Flux) id 43575766 | 0.4278 | 312 | $225.43 ~22d |
| ovhcloud | legacy image 57.130.31.42 (inventory 403 with current key) | ~€0.09 | €68 | voucher €3,517.01 |
| modal | flux-klein, flux-klein-9b, ltx2-comfyui deployed; 0 containers | 0 | 0 | dashboard-only |

Total fixed run-rate ≈ $5.45/hr ≈ **$4,050/mo**.

## 1. Roster — `cost_basis` in `config/vendor_aliases.json`

Add `"cost_basis": "gpu"` to runpod, lambda, vast.ai, ovhcloud, modal. Absent
= `request` (no churn on the other ~60 entries). The web app already imports
the roster at build time (`vendor-vocabulary.ts`); expose `costBasis(vendor)`
there.

## 2. Datasource — `gpu_fleet.datasource` (append-only)

One row per running pod/instance per snapshot. Forager appends a snapshot
every run; history accumulates (that's the point — rent allocation and the
runway story need the timeline).

```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `recorded_at` DateTime      `json:$.recorded_at`,
    `vendor` String             `json:$.vendor`,
    `deployment` String         `json:$.deployment`,   -- pod/instance name as the provider reports it
    `gpu` String                `json:$.gpu`,          -- display name, e.g. "RTX 4090", "GH200 96GB"
    `gpu_count` UInt8           `json:$.gpu_count`,
    `usd_per_hr` Float64        `json:$.usd_per_hr`,
    `balance_usd` Nullable(Float64) `json:$.balance_usd`  -- vendor prepaid balance at recorded_at; repeated per row; null where unqueryable (lambda, modal, ovh)

ENGINE "MergeTree"
ENGINE_SORTING_KEY "vendor, recorded_at"
```

`balance_usd` is a vendor-level raw fact denormalized onto the vendor's rows
(same pattern-of-least-tables as grants' label). A vendor snapshot with zero
running instances but a queryable balance appends one row with
`deployment=''`, `usd_per_hr=0` so the balance timeline never gaps.

## 3. Pipe — `gpu_fleet_api.pipe`

Raw mirror, full history (the web derives "latest snapshot" and monthly $/hr
shares client-side, same as every other insight):

```
TOKEN "treasury_web" READ

NODE endpoint
SQL >
    SELECT formatDateTime(recorded_at, '%F %T') AS recorded_at,
           vendor, deployment, gpu, gpu_count, usd_per_hr, balance_usd
    FROM gpu_fleet
    ORDER BY recorded_at DESC, vendor, deployment
```

Add to vite READ_PIPES allowlist (forgetting this 404s — recurring trap).

## 4. Forager — fleet connectors

New `ingest/connectors/fleet.py` with one `snapshot_<vendor>()` per provider,
returning row dicts; `--only fleet` scope in run.py; failures per vendor are
recorded in statuses and skip that vendor (never block the run). Creds all
exist in forager SOPS env.json already (verified live 2026-07-08).

- **runpod** — GraphQL `POST https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY`
  (key in URL, not header) `{ myself { clientBalance currentSpendPerHr pods {
  name desiredStatus costPerHr gpuCount machine { gpuDisplayName } } } }`.
  Rows = running pods; balance_usd = clientBalance. Sum(pods.costPerHr) <
  currentSpendPerHr (delta = disk) — record pods as-is, plus the delta as
  deployment `_storage` so the vendor sum matches the account burn.
- **lambda** — `curl -u "$LAMBDA_LABS_API_KEY:" https://cloud.lambdalabs.com/api/v1/instances`
  + `/instance-types` for price_cents_per_hour. No balance endpoint (null).
- **vast.ai** — `GET https://console.vast.ai/api/v0/instances/` +
  `/users/current/` (`.credit` → balance_usd). Bearer auth.
- **modal** — `modal container list --json` with MODAL_TOKEN_ID/SECRET env;
  usually zero rows → single `deployment=''` row is NOT emitted (no balance
  API either), so modal contributes rows only when something runs.
- **ovhcloud** — inventory blocked: consumer key is scoped to `/me/credit`
  only; `/cloud/project/*` 403s. Until Elliot mints a broader key
  (`GET /cloud/project/*`), ovh contributes no fleet rows — the GPU tab shows
  it from provider_monthly + voucher only, with a "no fleet visibility" flag.

## 5. Pollen — `requests` column on `pollen_monthly`

**Only successful, non-cached requests count** (Elliot 2026-07-08): cached
hits may be *billed* (they stay in the price/cost sums) but never touch a
GPU, so they are excluded from served volume.

`connectors/usage.py` `_SQL` gains one aggregate inside the existing WHERE
(which already enforces `environment='production'`, `is_billed_usage=true`,
`response_status` 2xx):

```sql
countIf(cache_hit = false) AS requests,
```

(`cache_hit Bool` exists on generation_event — verified in
`enter.pollinations.ai/observability/datasources/generation_event.datasource:109`.)

Single total column — no paid/quest split, no `_other` machinery (counts
don't participate in `_split_other`). Datasource change: add
`requests UInt64 json:$.requests DEFAULT 0` to `pollen_monthly.datasource` —
forward-query, additive, non-destructive. Full pollen re-pull backfills all
months in one run.

## 6. Web — model→deployment mapping (`web/src/lib/gpu.ts`)

Hardcoded, same precedent as `INTERNAL_VENDORS`; promote to a table only if
it churns. Deployment-name substring (lowercased) → model slugs:

```ts
const GPU_DEPLOYMENTS = [
  { vendor: "runpod",  match: "zimage", models: ["zimage"] },
  { vendor: "runpod",  match: "klein",  models: ["klein"] },
  { vendor: "lambda",  match: "gh200|sana|ltx", models: ["ltx-2", "acestep", "sana"] },
  { vendor: "vast.ai", match: "",       models: ["flux"] },       // whole vendor
  { vendor: "ovhcloud",match: "",       models: [] },  // fill at build time from pollen_monthly's ovhcloud model slugs (legacy image)
]
```

Unmatched fleet deployments render with an amber `unmapped` chip (the
unmatched-vendor pattern) — visible, never silently dropped.

## 7. Web — GPU insights tab

New tab in Insights next to Models (`views/GpuTab.tsx`, derivation in
`lib/gpu.ts`), month-scoped by the global period filter.

Header strip: fleet run-rate $/hr and $/mo from the latest snapshot; runway
chips per vendor — runpod/vast from `balance_usd ÷ 24·$/hr` (red < 7d, amber
< 21d), lambda from grant − Σ provider credit burn (grants + provider planes,
both already loaded), ovh voucher from provider plane.

Table, one row per deployment group × month:

```
Deployment      Vendor   Rent $/mo  Models         Req      Paid ℗  Quest ℗  Coverage  Eff $/req  Reg price   Break-even  Verdict
GH200 (shared)  lambda       1,672  ltx-2,ace,sana  18.4k    2,105    1,890     114% ✓    $0.0041   $0.005/s      334k s    keep
zimage ×3       runpod         825  zimage         412.0k    1,120      640      49% ✗    $0.0011   $0.002/img   412k img   raise?
```

Math per deployment group d of vendor v in month m:

- **rent(d,m)** = provider_monthly actual (credit+paid, toUsd) for (v,m) ×
  d's share of Σ usd_per_hr over v's snapshots within m (mean of per-snapshot
  shares). One deployment → 100%. No snapshots in m (history predates the
  table) → vendor-level row only, no per-deployment split.
- **Req / Paid ℗ / Quest ℗** = Σ pollen_monthly requests / price_paid /
  price_quests over d's mapped models. Shared-box note: GH200's rent splits
  across its models by metered-pollen share when a per-model view is needed;
  the tab's primary grain is the deployment.
- **Coverage** = retained paid (price_paid − byop_paid − model_paid) ×
  netRatio(m) ÷ rent. The literal "does money in pay this box's rent"; quest
  ℗ sits beside it so free usage occupying the box stays visible.
- **Eff $/req** = rent ÷ requests (true unit cost; served = non-cached 2xx).
- **Break-even vol** = rent ÷ (registry unit price × netRatio) — registry
  unit prices ship as a small hardcoded map in gpu.ts (zimage 0.002/img,
  klein 0.01/img, ltx-2 0.005/s — from shared/registry/image.ts; no registry
  ingestion this phase, same ruling as PLAN-INSIGHTS). Single-model
  deployments show it on the row; shared boxes (GH200) show it per model in
  the expanded sub-rows (units differ — seconds vs images — so a blended
  number would be meaningless).
- **Verdict** = keep (coverage ≥ 110%) / raise? (below) / idle-candidate
  (coverage < 40% → note "consider modal", which sits at $0 idle).

Missing plane → "–", never $0 (house law). ErrorBoundary as elsewhere.

Raw section gains a **Fleet** tab mirroring `gpu_fleet_api` 1:1 (mirror law),
newest first, vendor filter.

Models/Vendors tabs: rows whose vendor has `cost_basis: "gpu"` get a quiet
`gpu` chip (tooltip: "time-based vendor — per-request margin here is
allocation; see GPU tab"). No math changes there.

## 8. Forager — runway in statuses

After the fleet snapshot, statuses gain `gpu_runway` entries per vendor with
a balance: `runpod $80.06 · 1.439/hr · ~2.3d` and the run output prints a 🚨
line when < 7 days. (The $80 situation would have been flagged days earlier.)

## 9. Build order

1. Roster `cost_basis` + web chip (no deploy).
2. `gpu_fleet` datasource + pipe + fleet connectors + `--only fleet` +
   statuses runway. Deploy: additive, staging first, prod on Elliot's go.
3. `requests` on pollen_monthly (datasource + usage.py + full pollen
   re-pull). Deploy: additive forward-query, same gate.
4. Raw Fleet tab + GPU insights tab + gpu.ts derivations + tests.
5. Verify against the live-baseline table above + spot-check vendor rent sums
   == provider_monthly to the cent.

Tests: hermetic fixtures per fleet connector (recorded JSON shapes from the
2026-07-08 live run); gpu.ts allocation invariants (deployment rents sum to
vendor actual; requests exclude nothing the fixture didn't mark cached);
usage.py SQL snapshot test updated for the new aggregate.

## Open / flagged

- **RunPod top-up needed now** (independent of this plan): $80.06 ≈ 2.3 days.
- Vast top-up ~3 weeks.
- OVH broader consumer key (add `GET /cloud/project/*`) to make inventory
  auditable.
- Lambda balance stays console-only (architectural); grant-minus-burn is the
  proxy, drift visible via the weekly-invoice witness.
