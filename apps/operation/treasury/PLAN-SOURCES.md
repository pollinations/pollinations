# Treasury Data Platform — Source Vocabulary & Pipe Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tinybird `operations` workspace vocabulary explicit and clean up the
pipe surface — document the four observation planes, add the two missing raw pipes
(`meter_monthly_ep`, `payments_monthly_ep`), migrate consumers, and mark the deprecated
derived surface (`provider_month_ep`, `cash_monthly_ep`) for later deletion. **No table
is renamed and no pipe is renamed** — pipes evolve only by add → migrate → delete.

**Decision already made (do NOT revisit):** there is no `manual_credit_monthly` table.
Manual facts live inside the existing fact tables via `source='manual'`:
monthly manual credit burn → `meter_monthly` (`funding='credit'`), manual remaining
balance → `balances`, grant corrections → `overrides` (scope=`grants`). This is the
same correction-by-append pattern as invoice label rows.

## Established facts (verified 2026-07-03 — trust these, don't re-derive)

- The treasury app reads exactly: `coverage_ep, gaps_ep, invoices_ep, cash_monthly_ep,
  grants_ep, balances_ep, usage_ep, runs_ep` (`web/src/lib/tb.ts` loadAll). It does NOT
  read `provider_month_ep` or `revenue_ep`.
- Forager's gaps engine does NOT read the `provider_month` datasource — `ingest/run.py`
  passes the burn engine's in-memory `pm_rows` into `gaps.run(...)`. The datasource is
  only a persistence side-effect (`ops_replace.replace("provider_month", pm_rows)`).
- The only `provider_month_ep` consumer is the legacy spend-audit PoC
  (`_local/2026-07-01-spend-audit/build/pull_forager.py`), which also reads
  `cash_monthly_ep`, `revenue_ep`, `grants_ep`, `usage_ep`, `balances_ep`.
- `meter_monthly` schema today: `month, provider, cost_usd, funding, source,
  retrieved_at` — **no `note` column** (Task 2 adds it).
- `web/src/components/UsageEntryForm.tsx`: `buildManualBalanceChange` writes a `note`;
  `buildManualMeterChange` does not (Task 5 fixes the asymmetry).

## Global constraints

- Branch: `feat/treasury-app`. Commit per task with exact paths — **never
  `git add -A` / `git add .`**. **Never push.**
- Tinybird: single `operations` workspace (no staging exists). All schema/pipe changes
  via datafiles in `apps/operation/forager/tinybird/`, deployed from that folder with
  `tb --cloud deploy --check --wait` first, then `tb --cloud deploy --wait`.
  **Never `--allow-destructive-operations`.** This plan is purely additive — if the CLI
  reports anything destructive, STOP and ask.
- Deploys are CONTROLLER-gated: prepare datafiles, run `--check`, then stop and ask
  before the real deploy.
- Never truncate/recreate `invoices` or `overrides`.
- Do NOT rename any existing datasource or pipe. Do NOT delete anything in this plan —
  deletions are Task 6 documentation only, executed later with fresh approval.
- Web: `npx biome check --write <files>`; `npm run test` + `npm run typecheck` green at
  the end of every app task. Python: `ruff format` + `ruff check --fix` if installed.
- Ignore IDE spell-checker diagnostics on `.md`/`.pipe` files (broken extension flags
  every word as "Error").

---

### Task 1: Document the vocabulary (README rewrite)

**Files:** modify `apps/operation/forager/tinybird/README.md`

Replace the current datasource/pipe tables with a structure that leads with the four
observation planes, then classifies everything else:

- [ ] Step 1: **Four planes** table — everything is the same underlying thing (provider
  consumption) observed from four places:

  | Plane | Table | Pipe | Meaning |
  |---|---|---|---|
  | `usage` | `usage_monthly` | `usage_ep` | What OUR platform metered serving requests (Tinybird gen events, Pollen-denominated). Our own estimate — never money. |
  | `meter` | `meter_monthly` | `meter_monthly_ep` | What the PROVIDER reports we consumed (dashboard/API/CLI/BQ; `source='manual'` = human copied the dashboard). Their measurement — still not money moved. |
  | `invoice` | `invoices` | `invoices_ep` | What the provider formally BILLED: `amount` = amount due (money claim), `credit_usd` = credits applied (credit burn). Document truth. |
  | `payment` | `payments` | `payments_monthly_ep` | What actually LEFT the bank (Wise). Cash truth. |

  Plus the note: usage printed ON an invoice is captured via `invoices.credit_usd`, not
  `meter_monthly` — one real-world fact may legitimately appear on two planes;
  reconciliation's job is comparing planes.
- [ ] Step 2: classify the rest — **stocks** `balances` (latest-wins snapshots, not
  monthly burn); **derived** `grants` (rewritten each run), `reconciliation`
  (verdicts), `provider_month` (**deprecated**, exit path in Task 6); **corrections**
  `overrides` (append-only operator truth); **ops** `ingest_runs`; **money-in**
  `revenue_monthly` / `revenue_ep` (Stripe only).
- [ ] Step 3: naming laws section:
  1. Pipes are NEVER renamed — add new pipe, migrate consumers, delete old (with
     approval). `cash_monthly_ep` → `payments_monthly_ep` is the live example.
  2. Manual facts live inside the fact tables via `source='manual'` — never in
     separate manual tables. (This is why there is no `manual_credit_monthly`.)
  3. Reserved name: `payments_ep` = future transaction-grain (wise_ref) pipe. Do not
     build it until something needs transaction grain.
- [ ] Step 4: mark `cash_monthly_ep` and `provider_month_ep` as **deprecated** in the
  pipe table, each with its replacement/exit condition.
- [ ] Step 5: commit (README only)

---

