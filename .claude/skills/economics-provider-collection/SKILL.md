---
name: economics-provider-collection
description: Start or resume the Pollinations monthly close when the user says "Trigger economics update", or collect and reconcile a scoped provider's balances, usage, invoices, and model costs through its documented connector.
---

# Economics provider collection

Use this skill when the user asks to refresh vendor data, inspect provider
accounts, prepare a monthly close, or reconcile provider cost with Pollen.

## Trigger economics update

`Trigger economics update` starts or resumes the whole monthly close below.
An optional `for YYYY-MM` selects a completed month. Without it, use the last
completed UTC calendar month: on 3 November 2026, close October 2026 and refresh
current balances and November forecasts. Resolve the date anew on every run.
If an unfinished close is already in progress in this chat, resume its recorded
month unless the user explicitly selects another one.

Reusable starting prompt:

> Use $economics-provider-collection to start or resume the monthly Economics
> close. Read the current workflow, vendor journals, connector guides and
> dashboard contracts. Collect and reconcile every in-scope vendor and account,
> original invoices, usage and model breakdowns; archive evidence in Google
> Drive and prepare the Tinybird updates. Coordinate one subchat per vendor,
> with at most three running at once, and keep finished subchats open. Continue
> all independent work through staging dashboard verification, requesting the
> existing exact-batch approvals when needed. Surface concrete blockers and
> next actions, and improve verified collection instructions for next month.

This is an on-demand job, not a recurring schedule. A request to draft or edit
this prompt does not start collection. Invocation authorizes the collection
workflow, not blanket ledger writes, production publication or secret changes;
retain the approval gates below. Do not stop after presenting a plan.

## Monthly Economics close entrypoint

Use the resolved close month from the trigger rules above. Run the whole app
close. Do not interpret the request as a single-vendor refresh or stop after a
staging endpoint count.

The first goal is a review-ready local app: collect all available evidence,
verify its Drive archive, import approved data into Tinybird staging, and open
the local app against staging. The second goal is the user's review and
follow-up corrections. State remaining dependencies when handing off for
review; an import milestone is not that handoff.

1. Open the Economics dashboard's Close, Runway, Unit Economics, and Ledgers
   views and record what is missing or stale. Read the current registry and
   the app's source contracts in `operations/dashboards/economics/web/src/App.tsx` and
   `worker/economics.ts`. Create a private task-specific `<collection-dir>`
   outside Git with `evidence/` and a resumable upload manifest.
2. Read the production and staging Economics endpoints with their respective
   existing read credentials, in memory. Record month coverage for Bank, Vendor,
   Pollen, Revenue Share, Stripe, user balances, and private forecast rules.
   Production Pollen and Revenue Share can be live materializations while
   staging Pollen is a snapshot; inspect the configured upstream pipe before
   treating a staging gap as a production gap. Local dashboard development
   still uses only `web.dev.json` and the staging workspace.
3. Collect and reconcile the closed month's Wise settlement statements,
   account-scoped Stripe balance activity, every active `monthlyReview` vendor
   and account, Pollen usage, Revenue Share, D1 balances, and the accounting
   Drive archive. Sweep the signed-in business mailbox for invoice and receipt
   attachments received during the close window; also inspect vendor invoice
   and receipt emails without attachments, since they may link to the original
   document in a billing portal. Preserve the original email and any genuine
   provider-hosted receipt when no supplier PDF exists; keep the invoice gap
   visible. Triage PDFs already in Downloads by supplier,
   account, issue date, and service period. Include relevant late-issued
   documents and older contracts or annual invoices that explicitly schedule
   a payment in the close month; exclude personal files. Use the Wise and
   Stripe provider guides even though those cash/revenue sources are not
   monthly-review vendors. Preserve each source's
   own time grain and funding identity. Complete a provider in one visit:
   download its full month usage/model export, all original invoices and
   receipts for the account and period, current balance and credit evidence,
   and screenshots of dashboard facts that have no export. Verify account,
   period, totals, file integrity, and Drive archive before moving on. An
   invoice must be the provider's original document, not a recreated PDF.
   Record any missing or not-yet-issued document immediately in the manifest.
   For invoices published later in the month (some arrive around the 9th),
   record the provider's observed status and a dated recheck. Reconcile
   calendar-month dashboard/API usage now when its source is complete; keep the
   invoice match provisional until the original document arrives. Append any
   source-backed provisional rows only through the normal batch approval gate,
   and correct the same `entry_id` after the invoice review if needed.
