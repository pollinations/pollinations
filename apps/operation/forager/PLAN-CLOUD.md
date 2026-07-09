# Cloud Raw Architecture Plan

## Goal

Rebuild the raw operations data model around three clear planes:

- `op_transactions` — all Wise bank movements, in and out, categorized at
  company level.
- `op_cloud` — technical cloud/provider usage, cost, and credit facts from
  provider dashboards, invoices, APIs, CLIs, BigQuery exports, PDFs,
  screenshots, and manual audit work.
- `op_pollen` — product consumption measured by us in Pollen, where `1p = $1`.
  Request counts are split into paid and quest usage, matching the paid/quest
  money split.

The `op_` prefix means Operations. It keeps the new raw business datasources
and pipes grouped together when they later live beside product/observability
datasources in the main Pollinations Tinybird workspace. Forager remains the
collection and validation tool; it should not own the datasource namespace.

Revenue is part of `op_transactions` in the first iteration. Positive Wise rows
are categorized as `revenue`; negative Wise rows are categorized as spend.
Stripe can be added later if we need detail beyond Wise, such as gross revenue,
fees, refunds, or payout timing analysis.

Cloud grants and provider credit awards are part of `op_cloud`: they are positive
credit events with evidence. There is no separate raw grants datasource in the
target architecture.

## Raw Cloud Principle

`op_cloud` is the complete technical cloud/provider usage ledger.

Each row is one provider usage fact over a service period. Monthly reports are
derived from `start` and `end`; raw rows should not require a hand-picked
`month`.

There is no separate concept of "monthly row" vs "detail row" in the raw data.
Every row is a usage row. Some rows cover a whole month because that is the
provider fact we have; other rows cover seven days or a single resource because
the provider gives that level of detail.

## Raw Transactions Principle

`op_transactions` is the cash movement ledger from Wise.

The current old `transactions` table only keeps outgoing Wise movements because
the old revenue witness was Stripe. The new raw model changes that: Wise is the
first-iteration cash source of truth for both money in and money out.

Rules:

- Keep all settled Wise movements that affect cash, both inflows and outflows.
- Use signed amounts: money in is positive, money out is negative.
- Positive Wise rows are categorized as `revenue` by default.
- Negative Wise rows keep company spend categories: `cloud`, `saas`,
  `office`, `admin`, and `payroll`.
- Stripe `revenue_monthly` is retired for the first raw architecture. Stripe can
  be reintroduced later as a detail source if we need gross/fees/refunds or
  payment-provider reconciliation beyond Wise cash movement.
- Refunds and reversals should stay visible as signed cash movements unless
  they are pure duplicate/cancelled Wise activity that does not affect cash.

## Tinybird Naming

Use the same prefix for datasources, pipes, tokens, and migration helpers:

| Object | Name |
| --- | --- |
| Transactions datasource | `op_transactions` |
| Cloud datasource | `op_cloud` |
| Pollen datasource | `op_pollen` |
| Transactions read pipe | `op_transactions_api` |
| Cloud read pipe | `op_cloud_api` |
| Pollen read pipe | `op_pollen_api` |
| Ingest token | current `treasury_ingest` during migration; optional future `op_ingest` after secrets rotate |
| Web read token | current `treasury_web` during migration; optional future `op_web` after secrets rotate |

Rules:

- Tinybird object names use lowercase snake case: `op_cloud`, not `OP_Cloud`.
- `op_` is the stable business namespace. Avoid `forager_` because Forager is
  one implementation of the collection workflow, not the data domain.
- Old unprefixed objects stay in place during migration. New frontend and
  insight reads should move to prefixed objects only.

## Proposed `op_cloud` Fields

