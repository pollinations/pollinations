# Treasury Web App — Raw-Data Editing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve `apps/operation/treasury/web/` from a read-only raw viewer into a raw viewer **with editing**: every hand-entered number (grant granted/left, monthly usage burn, FX), invoice relabeling, and — most importantly — a resolution path for every flagged `missing_invoice`, including providers that will NEVER have an invoice (free-credit pools like AssemblyAI). Stay raw: tables close to Tinybird, no dashboards, no derived analytics.

**Architecture:** unchanged — pure pipe consumer + now a pure Events-API producer. Reads via `treasury_web` token (pipes), writes via `treasury_append` token (APPEND-only on `overrides`, `invoices`, `meter_monthly`, `balances`). All I/O is browser→Tinybird HTTPS. No backend. Engines stay in forager; the app never computes verdicts, it only appends facts and operator decisions, which the next `python3 -m ingest.run` folds into the derived tables.

## Evidence-driven reconciliation (context for every implementer)

**Design law: verdicts come from evidence, never from configuration.** A provider's pool
config must not encode expectations like "this one never invoices" — providers mix
sponsored and paid usage, and switch over time (AssemblyAI rides free credits today,
may pay in two months — same row, no config change ever). The per-month evidence decides:

| Evidence for provider × month | Verdict | Meaning |
|---|---|---|
| Parsed invoice, amount due > 0 | match against Wise → `ok` / `amount_mismatch` / `missing_payment` | we pay; bank must confirm |
| Parsed invoice, amount due ≈ 0 (credits applied) | `ok_credit` | invoice documents that credits covered everything — best case, self-satisfied, no payment expected |
| Payment but no invoice | `missing_invoice` | the ONLY real chase case: money left the bank undocumented |
| No invoice, no payment, but a credit-burn number exists for the month (manual meter entry or API meter, funding=credit) | `ok_credit` | the operator/API number IS the evidence |
| No evidence at all, but platform usage happened (> $1) | `needs_data` | "give me an invoice or a number" |
| Nothing at all | `quiet` | nothing happened, nothing to reconcile |

**`invoices.amount` means the amount actually payable (Amount Due), never the gross sub-total.**
Credits applied on the invoice are captured separately in `credit_usd` and count as credit-burn
evidence (Task E). Real case that motivated this: Lambda emails a weekly invoice — Sub Total
$384.47, Promotional Credits −$384.47, **Amount Due $0.00, status PAID**. The old parser stored
the sub-total, so June showed $1,922 of phantom cash and flagged `missing_payment` forever (no
bank payment will ever exist). With amount-due semantics the same rows become `ok_credit` and the
credits-applied lines become exact monthly burn. If Lambda's credits run out and Amount Due goes
positive, the identical row starts matching Wise — no configuration change, ever. A partial month
(due $200, credits $300) is also self-describing: $200 reconciles against the bank, $300 burns.

This makes Tasks E + F (forager) prerequisites for the flags being *correct*; the UI resolutions are:

| Situation | Action in UI | What gets written |
|---|---|---|
| Invoice exists, not ingested yet | "Ingest invoice" panel: shows inbox path `~/Documents/treasury-invoices/inbox/` + command `python3 -m ingest.run` with copy buttons | nothing (pipeline appends the invoice row) |
| No invoice, but the month's usage/amount is known (e.g. read from the provider dashboard) | "Enter monthly usage" form: amount + funding (credit/cash) | `meter_monthly` row, `source="manual"` — next run this month becomes `ok_credit` by itself |
| No invoice, nothing meaningful to record for this month | "Accept" button + optional note | `overrides` row, scope=`reconciliation`, field=`accepted`, key=`YYYY-MM:provider` — verdict becomes `accepted` next run |

Related but distinct: "value **left** on the grant" vs "value **used** this month". They are NOT interchangeable:
- **used this month** → `meter_monthly` manual row → produces `credit_burn_usd` (burn rule 4-3). This is the number that makes monthly P&L correct.
- **left now** → `balances` manual snapshot → updates the Credits tab display and `grants.left_usd` (src `manual`), but does **not** produce monthly burn (the balance-delta rule only trusts api/cli snapshots).
The manual-entry form must present both options with exactly this explanation.