4. Compare the source evidence with effective ledgers and the app's Close,
   Runway, Unit Economics, and Ledgers views. Refresh current balance snapshots
   and the new month's reviewed forecast; keep missing evidence visible.
5. Prepare exact task-scoped corrections with a complete raw backup, validate
   staging first, and follow the separate batch/environment approval gate below
   before any ledger append. Re-query written IDs, verify the app and archive
   the evidence and after-snapshot. Record any verified procedure changes in
   the relevant connector guide so the next close starts from current facts.

## Vendor subchat coordination

For a full close, this chat is the coordinator. Use collaboration subagents
for the vendor subchats; do not create separate sidebar chats unless the user
explicitly requests them. A scoped vendor request stays in its existing chat.

- Build the queue from the current Drive vendor journals joined to the
  repository's canonical IDs, applying vendor and account month bounds. Keep
  one subchat per canonical vendor for this close, covering all its active
  accounts. Record the agent ID, month, assigned accounts, artifact path and
  execution state in the private close checklist; reuse it on resume.
- Run at most three vendor subchats at once, in addition to the coordinator,
  or fewer if runtime capacity is lower. Vendor workers must not spawn further
  agents. When one returns its collected evidence or a concrete blocker, verify
  and record the handoff, then start the next queued vendor in that free slot.
  Do not wait for all three to finish before advancing the queue. Keep returned
  subchats open and idle; do not close, archive or repurpose them for another
  vendor. Resume the same subchat for follow-up only when a slot is available.
- Give each worker the resolved UTC month, canonical vendor/account scope,
  absolute paths to this skill and its connector guide in the coordinator's
  checkout, Drive journal/archive locations and a private
  `<collection-dir>/vendors/<vendor-id>/` output directory. Instruct it to
  complete the scoped collection procedure, not restart the whole close.
  Use the same instruction files for every worker; collection does not need
  separate worktrees that may contain an older skill revision.
  Pass credential locations rather than values. Each worker returns component
  statuses, verified evidence links, exact proposed rows, reconciliation
  residuals, blockers with next actions/recheck dates, and verified guide fixes.
- Workers own their vendor's evidence, proposed rows and Drive journal updates.
  The coordinator owns the master checklist, shared registry/skill edits,
  cross-vendor reconciliation, batch approvals and all Tinybird writes. Review
  handoffs against evidence before combining rows; a worker returning is not
  proof that its provider-month is complete. No worker may import a batch or
  edit another vendor's files. Apply verified guide fixes in their owning file
  and report what will make next month's collection easier.
- Serialize browser work through the coordinator so workers never navigate a
  shared browser session concurrently. Preserve the repository's account and
  window-selection rules. Other workers can continue API, CLI, archive and
  local analysis work. An access failure or pending invoice leaves that
  component open; the worker finishes its independent checks and returns the
  handoff so another vendor can run.
- Keep shared Wise/Bank, Stripe, Pollen, Revenue Share, user-balance, forecast
  and dashboard checks on the coordinator's checklist. If Wise or Stripe has
  a vendor subchat, assign its collection there once and consume that handoff;
  do not collect the same account twice. The coordinator handles shared checks
  while vendor workers run, then validates the combined staging result.
- Keep coordinating until no authorized actionable work remains. Ask promptly
  for missing access or decisions while other workers continue. A blocked
  vendor does not block the queue. Preserve all subchats at the provisional or
  complete handoff, with each outstanding dependency and its next action.
  If delegation is unavailable, state the limitation and continue independent
  coordinator work; never claim vendor subchats are running when they are not.

## Execute and resume the whole close

Maintain one private close checklist in `<collection-dir>`, at canonical
provider/account/month grain, plus shared Bank, Stripe, Pollen, Revenue Share,
user-balance and forecast checks. Track each required component separately:
usage/UTC coverage, current balance, funding/expiry, original documents,
model reconciliation, Drive archive, and effective staging verification.
Each component records its status, evidence, next action and blocker. Use
`pending`, `verified`, `pending approval`, `blocked`, `awaiting issue` with a dated recheck,
or `not applicable` with a source-backed reason. An imported usage row verifies
only usage; it cannot mark the account complete.