| Field | Description |
| --- | --- |
| `source` | How the row was obtained: `api`, `cli`, `bq`, or `manual`. |
| `vendor` | Canonical vendor slug, e.g. `runpod`, `ovhcloud`, `lambda`, `openai`. |
| `type` | Usage type: `inference`, `gpu`, or `infrastructure`. |
| `start` | Start of the service/usage period, stored as UTC `YYYY-MM-DD HH:MM:SS`. |
| `end` | End of the service/usage period, preferably exclusive, stored as UTC `YYYY-MM-DD HH:MM:SS` when known. |
| `credit` | Signed credit movement for this cloud fact. Credit burn is negative. Credit received, granted, or activated is positive. |
| `paid` | Signed cash/prepaid movement for this usage fact. Normal spend is negative; refunds/adjustments can be positive. |
| `currency` | Currency code for `credit` and `paid`, e.g. `USD`, `EUR`. |
| `resource_id` | Provider-specific ID if available: pod ID, endpoint ID, storage volume ID, instance ID, invoice line ID. Blank if unavailable. |
| `resource_name` | Human-readable resource/deployment name if available. |
| `sku` | Provider SKU/product/hardware label, e.g. `RTX 4090`, `gpu_1x_gh200`, `100GB`, `Serverless Inference AI`. |
| `model` | Model or comma-separated models served by this resource. Blank if unknown or not applicable. |
| `evidence` | Optional evidence/reference text. Required for `source = manual`; optional for `api`, `cli`, and `bq`. Can contain one file, multiple files, a folder, an invoice/export reference, a dashboard note, a CLI/API description, or any short explanation needed to understand the hardcoded fact. |
| `recorded_at` | When this row was written to Tinybird. Audit metadata only. |

Rules:

- `credit + paid` is the signed row total. There is no separate `amount` field.
- Normal usage/spend rows are negative from our perspective. Positive rows are
  refunds, adjustments, provider statement credits, or grant/credit activation
  events.
- `start` and `end` describe the usage/service period, not the invoice issue
  date. They are normalized to UTC. If a source gives a local timezone or
  offset, convert it before writing. If a source gives a naive timestamp, treat
  it as UTC only when the provider/export explicitly uses UTC or the evidence
  says so.
- `type` is always one of `inference`, `gpu`, or `infrastructure`.
- No `notes` or review-comment columns. Explanations live in `evidence`, the
  evidence file, or the connector guide.
- No generated row ID for now. Replacement/dedup can use a natural key from
  `vendor`, `type`, `start`, `end`, `resource_id`, `resource_name`, `sku`,
  `model`, `source`, and `currency`.

## Type Definitions

- `inference` — API/model/serverless inference usage we buy by request, token,
  endpoint, image, second, or provider billing unit. Examples: OpenAI,
  Replicate, Modal, RunPod endpoints, OVH Serverless Inference AI.
- `gpu` — rented GPU machines/capacity. Examples: RunPod pods, Vast instances,
  Lambda GPU instances, IO.NET rented GPUs, OVH GPU servers.
- `infrastructure` — technical infrastructure not directly model inference or
  rented GPU capacity. Examples: VPS, storage, RunPod network volumes, network,
  Cloudflare infrastructure.

## Evidence

Manual/hardcoded rows must carry evidence. Programmatic rows (`api`, `cli`,
`bq`) may leave evidence blank or use a short source description when useful.

Evidence is intentionally flexible. It may be:

- one local invoice/PDF path
- multiple invoice/PDF paths
- a screenshot folder
- a CSV/dashboard export
- a manual audit markdown
- a provider invoice/export identifier
- a short API/CLI/BQ extraction description
- any compact explanation needed to justify a hardcoded/manual value

For now, evidence can be a compact reference or explanation: a raw invoice,
PDF, screenshot folder, CSV export, manual audit file, CLI/API/BQ extraction
description, or short text. Later, an agent can create normalized same-name
markdown summaries next to raw invoice/export files and rows can reference
those summaries.

## New Datasource Work

1. Create additive Tinybird datasources `op_cloud`, `op_transactions`, and
   `op_pollen`.
2. Create read pipes `op_cloud_api`, `op_transactions_api`, and
   `op_pollen_api`.
3. Keep current tables while building and validating the new datasource:
   - `provider_monthly`
   - `gpu_runs`
   - `pollen_monthly`
   - `transactions`
   - `revenue_monthly`
   - `grants`
4. Build a migration script that reads existing `provider_monthly` and
   `gpu_runs`, converts them to `op_cloud`, and writes to the new datasource.
5. Verify transformed totals against the old tables before any frontend switch.
6. Build `op_transactions` from Wise with both positive and negative cash
   movements retained.
7. Convert existing grants into positive `op_cloud.credit` rows.

## Current Implementation Status

As of 2026-07-09, the additive `op_` Tinybird objects are deployed in the
Operations workspace. Deployment #47 added only new datasources/endpoints and
additive token permissions; no old datasources were modified or removed.

