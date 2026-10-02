---
name: economics-provider-collection
description: Collect and reconcile Pollinations Economics vendor balances, monthly usage, invoices, and provider evidence using the best available API, CLI, MCP, or authenticated dashboard.
---

# Economics provider collection

Use this skill when the user asks to refresh vendor data, inspect provider
accounts, prepare a monthly close, or reconcile provider cost with Pollen.

## Monthly Economics close entrypoint

When asked to close Economics, use the requested completed UTC calendar month,
or the last completed UTC month if none is named. Run the whole app close. Do
not interpret the request as a single-vendor refresh or stop after a staging
endpoint count.

1. Open the Economics dashboard's Close, Runway, Unit Economics, and Ledgers
   views and record what is missing or stale. Read the current registry and
   the app's source contracts in `operations/economics/web/src/App.tsx` and
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

## Source of truth

Read `operations/economics/provider-registry.json` first.

- The registry owns canonical vendor IDs, aliases, account lifecycles,
  active monthly-review status, balance-tracking decisions, access URLs, and
  workspace domains. It is also the only vendor list: every bank or Runway
  counterparty is registered with its business `category` (`compute`,
  `infrastructure`, `development`, `operations`, `revenue_share`, `office`,
  `admin`, `payroll`), optional `cashRules` (bank-description rules for mixed
  vendors) and `runwayLine`. A new vendor in a bank statement needs a registry
  entry before its cash can be categorized.
- A vendor is in a month’s normal review only when `monthlyReview: true` and
  that month is within its `activeFrom`/`activeTo` bounds (inclusive). Apply
  the same month bounds to each account. Record excluded vendors with the
  lifecycle reason in the coverage manifest so a stale review flag is not
  mistaken for a missing collection.
- Inactive vendors remain visible for history. Inspect them only when the user
  asks or when they are deliberately reactivated.
- Never infer aliases, accounts, models, or funding from similar names.

Then read only the requested vendor guide in
`references/providers/<connector>.md`. The registry's `connector` field gives
the filename. Dots in vendor IDs use dashes when the registry says so.

## Collection order

Choose the first source that supplies authoritative, sufficiently granular
data:

1. Supported provider API.
2. Supported CLI.
3. Available MCP or authenticated connector.
4. Provider dashboard.

Do not build a permanent provider integration for a bounded monthly task. Run
the documented command or use the dashboard directly.

For dashboard collection, group registry access targets by `workspace`. Open
all URLs for one workspace together. First enumerate the connected browser
windows, then use only the window whose visible email and organization match
the registry target. Stop if the match is ambiguous. Never store browser-window
IDs or copy cookies, passwords, session tokens, or credential-reveal URLs.

Use only existing authorized credentials. Creating, rotating, synchronizing,
or deploying a credential is outside collection and requires the repository's
separate secret-mutation plan and explicit scoped approval.

## Monthly result

For each active vendor and each active account, collect:

- the current cash/prepaid and promotional-credit balance when
  `balanceTracking` is true;
- the last completed UTC calendar month's usage at the deepest source-backed
  grain available: model, GPU instance/workload, service/SKU, then provider
  total;
- the invoice, statement, receipt, or provider export that proves the billed
  obligation or confirms that no payment was due.

Store one balance snapshot per canonical account. Multiple grant lots use the
same checked timestamp and distinct resource IDs (`current-balance-lot`), not
an additional account-total row. A snapshot collected during
the current calendar month closes the previous month; do not require repeated
checks during that same close cycle. Account aliases only collapse IDs that are
explicitly listed in the registry.

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
  Preserve existing lost-document exceptions. Link the exact invoice where
  available; a legacy untyped link does not certify invoice completeness.
  For cross-currency payments, match the invoice to Wise's original/exchanged
  amount, not a monthly FX estimate. Preserve the bank debit and its fees.
  When recurring charges repeat the same amount, match each invoice by payment
  date, currency, card identity, and supplier reference; leave other charges
  unlinked until their own document is found. A verified hosted invoice or
  original receipt can support a payment, but label a blocked or absent supplier
  PDF explicitly instead of implying that it was archived.
  A split-currency card payment has multiple Bank rows but one supplier invoice.
- `economics_stripe_sales` stores reviewed Stripe account-month-currency sales,
  refunds, reversals, fees, stream, and coverage. It never stores customer or
  payment payloads.
- `economics_pollen_usage` stores internal Paid and Quest consumption. Reconcile
  it at provider-month grain. Pollen model ids are accounting identities as
  recorded: today's registry aliases never merge them. A provider label joins
  a Pollen model only when it equals that month's Pollen id or through the
  reviewed `modelLabels` table in `operations/economics/provider-registry.json`.
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
`operations/economics/secrets/web.dev.json:TINYBIRD_ECONOMICS_READ_TOKEN`.
Never use deprecated `TINYBIRD_OPS_READ_TOKEN` to verify the Economics staging
app; it can resolve to another workspace. Use the scoped ingest token only for
raw datasource backup/read and the approved append.

## Completion

A provider-month is complete only when account coverage, provider usage, and
required invoice/statement evidence are all accounted for. Report missing
sources directly; do not hide them with estimates or fallbacks.
