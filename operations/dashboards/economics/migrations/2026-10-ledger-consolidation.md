# Economics ledger consolidation — PR #17614

One migration, with prepare, verify, switch and cleanup phases. This runbook
replaces the exploratory staging steps; do not replay their temporary scripts.
No production command has been run for this preparation. Production execution,
resource deletion and new credential bindings require their separate approvals.

## Final sources

| Before | After | Preservation check |
| --- | --- | --- |
| `economics_compute_ledger` and its API | `economics_vendor_ledger` and its API | Every raw version, including tombstones; exact common-column comparison before retiring the old source |
| `economics_private_config` forecast amounts | Vendor `type=planned` rows | Same signed native-currency amounts, dates, cadence and settlement links; zero `paid`/`credit` |
| Private-config invoice/report comparisons | Vendor `type=statement` rows | Same statement amount, comparison basis and exact linked entry IDs; zero `paid`/`credit` |
| Private-config sales classifications | Existing Stripe balance-transaction IDs | One classification/evidence attachment per account and transaction; no extra financial row |
| Private-config notes and vendor details | Existing private Drive vendor journals | One file per canonical vendor; rules and notes retained once, no duplicate monetary plans |
| `economics_stripe_sales` monthly summaries | `economics_stripe_transactions` + `economics_stripe_sync`, queried by the existing Sales API | Exact closed-month financial and count comparison by account/stream/currency |

Bank, Pollen, user balances and revenue-share sources remain. Preserve their
materializations and the active `economics_stripe_sales_api` endpoint.
Reconciliation is derived by the app, never migrated into a saved issue table.
Model IDs and historical mappings stay in the repository. Contract terms,
account details, invoices, real balances and reviewed financial evidence stay
out of Git.

## 1. Prepare and record the starting point

- Freeze Economics collectors for the target workspace during the migration.
- Record the approved Git SHA, target workspace, current Tinybird deployment,
  active Worker version and the existing authenticated reader's endpoint list.
- Verify the workspace through `/v1/workspace` with the explicit operator token.
  Never select a workspace from `.tinyb` or use an Enter runtime deploy token.
- Export schemas, all raw versions and effective outputs for every affected
  source into private Finance evidence. Use a lossless format (Parquet) for
  timestamps/numbers. Record row counts and checksums. Export the current private
  config and reference the existing Drive journals; do not copy them into Git.
- Snapshot every historical month in native currency: Bank movements and cash,
  Vendor paid/credit totals, sales/fees/refunds/reversals, retained Paid Pollen,
  Quest usage and creator shares. Separately capture forecasts and known gaps.
  Unknown values must remain unknown throughout the comparison.
- Inspect all actual readers and writers, including the current production
  revision, before removing any source. A repository search alone does not prove
  a retired endpoint has no external consumer.

## 2. Add replacements without deleting the originals

Use the Tinybird Forward CLI from `enter.pollinations.ai/observability`, with
an explicit workspace-scoped `TB_TOKEN` and regional host. Work from the final
merged revision for release. For the additive phase, retain the target's old
three datasource definitions and two retired endpoint definitions in a temporary
private deployment directory alongside the new definitions. Keep the old Sales
API until its replacement data passes the checks below. Review the entire change
table; stop for changes outside this PR.

```sh
tb --cloud --host https://api.europe-west2.gcp.tinybird.co deployment create --check --no-allow-destructive-operations
tb --cloud --host https://api.europe-west2.gcp.tinybird.co deployment create --wait --no-allow-destructive-operations
```

These commands create an unpromoted deployment. Do not add `--auto` or promote
without the separately authorized release step. Confirm how writes/readers target
that deployment before importing any rows; never mix base and preview data.

- Copy only missing raw Compute versions into Vendor, preserving every original
  field and `recorded_at`. New nullable fields remain null; arrays empty and
  strings empty. Compare any existing `(entry_id, recorded_at)` before appending;
  identical versions are skipped, conflicting versions stop the migration.
  Never overwrite a newer target correction or replace the whole Vendor ledger.
- Transform each monetary private-config item once into a stable planned or
  statement entry. Prepare a private old-item → new-entry-ID manifest, including
  explicit dispositions for obsolete items. Validate with `validateVendorPlan`,
  `ledgerForecastRules` and the source-statement checks. Do not guess missing IDs.