Initial population wrote:

- `op_cloud`: 450 rows
- `op_transactions`: 295 rows
- `op_pollen`: 853 rows

Backup before the population write:
`/Users/comsom/Documents/treasury-backups/20260708T230750Z`

Known construction comments after the first population:

- `op_transactions`: 11 rows with unmatched Wise vendors
- `op_cloud`: 152 rows with migration review comments, mostly legacy manual
  rows that still need stronger evidence references before final cleanup

## Migration From Existing Tables

### From `provider_monthly`

Existing rows map to `op_cloud` rows:

- `category = compute` -> `type = inference`
- `category = compute-gpu` -> `type = gpu`
- `category = infra` -> `type = infrastructure`

If a `compute-gpu` provider aggregate overlaps a detailed `gpu_runs` row for
the same `vendor`, `month`, and `currency`, the detailed `gpu_runs` rows win
and the aggregate provider row is skipped. The goal is one cloud ledger without
double-counting the same GPU spend.

For each existing monthly row:

- `start = YYYY-MM-01 00:00:00`
- `end = first day of next month at 00:00:00`
- both are UTC boundaries
- `currency`, `vendor`, `source` copy through
- existing positive `credit` and `paid` spend values are converted to signed
  `op_cloud` usage values
- technical fields are blank unless known from manual evidence
- `evidence` is required for manual rows and optional for programmatic rows

### From `gpu_runs`

Existing rows map to `op_cloud` rows:

- old `kind = serverless` -> `type = inference`
- rented GPU rows -> `type = gpu`
- storage/network-volume rows -> `type = infrastructure`

For rows with `started_at` and `ended_at`, use those as `start` and `end`.
For provider rows that only have a month, use the month boundary.

Map fields:

- `run_id` -> `resource_id`
- `deployment` -> `resource_name`
- `gpu` -> `sku`
- `model` -> `model`
- `cost` becomes signed spend in `paid` unless the evidence proves the usage was
  credit-funded. Credit-funded usage becomes signed spend in `credit`.

### From `grants`

Existing grant rows become positive `op_cloud` credit events:

- `vendor` copies through
- `start` comes from the grant start date
- `end` comes from the grant expiry date when known, otherwise blank or a
  standard no-expiry sentinel chosen during schema implementation
- date-only grant fields are stored as UTC midnight
- `credit` is positive
- `paid = 0`
- `currency` copies through
- `type` should be `inference`, `gpu`, or `infrastructure` when known from the
  program/evidence; otherwise the agent must classify it during migration
- `evidence` should identify the grant program, activation, email, invoice, or
  dashboard fact that proves the credit

### From Wise / `transactions`

Wise remains the cash movement source of truth.

For the first iteration:

- current old `transactions` rows migrate as signed negative spend rows in
  `op_transactions`
- Wise positive rows that old ingestion skipped are added as signed positive
  `op_transactions` rows
- positive Wise rows are categorized as `revenue` by default
- negative Wise rows keep spend categories
- Stripe `revenue_monthly` is not required for the first raw architecture

### From `pollen_monthly`

Existing rows map to `op_pollen` rows.

The old table has one `requests` total. The new `op_pollen` keeps that total
and adds `requests_paid` and `requests_quests`, matching the paid/quest money
split. The migration pull reads the production Tinybird usage source directly
and fills the request split from `selected_meter_slug` (`pack` -> paid,
`tier` -> quests).

## Frontend Migration

1. Add `op_cloud_api` to the frontend data loader.
2. Build raw Cloud tab from `op_cloud`.
3. Rebuild current Provider raw view as a derived monthly grouping of
   `op_cloud`.
4. Rebuild current GPU Runs raw view as a filtered/detail view of
   `op_cloud` where `type = gpu` plus any inference rows needed for audit.
5. Update insights to read `op_cloud` instead of `provider_monthly` and
   `gpu_runs`.
6. Keep old tabs available during validation.
7. Delete old raw tabs only after the new Cloud raw view and all insights match
   the old totals.

## Forager Simplification

The new model should reduce connector complexity.

Forager should stop being a place where many provider-specific scripts silently
move values around. Instead:

- Provider-specific instructions live in connector guides.
- An AI agent reads those guides, collects the required evidence, extracts the
  rows, shows the planned rows to the human, then writes through one controlled
  input path.
