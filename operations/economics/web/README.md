# Economics Web

Economics UI for `economics.myceli.ai` and `economics.pollinations.ai`, backed
by Economics Tinybird pipe outputs in `enter.pollinations.ai/observability/`.
The app has three operating views:

- **Insights:** Trends, Runway, Reconciliation, and Balances. Trends defaults to
  the latest six completed months, with 3 / 6 / 12 month controls and no history
  before January 2026. Summary cards total the selected period; chart month
  selection changes only the monthly details. The page combines company and API
  results, expense categories, credit funding, and Paid/Quest usage using the
  same revenue, cost and credit calculations as Runway.
- **Unit economics:** Vendors, Inference, GPUs, and Revenue Share.
- **Ledgers:** Sales, Bank, Vendor, Pollen, and Revenue Share. Sales shows existing monthly Stripe facts by stream and settlement currency; closed-month coverage gaps link to Sales from Reconciliation.

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
node ../node_modules/@cloudflare/vite-plugin/node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --env local --persist-to frontend/.wrangler/state
node ../node_modules/@cloudflare/vite-plugin/node_modules/wrangler/bin/wrangler.js d1 execute DB --local --env local --persist-to frontend/.wrangler/state --command "UPDATE oauth_client SET redirect_uris='[\"http://localhost:4180/auth/callback\"]' WHERE id='internal-economics';"
```

Vite's root is `frontend/`; migrating the service-root `.wrangler/state`
database does not initialize the running sign-in service. These commands affect
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
loads only the staging reader; it never reads production secrets.
Deploy Enter's client registration first, provision approved app secrets, then
build and deploy the Economics Worker through GitHub Actions.

## Fixtures Mode

`http://localhost:4180/?fixtures=1` renders bundled sample data after admin sign-in,
without fetching live ledger data.

## Data Contract

Reads Economics pipes from `enter.pollinations.ai/observability/endpoints/`:
`economics_bank_ledger_api`, `economics_vendor_ledger_api`,
`economics_pollen_usage_api`, `economics_revenue_share_api`, and
`economics_stripe_sales_api`, plus `economics_user_balances_api`. Revenue Share uses a deduplicated event
materialization so the economic view and its compact source ledger share one
calculation path. Creator usernames and current Paid/Quest balances come from
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
Collection retains reviewed business Drive checks in
`economics_private_config.reconciliation.archiveChecks`, scoped by provider,
account and service month. Each check records `checkedAt`, `status` (`found`,
`partial`, `not_found` or `blocked`), a short `note`, and exact archived
`evidence` links. Collection updates these through the normal named-batch
approval flow; there is no live Drive sync. The reconciliation table shows only compact preview/download actions for the
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
come from authenticated `economics_private_config_api`; there is no stored
OP Forecast ledger. Usage-based projections consume each account's checked
prepaid/credit balance and each funding lot's verified expiry. A scoped
user-approved ignore-expiry assumption remains visibly distinct from verified
terms. Unknown credit terms, incomplete
Stripe coverage, and unmatched opening postpaid bills remain explicit gaps.
Current Wise balance snapshots are verification
only and are not stored as a second balance ledger. Revenue and Stripe fees use
Stripe activity rather than Wise payout timing, while Cash change and Cash
balance remain anchored to Wise; processor settlement timing bridges the two.
Unspent Paid and Quest Pollen appear separately
as non-cashable future usage exposure and are not deducted from cash runway.
