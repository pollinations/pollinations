# Economics Web

Economics UI for `economics.myceli.ai` and `economics.pollinations.ai`, backed
by Economics Tinybird pipe outputs in `enter.pollinations.ai/observability/`.
The main drawer contains Trends, Runway, Balances, Providers, Inference, GPUs
and Revenue Share. The account menu contains Reconciliation, the raw Bank,
Vendor and Pollen ledgers, and the private Finance evidence link.

Reconciliation joins vendor accounts, journal notes and live checks on one page.
The drawer badge shows recorded bank money to reconcile and all open checks for
the year; known limitations are excluded. Pro restores small rows and exact
decimals. There are no separate Sales, Journal, Vendor Directory or Revenue
Share ledger pages. Sales is a calculation input, not another stored ledger.

## Run

```bash
npm install
npm run dev
```

The dev server uses `http://localhost:4180`; run Enter on port 3000.
KPI, Economics and Observability share the same sign-in page, provider button
and admin-only OAuth session implementation. “Sign out” clears only the current
app's session. No generation key or Pollen permission is requested.

In local `.dev.vars`, use `POLLINATIONS_AUTH_BASE_URL=http://localhost:3000`
and `TINYBIRD_POLLEN_PIPE=economics_pollen_usage_snapshot_api`.
Register `http://localhost:4180/auth/callback` on the local Economics OAuth
client. The production registration accepts only the HTTPS app callback.

Before the first local sign-in, initialize Enter's **Vite** database. Run these
commands from `enter.pollinations.ai/`, using the Wrangler bundled with Vite's
Cloudflare plugin so the CLI and dev server use the same database format:

```bash
node ../node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --env local --persist-to .wrangler/state
node ../node_modules/wrangler/bin/wrangler.js d1 execute DB --local --env local --persist-to .wrangler/state --command "UPDATE oauth_client SET redirect_uris='[\"http://localhost:4180/auth/callback\"]' WHERE id='internal-economics';"
```

Enter's Vite configuration explicitly persists the database at the service-root
`.wrangler/state`, regardless of its frontend root. These commands affect
only the disposable local database and reuse the existing public OAuth client.

A first GitHub sign-in creates a new local user with the default `user` role;
production admin roles are not copied. If Economics denies that account, verify
its GitHub identity and existing production admin role before requesting scoped
approval to set that same local user's role to `admin`. Keep the app's admin
checks enabled; never grant all local users admin access.

The app requires its own `POLLINATIONS_AUTH_SESSION_SECRET` and
`TINYBIRD_ECONOMICS_READ_TOKEN`. Local development must use the staging reader
from `../secrets/web.dev.json`, never the production reader. These credentials
require separate approval before provisioning; never reuse KPI's signing secret.
Private reads use same-origin `/api/economics/pipes/:pipe`, protected by the
app's session. Protected requests recheck current admin status with Enter once per
60-second cookie window; demotion, bans and token revocation deny access at the
next check. Temporary Enter failures return 503 without clearing the session. Sessions expire after 12 hours.
The identity token is encrypted inside the HttpOnly cookie.
`npm run decrypt-vars` preserves the separately approved app signing secret and
loads the staging reader and approved read-only Drive credential from encrypted
`../secrets/web.dev.json`; it does not decrypt the production configuration.
The approved read-only Drive service account is shared with production; the
Tinybird reader remains staging-only. Missing Drive
configuration stops startup before replacing the existing local configuration.
Deploy Enter's client registration first, provision approved app secrets, then
build and deploy the Economics Worker through GitHub Actions.

## Fixtures Mode

`http://localhost:4180/?fixtures=1` renders bundled sample data after admin sign-in,
without fetching live ledger data.

Completed vendor journal snapshots are cached in private Worker memory for up
to 24 hours. Pending reads stay within their own request, so an interrupted
load cannot block later requests. Loads have a one-minute deadline; the browser
offers Retry journals after 75 seconds if the request does not complete.
An older load cannot replace a newer refresh. Admin authentication still runs
before every API request, and HTTP responses remain `private, no-store`.
Failed reads are not cached; a failed refresh preserves the previous snapshot
until its original expiry. A cold Worker still reads Drive normally.

Within an open dashboard, tabs reuse a complete financial snapshot for up to
one hour. The small Updated timestamp records when that financial snapshot was
fetched, not the accounting period it covers. Refresh data reloads the dashboard,
bypassing the journal cache and fetching fresh Tinybird data so vendor rules and
calculations are rebuilt together. Ordinary reloads fetch fresh Tinybird data
but reuse cached journals. No private data is cached in browser storage.

## Data Contract