- The input path validates and formats rows. It does not invent business logic.
- Bad data is refused with a clear validation error.
- No automatic writes without human/agent review.

The deterministic pipeline remains responsible for:

- schema validation
- vendor vocabulary validation
- allowed `type` validation
- allowed `source` validation
- date format validation
- credit/paid numeric validation
- requiring evidence for manual rows
- natural-key duplicate checks where possible
- total reconciliation checks when a batch includes a known invoice total
- Tinybird append/replace mechanics

The agent remains responsible for:

- reading screenshots, PDFs, CSVs, CLI/API output, and dashboards
- applying provider-specific extraction instructions
- asking the human for missing evidence
- explaining proposed rows before write
- linking manual/hardcoded rows to evidence
- replacing earlier rows through the same validated path when a correction is
  needed

## Connector Guides

Each cloud provider should eventually have a guide, not a complex autonomous
writer.

Guide contents:

- where the dashboard/API/CLI/export lives
- what date range to select
- what columns/screenshots are needed
- how to split `inference`, `gpu`, and `infrastructure`
- known limitations
- required secrets or local CLI setup
- evidence files expected from the human
- checks to run before writing

The guide is promptable operational knowledge. The write path is still one
validated `op_cloud` input pipeline.

## Current Input Path

`python3 -m ingest.record op-cloud ...` is the reviewed input path for new
cloud facts. It appends only to `op_cloud`, validates the canonical vendor,
allowed `type`, allowed `source`, date format, currency, signed amounts, and
requires evidence for `source = manual`.

The old `provider`, `gpu`, and `grant` record commands stay available only for
legacy reconciliation while the old raw tabs still exist. New cloud evidence
from dashboards, invoices, screenshots, CLI, API, or BigQuery should be shaped
into `op_cloud` rows instead of adding provider-specific business logic to the
legacy connectors.

## Current Reconciliation Path

`python3 -m ingest.op_reconcile` is the read-only check between the expected
`op_*` rows and the live `op_*` Tinybird tables.

It:

- rebuilds expected rows through the same migration logic used by
  `ingest.op_migrate`
- reads live `op_cloud`, `op_transactions`, and `op_pollen`
- aggregates by month/vendor/type/currency or equivalent table keys
- reports row-count, group-count, and total mismatches
- never writes, replaces, or repairs data

Useful scoped run:

```bash
python3 -m ingest.op_reconcile --month 2026-07
```

Current first reconciliation result: `op_cloud` and `op_transactions` matched
exactly. `op_pollen` had July-only mismatches because production usage continued
moving after the first `op_pollen` population.

## Current Scoped Refresh Path

`python3 -m ingest.op_refresh pollen --month YYYY-MM --write` refreshes one
`op_pollen` month from production usage. It snapshots `op_pollen` first, then
uses a Tinybird replace condition for only the requested month.

This exists because the open product-usage month is still changing. Closed
months should reconcile without needing repeated refreshes.

## Corrections

Tinybird rows should not be hand-edited ad hoc.

A correction means:

1. Identify the old row or rows by their natural key fields.
2. Build corrected replacement rows.
3. Validate the replacement batch.
4. Show the human the before/after diff.
5. Replace through the controlled pipeline.

Without an explicit `row_id`, the natural key is built from stable fields:
`vendor`, `type`, `start`, `end`, `resource_id`, `resource_name`, `sku`,
`model`, `source`, and `currency`.

If the natural key is not enough to identify exactly one row, the agent must
ask for confirmation before writing.

## Delete Old Datasources

Only after the new Cloud path is complete:

1. Compare old and new monthly totals by vendor/type/currency.
2. Compare current insights against the new derived data.
3. Keep a Tinybird backup of old datasources.
4. Remove old frontend reads.
5. Remove old ingestion code paths.
6. Deploy Tinybird removal only with explicit destructive approval.

Old candidates:

- `provider_monthly`
- `gpu_runs`

The target raw architecture keeps only `op_transactions`, `op_cloud`, and
`op_pollen`.
Existing `revenue_monthly` and `grants` are also retired once Wise revenue and
cloud credit events cover their first-iteration use cases.

## Open Questions

- What exact folder convention should evidence use for recurring monthly
  invoices and dashboards?
