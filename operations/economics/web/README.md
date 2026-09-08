# Economics Web

Economics UI for `economics.myceli.ai` and `economics.pollinations.ai`, backed
by Economics Tinybird pipe outputs in `enter.pollinations.ai/observability/`.
The app has three operating views:

- **Insights:** Runway, Close, and Balances.
- **Unit economics:** Vendors, Inference, GPUs, and Revenue Share.
- **Ledgers:** Bank, Vendor, Pollen, and Revenue Share.

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

The app requires its own `POLLINATIONS_AUTH_SESSION_SECRET` and
`TINYBIRD_ECONOMICS_READ_TOKEN`. Local development must use the staging reader
from `../secrets/web.dev.json`, never the production reader. These credentials
require separate approval before provisioning; never reuse KPI's signing secret.
Private reads use same-origin `/api/economics/pipes/:pipe`, protected by the
app's session. Each protected request rechecks current admin status with Enter;
demotion, bans and token revocation deny access. Sessions expire after 12 hours.
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
activity: separate Pollen/Ko-fi gross sales, refunds, and reversals. Processing
fees are an Operations expense; Wise payouts remain cash movements only.
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