- On resume, read this checklist and verify its outstanding claims against
  current evidence and effective staging rows. Continue the original monthly
  objective after a batch approval, import, local fix or status question.
  Do not require another "next" to start the remaining authorized work.
- Describe execution state accurately: `unfinished` means work remains.
  Claim background work only when a specific process or scheduled task is
  actually running; ending a chat turn does not continue the agent's work.
- Work through every active account using its connector guide. Start each
  reconciliation item with the business Drive archive check in
  `references/drive-archive.md`, before searching Downloads, email or provider
  dashboards. A missing ledger figure is not evidence of a missing document.
  Record the checked account, folders, date, source links, service period and
  next action in the private close checklist. Distinguish `not checked`,
  `archived — needs reconciliation`, `pending approval`, `imported — verified`
  and `not found after archive check`; keep access failures separate from empty
  searches. On resume, read those records before collecting the same data again.
  Never clear a financial gap merely because a file was found or uploaded.
- Open each active provider's documented journal/guide link and verify the
  account and page. Record every failed link, changed route, login failure or
  connector error and report it with its consequence; do not silently skip the
  provider. Use visible provider navigation to find a replacement, verify it,
  then replace the stale URL in its owning journal/guide and briefly report
  the correction. A working link to the wrong account is an account blocker,
  not a reason to rewrite the account target. Record lifecycle exclusions from
  the vendor journal; unfamiliar providers and failed links are not exclusions.
- Turn each dashboard alert and reconciliation residual into a checklist action.
  Keep actionable gaps separate from expected billing notices. A postpaid
  estimate already included in the forecast is pending reconciliation, not
  proof of overdue payment. Record a verified external wait with its reason,
  evidence and next check date; missing balances, unknown expiry and unmatched
  payments remain actionable until such a wait is evidenced. Never mark the
  close complete just because an item moved to an informational banner.
  Investigate model costs in descending unresolved amount, distinguishing
  missing breakdown, missing label mapping, provider-only cost and provider
  versus Pollen discrepancies. Before leaving a label unmapped, check its
  original billed SKU, owning runtime configuration and existing reviewed
  label targets. Preserve historical Pollen identities and qualify or date
  alias rules; do not normalize through arbitrary live aliases. Use documented
  exports and evidenced mappings;
  explain irreducible residuals rather than spreading costs or forcing 100%.
- If a documented source fails, try the next suitable authorized source. Record
  the failed route and error, then ask promptly for the minimum missing access,
  account selection or business decision. Continue independent accounts while
  waiting. A pending invoice blocks its document match, not balance collection,
  available usage reconciliation or the rest of the close.
- Collect and validate the remaining independent evidence before requesting a
  consolidated exact batch approval where practical. Approval gates still apply
  to each named batch/environment and secret mutation. Pending approval blocks
  only its writes, not read-only collection or preparation.

## Source of truth