### Task 2: Schema — `meter_monthly` gains `note`

**Files:** modify `apps/operation/forager/tinybird/datasources/meter_monthly.datasource`

- [ ] Step 1: append `` `note` String `json:$.note` DEFAULT '' `` at the END of the
  schema. Existing writers keep working (missing JSON field → default).
- [ ] Step 2: `tb --cloud deploy --check --wait` from `apps/operation/forager/tinybird`.
  If the CLI demands a FORWARD_QUERY, add the suggested
  `defaultValueOfTypeName('String') AS note` form. If it reports anything destructive,
  STOP.
- [ ] Step 3: do not deploy yet — deploy happens once, in Task 4, together with the new
  pipes.

---

### Task 3: New pipes (datafiles only)

**Files:** create `apps/operation/forager/tinybird/pipes/meter_monthly_ep.pipe`,
`apps/operation/forager/tinybird/pipes/payments_monthly_ep.pipe`

- [ ] Step 1: `meter_monthly_ep` — raw rows, no winner-picking (dedup/precedence is
  burn-engine business, not the raw viewer's):

  ```
  TOKEN "treasury_web" READ

  NODE endpoint
  SQL >
      SELECT month, provider, cost_usd, funding, source, retrieved_at, note
      FROM meter_monthly
      ORDER BY provider, month, retrieved_at

  TYPE endpoint
  ```
- [ ] Step 2: `payments_monthly_ep` — byte-for-byte copy of `cash_monthly_ep`'s current
  SQL (computed month, `(unmatched)` bucket, category, fx-override `paid_usd`), only
  the NODE name differs:

  ```
  TOKEN "treasury_web" READ

  NODE payments_monthly
  SQL >
      SELECT substring(toString(paid_at), 1, 7) AS month,
             if(provider = '', '(unmatched)', provider) AS provider,
             category,
             round(sum(amount_eur) * (
                 SELECT coalesce(argMax(value_num, entered_at), 1.14)
                 FROM overrides WHERE scope = 'config' AND key = 'fx_eur_usd'
             ), 2) AS paid_usd,
             round(sum(amount_eur), 2) AS paid_eur
      FROM payments
      GROUP BY month, provider, category ORDER BY month, provider

  TYPE endpoint
  ```

  If `cash_monthly_ep.pipe` has drifted from the SQL above, copy the live file verbatim
  instead — the two pipes MUST return identical rows.
- [ ] Step 3: commit (both pipe files + the Task 2 datasource change)

---

### Task 4: Deploy (CONTROLLER gate)

- [ ] Step 1: `tb --cloud deploy --check --wait` from
  `apps/operation/forager/tinybird` — expect: 1 changed datasource (meter_monthly,
  additive), 2 new pipes, nothing destructive.
- [ ] Step 2: STOP — show the check output and ask before the real deploy.
- [ ] Step 3 (after approval): `tb --cloud deploy --wait`, then smoke both new pipes
  with the read token and diff `payments_monthly_ep` vs `cash_monthly_ep` — row counts
  and sums MUST match exactly.

---

### Task 5: Migrate consumers

**Files:** modify `apps/operation/treasury/web/src/lib/tb.ts`,
`web/src/components/UsageEntryForm.tsx`, `web/src/fixtures.ts` (+ tests as needed);
modify `_local/2026-07-01-spend-audit/build/pull_forager.py`

- [ ] Step 1: app — `tb.ts` loadAll: `cash_monthly_ep` → `payments_monthly_ep` (one
  line). Update any fixture/pipe-name references (PaymentsTab DataNote shows the pipe
  name — update it too).
- [ ] Step 2: app — `buildManualMeterChange` gains `note` in the staged row (mirror the
  balances builder: `note: "entered in treasury app"`, or pass through a user note if
  the form already collects one). Update its tests for the new row shape.
- [ ] Step 3: do NOT add a Meter tab or new UI for `meter_monthly_ep` in this plan —
  the pipe exists for future use; wiring it into GapActions/manual-entry views is a
  separate decision.
- [ ] Step 4: legacy PoC — in `pull_forager.py`, repoint `cash_monthly_ep` →
  `payments_monthly_ep` (comment + fetch call). No other PoC changes.
- [ ] Step 5: `npm run test` + `npm run typecheck` green; `?fixtures=1` walk-through of
  all tabs; biome; commit (exact paths).

---

### Task 6: Deprecations — DOCUMENT ONLY, do not execute

No deletion happens in this plan. Record the exit path (in the Task 1 README notes) so
the later cleanup is mechanical. Each deletion is a destructive deploy requiring fresh
explicit approval at execution time:

1. Delete `cash_monthly_ep` — condition: nothing reads it (after Task 5 both consumers
   are migrated; verify with a grep across the repo + `_local`).
2. Retire the legacy spend-audit PoC (superseded by the treasury app).
3. Delete `provider_month_ep` + `provider_month` and drop the
   `ops_replace.replace("provider_month", pm_rows)` persist in `ingest/run.py` — the
   burn engine keeps running in-memory for gaps evidence; only persistence stops.
   Condition: (2) done, and no other reader found.

---

## Verification (end of plan)

- `tb --cloud deploy --check --wait` clean (from `apps/operation/forager/tinybird`).
- `python3 -m pytest tests/ -q` green (from `apps/operation/forager`).
- App: `npm run test` + `npm run typecheck` green; `?fixtures=1` renders all tabs;
  Payments tab shows `payments_monthly_ep` in its DataNote line.
- Live (after Task 4 deploy): `payments_monthly_ep` returns identical rows to
  `cash_monthly_ep`; `meter_monthly_ep` returns rows including a `note` field; a manual
  meter entry staged + committed from the app lands with its note.
- Legacy PoC still builds its CSVs after the repoint.