## Global constraints

- Branch: `feat/treasury-app`. Commit per task with the exact paths listed — **never `git add -A` / `git add .`**. **Never push.**
- **Deployment-ready at all times** (the app will later ship as a Cloudflare Page):
  1. No secret in the bundle, ever. The paste-once token gate (localStorage) is the primary auth for BOTH tokens. Remove/ignore any SOPS build-time token injection for the read path.
  2. Core features are browser→Tinybird only. Nothing essential may assume a local server.
  3. Machine-bound features (Task 8's ingest button) are progressive enhancements behind a runtime probe, with a copy-the-command fallback that always works.
- Tinybird host `https://api.europe-west2.gcp.tinybird.co` is public and committable. Tokens are not.
- Write rows must match the datasource schemas EXACTLY (schemas in `apps/operation/forager/tinybird/datasources/*.datasource`). Timestamps: `entered_at`/`run_at`/`ingested_at` = UTC `"YYYY-MM-DD HH:MM:SS"`; `retrieved_at`/`issued_at` = `"YYYY-MM-DD"`.
- Events API: `POST {TB_HOST}/v0/events?name=<datasource>` with NDJSON body (one JSON object per line), header `Authorization: Bearer <treasury_append>`. Response `{"successful_rows":N,"quarantined_rows":0}` — treat `quarantined_rows > 0` as an error shown to the user.
- Category vocabulary (mirror `forager/ingest/invoices/label.py`): `compute | infra | saas | admin | office | payroll | other`.
- Reconciliation statuses (exhaustive after Task F): `ok, ok_credit, accepted, needs_data, needs_review, amount_mismatch, missing_invoice, missing_payment, quiet`. Unknown strings must render, never crash.
- `invoices_ep` is ALREADY deduped server-side — the app must NOT dedupe client-side (delete any leftover dedupe logic).
- Do NOT modify `packages/ui`. Do NOT modify anything under `apps/operation/forager/` outside Tasks E and F (the only FORAGER tasks) or where a step explicitly says CONTROLLER.
- Dev server stays pinned to `127.0.0.1:4180` (strictPort). Format with `npx biome check --write <files>` from repo root before each commit. `npm run test` + `npm run typecheck` must pass at the end of every task (typecheck currently fails on RunsTab — fixed in Task 2).
- YAGNI: no router, no state library (React context/useState is enough), no charts, no matrix view, no optimistic recomputation of verdicts.

---

### Task 0: Prerequisites (CONTROLLER ONLY — implementers skip)

1. **Mint `treasury_append`** in the `operations` workspace (admin token from local `.tinyb`): scopes `DATASOURCES:APPEND` on exactly `overrides`, `invoices`, `meter_monthly`, `balances`. No READ scopes. Store SOPS-encrypted; never print.

App tasks do not block on this: fixtures mode covers all UI work; commits fail gracefully without the append token (clear error in the tray).

---

### Task E (FORAGER): invoice `amount` = amount due; capture credits applied

Fixes the extractor bug that breaks the evidence table's first two rows (see the Lambda example
above — `generic.py`'s regex hits `Sub Total` before `Amount Due`, storing gross instead of $0).
Do this BEFORE Task F so zero-due invoices actually exist in the data.

**Files:**
- Modify: `apps/operation/forager/tinybird/datasources/invoices.datasource`, `tinybird/pipes/invoices_ep.pipe`
- Modify: `apps/operation/forager/ingest/invoices/parsers/generic.py`, `ingest/invoices/extract.py`, `ingest/invoices/label.py`, `ingest/burn.py`, `ingest/run.py`
- Modify: `apps/operation/forager/tests/` (test_extract, test_burn, test_label as applicable)

- [ ] Step 1: schema — append `` `credit_usd` Float64 `json:$.credit_usd` DEFAULT 0 `` at the END of the invoices schema. Validate with `tb --cloud deploy --check` from `apps/operation/forager/tinybird`; if the CLI demands it, add `defaultValueOfTypeName('Float64') AS credit_usd` to the FORWARD_QUERY. **Never truncate/recreate `invoices`.** Add `credit_usd` to the `invoices_ep` SELECT.
- [ ] Step 2: `generic.py` — `amount` = amount payable, precedence: `Amount Due` > `Invoice Amount` > `Total`/`Grand Total`/`Amount Paid` > `Sub Total` (last resort). Capture credits applied (e.g. `Promotional Credits ($384.47)`, parenthesized-negative or labeled credit lines) into `credit_usd` as a positive number, 0.0 when absent.
- [ ] Step 3: carry `credit_usd` through `extract_and_push` and `label.py` row builders (label CLI gets optional `--credit`, validation ≥ 0; carry-over from `_existing_row` like the other fields).
- [ ] Step 4: `burn.py` rule 4 — new evidence source between 4-1 (programmatic meter) and the balance-delta rule: sum of deduped invoice `credit_usd` for the provider × month > 0 → `(sum, "invoice")`. First-match-wins ordering means no double counting.
- [ ] Step 5: `run.py` — `--reparse-invoices [--dry-run]`: walk `archive_dir` (config.json), re-extract every PDF, dry-run prints per-sha `old amount/credit → new amount/credit` diffs; real run appends fresh `parsed` rows. Idempotent and safe by construction: same file → same sha256 → the pipe dedupe picks the newest parsed row, and `label` rows still outrank re-parsed ones.
- [ ] Step 6: tests — Lambda-style fixture text (sub-total + promotional credits + $0 due) → `amount 0.0, credit_usd 384.47`; amount-precedence cases; burn rule-4 invoice-credit case (and that an api meter still wins); label carry-over.
- [ ] Step 7 (CONTROLLER): deploy schema (staging rule n/a — `operations` is a single workspace, but always `--check` first), run reparse dry-run → review the diff table → real run → `python3 -m ingest.run`. Verify: lambda 2026-04/05/06 flip `missing_payment` → `ok_credit`; `provider_month.credit_burn_usd` ≈ 2002 / 1538 / 1922 with `credit_src='invoice'`; lambda `invoice_usd` drops to ≈ 0 (the legacy spend-audit cash column self-heals).
- [ ] Step 8: `ruff format` + `ruff check --fix` if installed; commit forager paths only

---

### Task F (FORAGER): evidence-driven reconciliation

Together with Task E, the only tasks allowed to touch `apps/operation/forager/`. Implements the evidence table above. Independent of the app tasks; do it right after Task E so the flags the UI resolves are correct.

**Files:**
- Modify: `apps/operation/forager/ingest/gaps.py`, `apps/operation/forager/ingest/run.py`, `apps/operation/forager/tests/test_gaps.py` (+ `tests/test_run_burn.py` if stubs need the reorder)

**Design:**
- `gaps.run(invoices, payments, pools, months, config, today, provider_month=None)` — new last param: the burn engine's output rows. Evidence per (provider, month) is read from the provider's default-category row: `credit_burn_usd > 0` and `usage_cost_usd`.
- **run.py reorders the stages: burn BEFORE gaps** (burn has no dependency on reconciliation). Pass `pm_rows` into `gaps.run`. This matters because Azure-style credit burn comes from balance deltas, not meter rows — `provider_month.credit_burn_usd` is the one place all burn evidence is already folded.
- `_reconcile_monthly` changes:
  1. Parsed invoices with `amount_usd < recon_tolerance_usd` are **zero invoices**: excluded from payment matching; if a month has only zero invoices and no payments → `ok_credit` (the invoice documents credit coverage).
  2. Delete the `billing == "sponsored"` early-exit — `billing` now ONLY selects the matching window (`prepaid` → top-ups by date ±10d; everything else including `sponsored` → arrears M..M+1).
  3. The no-invoice/no-payment branch becomes evidence-driven: credit burn > 0 for the month → `ok_credit`; else usage_cost > $1 → `needs_data`; else → `quiet`.
  4. `accepted` early-exit unchanged. Payment-without-invoice → `missing_invoice` unchanged (the real chase case).
- New verdict values `needs_data` and `quiet` join the reconciliation status vocabulary (already tolerated by the app's unknown-status fallback).
- Universe stays pool-providers × months (widening to all evidenced providers is a noted future extension, not this task).

- [ ] Step 1: reorder run.py stages (burn → gaps), pass pm_rows through; keep the run-log append last
- [ ] Step 2: implement the gaps.py changes above
- [ ] Step 3: tests — update test_gaps for the signature + sponsored-branch removal; add: zero-invoice → `ok_credit`; credit-burn evidence → `ok_credit`; usage-only → `needs_data`; no evidence → `quiet`; mixed month ($0 invoice + $500 invoice + payment → the $500 one still matches normally)
- [ ] Step 4: `python3 -m pytest tests/ -q` all green; run `python3 -m ingest.run` (CONTROLLER) and verify AssemblyAI/Perplexity months flip from `missing_invoice` to `needs_data`/`ok_credit`
- [ ] Step 5: biome n/a (Python) — `ruff format` + `ruff check --fix` if installed; commit forager paths only

---

### Task 1: Folder cleanup

**Files:**
- Delete: `apps/operation/treasury/PLAN.md`, `PLAN-INVOICES.md`, `PLAN-BURN.md` (committed — recoverable from git history)
- Move: `apps/operation/treasury/PLAN-WEB.md` → `_local/treasury-plans/PLAN-WEB.md` (untracked — archive, don't delete)
- Delete: `apps/operation/treasury/.pytest_cache/`
- Create: `apps/operation/treasury/README.md` (~20 lines: what the app is, `npm run dev` from `web/`, fixtures mode `?fixtures=1`, token gate, pointer to `forager/tinybird/README.md` for the data contract, pointer to this plan)

- [ ] Step 1: perform the moves/deletes; write README.md
- [ ] Step 2: commit (`git add` the deletions + README + this plan file only)

---

### Task 2: App consolidation (still read-only)

**Files:**
- Modify: `web/src/App.tsx`, `web/src/types.ts`, `web/src/fixtures.ts`
- Modify: `web/src/views/ReconTab.tsx` (absorb GapsTab), `web/src/views/GrantsTab.tsx` → rename `CreditsTab.tsx` (absorb BalancesTab), `web/src/views/InvoicesTab.tsx`, `web/src/views/PaymentsTab.tsx`, `web/src/views/RunsTab.tsx`
- Delete: `web/src/views/GapsTab.tsx`, `web/src/views/BalancesTab.tsx`
- Add: `web/src/views/BurnTab.tsx` (NEW — raw `provider_month_ep` table)
- Modify: `web/src/lib/tb.ts` (fetch `provider_month_ep` in `loadAll`)

**Resulting tabs:** `Recon · Invoices · Payments · Burn · Credits · Runs`

- [ ] Step 1: **Recon** = coverage table + a `problems only` toggle (filters to status ∉ {ok, ok_credit, accepted}); when on, also show the gap detail columns (`delta_usd`, `invoice_refs`, `payment_refs`, `note`) from `gaps_ep`. Delete GapsTab.
- [ ] Step 2: **Credits** = grants table (top, now incl. `category` column) + balances table (below). Delete BalancesTab.
- [ ] Step 3: **Burn** (new) = `provider_month_ep` raw table: month, provider, category, invoice_usd, meter_cash_usd, meter_prepaid_usd, usage_cost_usd, credit_burn_usd, srcs, status (chip). Add `ProviderMonthRow` to types + fixtures. Default sort: month desc, provider.
- [ ] Step 4: surface new columns everywhere: `category` on Invoices + Payments (+ the `(unmatched)` cash bucket renders as its own provider); `credit_usd` on Invoices (from Task E; render 0 as `—`); category filter = plain `<select>` per tab (all/compute/infra/saas/admin/office/payroll/other/unmatched where applicable).
- [ ] Step 5: fix the pre-existing `RunsTab.tsx` type errors (`"RUN"` is not a `ProvenanceCode` — either add `RUN` to the code union in `types.ts`/`Provenance` component or use an existing code).
- [ ] Step 6: `npm run test` + `npm run typecheck` green (typecheck green for the FIRST time — keep it green from here on). Verify all 6 tabs render in `?fixtures=1`.
- [ ] Step 7: biome + commit

---

### Task 3: Write layer (staging + commit)

**Files:**
- Create: `web/src/lib/write.ts` — `appendRows(datasource: string, rows: object[], token: string): Promise<void>` (Events API NDJSON POST; throw on non-2xx or quarantined_rows > 0)
- Create: `web/src/lib/staging.tsx` — React context: `stage(change)`, `discard(id)`, `commitAll()`, `changes[]`. A `StagedChange` = `{id, datasource, row, summary}` where `summary` is the human line shown in the tray (e.g. `grants · Lambda · left_usd → 1500`)
- Create: `web/src/components/CommitTray.tsx` — fixed bottom bar, visible only when changes exist: list of summaries with per-item discard, `Commit N changes` button, error display
- Modify: `web/src/lib/token.ts` — second token slot (`treasury-tb-append-token` in localStorage); `getAppendToken()/setAppendToken()`
- Modify: `web/src/App.tsx` — mount provider + tray; token-gate screen gains an optional second input "append token (for editing)"

- [ ] Step 1: implement write.ts + staging context + tray; group staged rows per datasource into one POST each on commit
- [ ] Step 2: after successful commit → `loadAll()` refetch + keep a `committedAwaitingIngest` counter (see Task 7)
- [ ] Step 3: fixtures mode: commit is a no-op that clears the tray (log to console) so the flow is testable without tokens
- [ ] Step 4: unit tests for staging reducer + NDJSON body building (no network)
- [ ] Step 5: biome + commit

---

### Task 4: Credits tab editing (overrides)

**Files:** modify `web/src/views/CreditsTab.tsx`, `web/src/types.ts` (if needed)

- [ ] Step 1: in the grants table, `granted_usd`, `left_usd`, `prepaid_left_usd` become click-to-edit number inputs **only when** their `_src` is `hc`, `manual`, or empty. `api` values stay read-only (live API beats overrides by design — editing them would be a lie).
- [ ] Step 2: an edit stages `{datasource:"overrides", row:{entered_at, scope:"grants", key:<pool>, field:<granted_usd|left_usd|prepaid_left_usd>, value_num:<n>, value_str:"", note:<optional free text>}}`
- [ ] Step 3: small footer control on the tab: current FX (fetch not needed — static label "fx_eur_usd") + input staging `{scope:"config", key:"fx_eur_usd", field:"value", value_num}`
- [ ] Step 4: balances table stays read-only here (manual balance snapshots are entered via the Burn-tab form, Task 6, where the used-vs-left distinction is explained)
- [ ] Step 5: fixtures-mode verify + tests for the staged-row shapes + biome + commit

---

### Task 5: Invoices tab editing (label rows)

**Files:** modify `web/src/views/InvoicesTab.tsx`; create `web/src/components/InvoiceEditor.tsx`

- [ ] Step 1: each row gets an edit affordance opening an inline editor: dropdowns `kind`, `category` (vocabularies above), inputs `amount` (labeled "amount due"), `credit_usd` (labeled "credits applied", ≥ 0), `currency (USD|EUR)`, `period_month (YYYY-MM)`, `issued_at (date)`, `invoice_number`; prefilled from the row
- [ ] Step 2: save stages a FULL label row to `invoices`: carry `sha256` + `file_ref` from the row verbatim, `source:"label"`, `status:"parsed"`, fresh `ingested_at` DateTime. (Mirrors `forager/ingest/invoices/label.py` semantics — the pipe's dedupe makes it win.)
- [ ] Step 3: a not-invoice action: stages the same row with `status:"not_invoice"`, `kind:""`, `period_month:""`, `amount:0`, `credit_usd:0`, reason into `invoice_number`
- [ ] Step 4: validation mirrors label.py: month regex `^\d{4}-(0[1-9]|1[0-2])$`, amount ≥ 0, currency in {USD, EUR}; invalid → inline error, nothing staged
- [ ] Step 5: fixtures-mode verify + tests for row building/validation + biome + commit

---

### Task 6: Gap resolution — Recon actions + Burn manual entry (the core feature)

**Files:** modify `web/src/views/ReconTab.tsx`, `web/src/views/BurnTab.tsx`; create `web/src/components/GapActions.tsx`, `web/src/components/UsageEntryForm.tsx`

- [ ] Step 1: **GapActions** — on Recon rows with status `missing_invoice` / `amount_mismatch` / `needs_review` / `needs_data`, a `resolve` button opens a panel with the three resolution paths (table at the top of this plan):
  1. *Ingest invoice*: static panel — inbox path + `python3 -m ingest.run`, copy buttons, note "row clears after the next ingest run"
  2. *Enter monthly usage*: embeds `UsageEntryForm` (Step 3) — for credit-riding months this alone turns the row `ok_credit` on the next run
  3. *Accept*: optional note input → stages `{datasource:"overrides", row:{entered_at, scope:"reconciliation", key:"<month>:<provider>", field:"accepted", value_str:"1", value_num:null, note}}`
- [ ] Step 2: **BurnTab** — rows with status `needs_data` get the same `resolve` button opening `UsageEntryForm` directly
- [ ] Step 3: **UsageEntryForm** — two explicit modes (radio), with one sentence of explanation each, per the used-vs-left model:
  - `used this month` (default): amount + funding (`credit` default | `cash` | `prepaid`) → stages `{datasource:"meter_monthly", row:{month, provider, cost_usd, funding, source:"manual", retrieved_at:<today>}}`. Caption: "drives this month's burn/P&L"
  - `left on the grant now`: amount → stages `{datasource:"balances", row:{run_at:<now DateTime>, provider, granted_usd:null, spent_usd:null, left_usd:<n>, prepaid_left_usd:null, source:"manual", note:"entered in treasury app"}}`. Caption: "updates the pool balance display only — does NOT produce monthly burn"
- [ ] Step 4: fixtures-mode verify all three staged-row shapes + tests + biome + commit

---

### Task 7: Post-commit honesty

**Files:** modify `web/src/App.tsx`, `web/src/components/CommitTray.tsx`

Committed rows land in Tinybird instantly, but `reconciliation`/`provider_month`/`grants` only change after the next `python3 -m ingest.run`. The UI must not pretend otherwise.

- [ ] Step 1: after a successful commit, show a persistent dismissible banner: "N changes committed — flagged rows update after the next ingest run (`python3 -m ingest.run`)" with a copy button
- [ ] Step 2: rows the user acted on this session get a `queued` chip (session-local set keyed by `datasource+key`; clears on refetch when the flag is gone). No localStorage persistence — session-only is enough.
- [ ] Step 3: verify + biome + commit

---

### Task 8 (OPTIONAL, last): local ingest button

**Files:** modify `web/vite.config.ts`; create `web/src/components/IngestButton.tsx`

- [ ] Step 1: vite dev-server middleware (dev only): `POST /api/ingest` spawns `python3 -m ingest.run` with cwd `apps/operation/forager`, streams stdout tail; `GET /api/ingest` → `{running: bool}`
- [ ] Step 2: app probes `GET /api/ingest` once at load — on 200, a `Run ingest` button appears in the header and inside GapActions path 1; on failure (deployed build), nothing renders and the copy-the-command panels remain the path
- [ ] Step 3: on completion → auto `loadAll()` refetch
- [ ] Step 4: verify locally + biome + commit

---

## Verification (end of plan)

- `npm run test` and `npm run typecheck` green in `web/`.
- `?fixtures=1` walk-through: all 6 tabs render; stage one change of each type (override, label, ignore, accept, meter, balance) → tray shows 6 → commit clears (fixtures no-op).
- Live walk-through (needs tokens, after Task F): AssemblyAI month shows `needs_data` on Recon → enter the monthly usage number from its dashboard → commit → row appears in `meter_monthly` → run `python3 -m ingest.run` → Recon flips to `ok_credit`, Burn shows the number with `credit_src=manual`. No configuration was touched — if AssemblyAI sends a real invoice in two months, the same row reconciles as `ok` via Wise instead.
- Lambda walk-through (after Task E's reparse, zero UI action needed): Recon 2026-04/05/06 show `ok_credit` (amount due $0, was `missing_payment`); Burn shows `credit_burn_usd` ≈ 2002 / 1538 / 1922 with `credit_src=invoice`; Invoices tab shows the weekly rows with `amount 0` + `credit_usd 384.47`. Purely from re-reading the PDFs — no override, no config.