Read the private [Vendor journals](https://drive.google.com/drive/folders/1GnyBRJEGtuZjdJl9qrBapH6jfUpmG9ei) folder in business Drive first.
Each canonical vendor has exactly one `<vendor-id>.json` containing `version: 1`,
`vendor` definitions/accounts, `recordedAt`, `forecastRules` and `reviewNotes`.
Read the vendor's existing check history before visiting the provider again;
after a check, update that same file with account, service period, checked date,
outcome, evidence links and next action. Preserve earlier checks. A balance
snapshot and a monthly evidence review remain separate facts.

`operations/dashboards/economics/provider-registry.json` retains canonical vendor
IDs/aliases and model compatibility mappings; join by vendor ID. Do not restore
vendor definitions or account details into the repository.

- The vendor's Drive file owns account lifecycles, active monthly-review status,
  balance tracking, access URLs, workspace domains, business `category`,
  optional `cashRules` and `runwayLine`. Create one file for a new vendor and
  its identity entry in the repository before categorizing its cash. Update
  existing files in place, preserving IDs; never recreate a combined catalog.
- Notes belong to their vendor. `planNotes` reference the existing Vendor
  ledger `entry_id`; amounts stay in the ledger. Stripe revenue-stream rules,
  including Ko-fi's stop date, belong in `stripe.json`. Model mappings stay
  in the repository. Invoices and exports stay at their original Finance links.
- A vendor is in a month’s normal review only when `monthlyReview: true` and
  that month is within its `activeFrom`/`activeTo` bounds (inclusive). Apply
  the same month bounds to each account. Record excluded vendors with the
  lifecycle reason in the coverage manifest so a stale review flag is not
  mistaken for a missing collection.
- Inactive vendors remain visible for history. Inspect them only when the user
  asks or when they are deliberately reactivated.
- Never infer aliases, accounts, models, or funding from similar names.

For a monthly close, read each active account's vendor guide as you work through
the checklist; for a scoped request, read that vendor's guide. Guides live in
`references/providers/<connector>.md`; the private vendor journal's
`vendor.connector` field gives the filename. Use that explicit value rather
than deriving a connector name from the vendor ID.

## Collection order

Choose the first source that supplies authoritative, sufficiently granular
data:

1. Supported provider API.
2. Supported CLI.
3. Available MCP or authenticated connector.
4. Provider dashboard.

Do not build a permanent provider integration for a bounded monthly task. Run
the documented command or use the dashboard directly.

Use regular Chrome for dashboard collection, not the embedded browser: the
user's saved passwords and interactive sign-in are in Chrome. Before driving
the user's Chrome, ask the user in the current session; a grant from an earlier
session does not carry over. If they decline, leave the dashboard components
open and continue with the other sources. Once granted, the workflow may use
multiple existing Google Workspace Chrome windows/profiles and prepare provider
sign-ins. First enumerate all connected Chrome instances
and their tabs. Group the private vendor journal's access targets by `workspace`
and use its account `loginEmail` to choose the intended provider login. Prefer
an existing matching provider tab; otherwise open the documented URL in an
existing Workspace profile, opening its Chrome window if needed. Do not stop
merely because no billing tab is open or ask the user to select one global
profile for every vendor.

A Chrome profile's email need not equal the provider login email. Verify the
provider's visible account and organization against the journal before collecting
data; permission to use a window does not make its current provider session the
right account. Keep that vendor's work in its verified tab and instance. Prepare
sign-in using the recorded login, then ask the user to complete any required
password, MFA or consent step in Chrome; continue independent work meanwhile.
Ask about account ambiguity only when the journal and visible account cannot
resolve it. Never substitute an agent profile with a similar name. Never store
browser-window IDs or copy cookies, passwords, session tokens or credential-reveal
URLs. This sign-in permission does not authorize secret mutations.

Use only existing authorized credentials. Creating, rotating, synchronizing,
or deploying a credential is outside collection and requires the repository's
separate secret-mutation plan and explicit scoped approval.

## Monthly result

For each active vendor and each active account, collect:

- the current cash/prepaid and promotional-credit balance when
  `balanceTracking` is true;
- the resolved close month's usage at the deepest source-backed
  grain available: model, GPU instance/workload, service/SKU, then provider
  total;
- the invoice, statement, receipt, or provider export that proves the billed
  obligation or confirms that no payment was due.

Store one balance snapshot per canonical account. Multiple grant lots use the
same checked timestamp and distinct resource IDs (`current-balance-lot`), not
an additional account-total row. Balance snapshots describe collection-time
state, independently of the selected usage month. Reuse verified snapshots
from the current UTC calendar month; after rollover, collect fresh current
snapshots and refresh the current month's forecast while retaining the resolved
close month. Never relabel current balances as historical month-end balances.
Account aliases only collapse IDs explicitly listed in the vendor journal.

Keep provider usage, provider balance, and bank payment as separate facts. A
top-up is not usage. An invoice date is not automatically the usage month. A
balance snapshot is current state, not historical burn.

- Usage `start`/`end`: actual UTC coverage, end-exclusive; never replace billing
  cycle dates with calendar-month boundaries or use collection time as coverage.
- Credit snapshot `end`: verified expiry. Blank means unknown, not unlimited.
  Use `resource_sku: current-balance-no-expiry` only with verified non-expiring
  terms. Recheck omitted/changed terms; never silently extend old credits.
  A user-approved forecast exception uses `current-balance-expiry-assumed`,
  empty `end`, and the scoped approval in evidence; it is not verified terms.
- Stripe: record `coverage_end` and `expected_accounts` for each account-month;
  partial exports must not become a completed forecast baseline at rollover.

If model or GPU detail is unavailable, preserve the exact provider total and
state the missing granularity. Never allocate a total using an internal model
name or an undocumented ratio.

## Evidence and ledgers

- `<collection-dir>` means a private, task-specific directory outside Git.
  Keep temporary originals under `evidence/`; do not recreate `ingest/data`.
  Retain source files in Drive and a resumable upload manifest before removing
  scratch. A screenshot must show the loaded value, account and selected period;
  a loading screen or another account's page is not evidence.
- Amounts live in the ledger, never in a connector guide. This repository is
  public: a guide records how to reach a number (route, URL, command, which
  column, which convention), and the ledger row carries the number itself with
  its evidence link. Do not paste balances, grants, invoice totals, spend, or
  invoice numbers with amounts into `references/`.
- Upload each new invoice/export to the accounting Google Drive immediately
  after download; verify it there before continuing to the next provider.
  Layout, file naming, month folder IDs, and the coverage check are in
  `references/drive-archive.md`.
- `economics_vendor_ledger` stores provider balances and usage facts.
  Usage is negative `paid`/`credit`; a billing refund is positive `paid`.
  Grants and balance snapshots are positive, not usage. `source` names the
  collection method (`api`, `cli`, `export`, `invoice`, `dashboard`), not the
  billing portal. Preserve signed amounts when fixing a classification.
- `economics_bank_ledger` stores Wise-backed cash movements and their evidence.
  Prefix new/reviewed evidence with `evidence_type=supplier_document` or
  `evidence_type=payment_statement`. A statement proves payment, not a supplier
  invoice. Add `evidence_requirement=payment` only after reviewing that exact
  fact as payment-only (e.g. cashback/payout). Folders/forms are not documents.
  Preserve existing lost-document exceptions. Use `invoice=<supplier-number>`
  only for a verified original supplier invoice; use `receipt=` for a receipt.
  The reconciliation table exposes invoice preview/download controls only;
  exports, payment statements and collection notes remain supporting evidence.
  Link the exact invoice where available; a legacy untyped link does not certify invoice completeness.
  For cross-currency payments, match the invoice to Wise's original/exchanged
  amount, not a monthly FX estimate. Preserve the bank debit and its fees.
  When recurring charges repeat the same amount, match each invoice by payment
  date, currency, card identity, and supplier reference; leave other charges
  unlinked until their own document is found. A verified hosted invoice or
  original receipt can support a payment, but label a blocked or absent supplier
  PDF explicitly instead of implying that it was archived.
  A split-currency card payment has multiple Bank rows but one supplier invoice.
- In staging, `economics_stripe_transactions` stores one financial fact per
  Stripe account/transaction ID. `economics_stripe_sync` records export coverage
  and row counts. Sales and reconciliation derive from these facts live, using
  Enter `stripe_event` only for payment identity. Do not append monthly summaries
  to legacy `economics_stripe_sales`; its staging rows were archived and removed.
  Production retains the old source until separately migrated. Use the validated
  collector in `operations/dashboards/economics/ingest/stripe-sync.mjs`.
- `economics_pollen_usage` stores internal Paid and Quest consumption. Reconcile
  it at provider-month grain. Pollen model ids are accounting identities as
  recorded: today's registry aliases never merge them. A provider label joins
  a Pollen model only when it equals that month's Pollen id or through the
  reviewed `modelLabels` table in `operations/dashboards/economics/provider-registry.json`.
  Add a label with the Pollen id it billed at the time, or `null` when it has
  no Pollen model. Group several ids in one entry only when they are the same
  model at the same provider billed on one line (a persona, resolution, or
  quality tier of one upstream); never group different models. Qualify the
  key as `label | sku` or `label | line item` when one label bills several
  ids on separate lines, and use dated rules (`{ "until": "2026-05", "model":
  ... }`) when a label meant a different id in a different period. Ids no
  longer in the shared registry stay valid through `retiredModels`. A Pollen
  row whose provider tag names a vendor that never billed it is re-attributed
  only through a bounded, evidenced `pollenVendorOverrides` entry (gptimage
  tagged azure-2 while billed on our Azure subscription, Jan–Apr 2026).
  Unjoined cost stays visible as needs mapping, shared upstream, or missing
  breakdown. Never spread it across models.
- D1 `user` is authoritative for creator GitHub usernames and current balances.
  Paid and Quest Pollen are non-cashable usage exposure; Paid serves the full
  catalog, Quest only the eligible catalog. Never classify either as Revenue
  Share or subtract face value from cash runway.
  A staging snapshot includes positive-balance users plus all Revenue Share
  recipients. Keep only user ID, GitHub username, both balances, and sync time;
  required name/email fields stay empty.
  Replace the staging `d1_user` snapshot rather than appending: its balance
  endpoint sums rows without deduplication. Back up the complete datasource,
  verify the explicit staging workspace, and compare imported IDs, balances,
  sync time, and endpoint totals against the approved projection.
- For a reviewed Revenue Share staging backfill, check the live datasource
  schema before choosing transport. A materialized datasource without
  JSONPaths rejects Events API NDJSON. Use Forward CLI CSV append with the
  existing schema column order and quote every field, preserving leading and
  trailing whitespace in names. Verify distinct event IDs and stored values;
  allow only Float64 serialization precision in numeric comparisons. After an
  ambiguous import error, query committed IDs before retrying. Preserve full
  raw backups and verify summary/creator totals through the app endpoint.
- `creator_payout` is a one-time Revenue Share settlement and operating expense.
- Reuse the original deterministic `entry_id` when correcting a fact. Never
  create a second identity for the same fact.
- Treat the current month as partial.

Keep ledger writes task-scoped; do not add permanent ingest code. Before a
write, query the effective datasource, save and verify a complete local backup,
and show the exact proposed rows and totals. Validate every proposed field
against the deployed datasource schema before appending; in particular,
`economics_vendor_ledger.model` is a string even when the registry maps one
provider label to several Pollen IDs. Existing `entry_id` corrections
must include the current base version, use a later `recorded_at`, and preserve
immutable identity fields. Append only after explicit approval for the named
batch and environment, then re-query every written ID and save a verified
after-snapshot. Check the ingest response's `successful_rows` and
`quarantined_rows` against the submitted count; on any quarantine, inspect
the affected IDs and correct only rejected rows. Never resend accepted rows.
Validate staging first; production requires separate approval.

Staging verification uses
`operations/dashboards/economics/secrets/web.dev.json:TINYBIRD_ECONOMICS_READ_TOKEN`.
Never use deprecated `TINYBIRD_OPS_READ_TOKEN` to verify the Economics staging
app; it can resolve to another workspace. Use the scoped ingest token only for
raw datasource backup/read and the approved append.

## Completion

Maintain the workflow as it is used: replace an outdated procedure in its
owning guide after verifying the correction. Keep shared rules here, provider
routes in their guides/journals, and task facts in the private checklist. Remove
superseded or duplicate instructions; do not accumulate incident narratives.
Updates should state the action, required evidence and stopping condition.

A provider-month is complete only when every required checklist component is
verified or has an explicitly reviewed not-applicable reason. A missing source,
unknown credit term, pending invoice or unresolved model mapping stays open.

After writes, re-query effective rows and verify the rendered Close, Runway,
model-reconciliation and Ledger views. Refresh the user's existing local staging
tab, preserving its view and filters, and verify its displayed counts; a new test
tab does not refresh the user's in-memory snapshot. Compare the remaining alerts and cost
residuals with the checklist; every one must have evidence and a next action or
a concrete blocker. Archive the updated report and screenshots to Drive.

Continue while authorized actionable work remains. If the remaining work needs
user input, batch approval or an unavailable external document, report the
specific dependencies, work completed, and next actions; call the close
provisional. Use "batch verified" for an import milestone and "monthly close
complete" only when the whole requested close meets these criteria. Keep
production publication separate and subject to its own approval.