- Reuse the already prepared vendor journals. Compare their contents to the
  target's latest configuration before retiring it. Keep exact review notes and
  evidence links; verify `assembleVendorJournals`, `initializeProviderRegistry`
  and `parsePlanningDocument` accept the complete source.
- Import reviewed Stripe balance transactions for every required historical
  account/month, deduplicated by `(account_id, transaction_id)`. Preserve existing
  classifications. Verify integer minor-unit `net = amount - fee` for every row.
  Publish collection receipts only after source counts and amounts pass. Do not
  infer complete coverage from a nonempty table.
- Reuse Enter's existing production `stripe_event` for payment identity. Do not
  mirror it back into production or add its amounts to Stripe financial totals.
  The staging mirror contains payment identity only, not full webhook payloads.
- `ingest/stripe-sync.mjs` is deliberately staging-only. Production requires a
  reviewed import of its exact normalized export, not removing the workspace
  guard or substituting a production token. Keep Ko-fi final settlement coverage
  open until verified, even though new sales have stopped.

## 3. Verify before switching readers

Require all of these; a matching grand total alone is insufficient:

- Raw Compute history is a lossless subset of Vendor history; every tombstone is
  retained. Effective rows match by stable ID, with separately approved target
  corrections listed individually. No duplicate/conflicting version was added.
- Every old monetary/config item has one disposition in the private manifest.
  Plans and statements have zero booked cash/cost; settlements point to real
  Bank IDs. No financial plan is also stored in a journal rule.
- Stripe gross sales, refunds, reversals, fees, net, payments and refund counts
  match the archived monthly summaries by month, stream and currency. Compare
  in minor units; do not round away a difference. Explain and approve any real
  correction separately. Do not delete a summary with unmatched coverage.
- Compare all recorded historical totals from step 1. A ledger correction such
  as the approved October rent import is a separate, documented delta—not a
  silent migration difference. Current-month incomplete coverage remains open.
- Run the public CI compatibility suite (no Drive access), full Economics suite
  with the live private source, Stripe sync tests, TypeScript, build and the
  existing `scripts/check-tinybird-contract.mjs` against the target reader.
- Verify unauthenticated `/api/economics/vendor-journals`, private pipe reads and
  private assets are denied; verify the approved admin session can read the
  journals and all required pipes. Check historical Runway, Inference, GPUs,
  balances and vendor reconciliation in the dashboard.
- Confirm the Worker has the approved read-only Drive binding and folder access
  before deployment. Missing access blocks release; never use a public document
  or repository copy as a fallback.

## 4. Switch and clean up as the final phase

After the comparison report and release are approved, activate the new endpoints
and deploy the application through the production GitHub Actions workflow from
`production`. Verify the active Worker and both Economics domains. Only then
retire old consumers and approve exactly this cleanup:

- Datasources: `economics_compute_ledger`, `economics_private_config`,
  `economics_stripe_sales`.
- Endpoints: `economics_compute_ledger_api`, `economics_private_config_api`.
- No materialization deletion; no deletion of `economics_stripe_sales_api`.

Validate the final repository definitions again, inspect the deletion list, and
use `--allow-destructive-operations` only for this approved list. Recheck the
six active read contracts and financial comparisons after cleanup. Record one
migration completion receipt with Git/deployment versions, comparisons and
private evidence links. Do not replay this migration on subsequent deployments.

## Recovery and resume

If any check fails, keep the old sources/readers active and stop before cleanup.
Retain exact import receipts and compare target rows before retrying; never
blindly resend a partially accepted append. Restore old endpoint definitions
and the previously active Worker when reversing a reader switch. After cleanup,
recreate the old schemas and restore the raw backups before rolling back the
old app. Drive journal history remains available; never overwrite it with an
older snapshot during rollback.

## Preparation status — 17 October 2026

- Staging has the final source layout; Forward CLI validation reports no resource
  or token changes. The two existing materialization `alter` warnings are outside
  this migration and are not a reason to delete those materializations.
- Historical Stripe staging comparison previously matched 176 financial/count
  values across 22 January–September rows. October is partial.
- Production import, its current-source comparisons, binding verification and
  cleanup are still release gates. This runbook is prepared, not an assertion
  that those production checks have already passed.