Reads Economics pipes from `enter.pollinations.ai/observability/endpoints/`:
`economics_bank_ledger_api`, `economics_vendor_ledger_api`,
`economics_pollen_usage_api`, `economics_revenue_share_api`, and
`economics_stripe_sales_api`, plus `economics_user_balances_api`. Revenue Share uses a deduplicated event
materialization for the single Revenue Share insight. Creator usernames and current Paid/Quest balances come from
the daily D1 user snapshot; only aggregate balances reach the Runway API.
Stripe P&L revenue comes from reviewed account balance
activity: separate Pollen/Ko-fi gross sales, fees, refunds, and reversals.
Fees and refunds reduce revenue in the month recorded; Wise payouts remain
cash movements only.
Production reads live
materializations; local development reads their verified staging copies.
Inference model costs join provider ledger labels to Pollen models only by
exact Pollen id or through the reviewed `modelLabels` table in
`../provider-registry.json`; Pollen ids stay split as metered, today's registry
aliases never merge them, Pollen ids that a provider bills on one line form
one grouped row, and unjoined cost stays visible as needs mapping or missing
breakdown rows rather than spread across models.
Collection and correction conventions live in
`.claude/skills/economics-provider-collection/SKILL.md` at the repository root.
Vendor definitions, accounts and notes come from the private
[Vendor journals folder](https://drive.google.com/drive/folders/1GnyBRJEGtuZjdJl9qrBapH6jfUpmG9ei), one `<vendor-id>.json` per vendor.
Reconciliation presents one expandable row per vendor, joining open checks,
account cards and journal notes with links to the original Drive files. The
separate Journal and Vendor directory pages have been removed. Cards join the existing
ledger balance snapshots and journal evidence-check history; open checks
come from the same reconciliation calculation. Snapshot dates never imply
reviewed monthly coverage, and unknown accounts are not matched by guess.
Invoices & evidence opens the Finance
folder. No document copies are stored in the dashboard; financial amounts
remain in the ledgers.

`npm test` reads the vendor journals once to build a definition snapshot with the existing local
`.dev.vars` Drive credential. For an offline or CI run, set
`ECONOMICS_VENDOR_DETAILS_FILE` to an explicitly supplied JSON source snapshot;
no second catalog is checked into the repository. Never put credentials in
that file. Production builds do not read Drive; the signed-in app does.

Collection retains reviewed business Drive checks in
each vendor journal (`reviewNotes.archiveChecks`), scoped by provider,
account and service month. Each check records `checkedAt`, `status` (`found`,
`partial`, `not_found` or `blocked`), a short `note`, and exact archived
`evidence` links. Collection updates these through the normal named-batch
approval flow. The app reads the vendor journals folder; it does not scan or synchronize the rest of Drive. The reconciliation table shows only compact preview/download actions for the
verified supplier invoices already linked to the records. Receipts, exports and
account/date/status notes stay in private collection metadata.
These observations annotate open issues only and never change financial
calculations, coverage or issue counts.
Remove or refresh obsolete checks during the next collection.

Each view loads only its required endpoints. An unrelated endpoint failure does
not block other views. Refresh retains the selected view and reporting month.

The sign-in shell is public. Provider registry evidence is isolated in a
`/private/` bundle chunk, served only after admin authentication with private,
no-store caching. Real ledger data and forecast assumptions use protected read
endpoints. Deployment validates the Tinybird contract before uploading the Worker
with its approved production secrets; secret synchronization requires approval.

Runway reconstructs cash from one statement-backed opening-balance row in
`economics_bank_ledger` plus later bank movements. Closed months are actuals. The
open month shows actual cash to date beside the calculated full-month plan;
month-end cash applies only its unspent/unreceived remainder. Forecast rules
combine non-posting `type=planned` Vendor rows with the private Drive document.
`plan_amount` is signed cash, `plan_category` selects the Runway line, and
`plan_cadence` is `monthly` or `once`. `start`/`end` are month bounds;
`settled_by_entry_ids` must match Bank before a one-off is treated as settled.
Plans always have zero `paid` and `credit` and are excluded from actual usage,
provider coverage and cash. Forecast amounts are never duplicated in Drive.
The document holds sales stop dates, review explanations and explicit
`known_limitation` decisions. These do not verify missing costs or usage.

The protected `/api/economics/vendor-journals` route reads the fixed Vendor
journals folder with the existing server-only `ECONOMICS_GOOGLE_DRIVE_CREDENTIALS`
binding. It lists every page and reads every vendor file, with bounded parallel
requests, then combines them in memory. The signed-in app validates the complete
catalog and journal before calculations load, and reuses that snapshot while
navigating. Reload to read updates; no combined file or database copy is stored.
Missing, malformed or duplicate vendor files block loading instead of silently
losing rules. The old single-file planning binding is no longer used.
Credential setup still requires separate approval.
The old `economics_private_config` datasource and endpoint were removed from
staging after the authenticated reader and unchanged totals were verified.
Production migration is separate and has not been authorized.

Usage-based projections consume each account's checked
prepaid/credit balance and each funding lot's verified expiry. A scoped
user-approved ignore-expiry assumption remains visibly distinct from verified
terms. Unknown credit terms, incomplete
Stripe coverage, and unmatched opening postpaid bills remain explicit gaps.
Current Wise balance snapshots are retained as non-posting statement confirmations
in Bank; they verify reconstructed cash without becoming another opening balance. Revenue and Stripe fees use
Stripe activity rather than Wise payout timing, while Cash change and Cash
balance remain anchored to Wise; processor settlement timing bridges the two.
Unspent Paid and Quest Pollen appear separately
as non-cashable future usage exposure and are not deducted from cash runway.

## Release checks

Use the single [ledger consolidation migration](../migrations/2026-10-ledger-consolidation.md).
It includes historical comparisons, rollout ordering, cleanup and recovery; no
production migration runs automatically from this PR.

Public CI tests repository model mappings with artificial vendor definitions via
`apps/model-compatibility.vitest.config.ts`; it needs no Drive credential.
The full `npm test` run remains an authenticated integration check against Drive
(or an explicitly supplied private snapshot), including the real-account and
forecast contracts in `*.integration.test.ts`. Run it before deployment; a green
public CI run alone does not establish private-data or production readiness.
