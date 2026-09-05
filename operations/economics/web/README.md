# Economics Web

Economics UI for `economics.myceli.ai` and `economics.pollinations.ai`, backed
by Economics Tinybird pipe outputs in `enter.pollinations.ai/observability/`.
The app has three operating views:

- **Insights:** Runway, Close, and Balances.
- **Unit economics:** Vendors, Inference, GPUs, and Revenue Share.
- **Ledgers:** Bank, Compute & Infra, Pollen, and Revenue Share.

## Run

```bash
npm install
npm run dev
```

The dev server is pinned to `http://127.0.0.1:4180`.

Auth uses a password gate backed by the Cloudflare Worker. For local development,
the shared password and the staging-only Tinybird reader are assembled from
`../secrets/web.json` and `../secrets/web.dev.json` into the ignored `.dev.vars`
file. Production deployment continues to use `../secrets/web.json`. No secret is
bundled or stored in the browser.

## Fixtures Mode

`http://127.0.0.1:4180/?fixtures=1` renders bundled sample data with no password
and no network calls.

## Data Contract

Reads Economics pipes from `enter.pollinations.ai/observability/endpoints/`:
`economics_bank_ledger_api`, `economics_compute_ledger_api`,
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
aliases never merge them, and unjoined cost stays visible as needs mapping,
shared upstream, or missing breakdown rows rather than spread across models.
Collection and correction conventions live in
`.claude/skills/economics-provider-collection/SKILL.md` at the repository root.
Each view loads only its required endpoints. An unrelated endpoint failure does
not block other views. Refresh retains the selected view and reporting month.

The app is a read-only mirror; all reads go through the Worker proxy. In
deployed environments the Worker authenticates every request before serving
the SPA shell or any static asset, so private forecast assumptions and
reconciliation explanations cannot be downloaded before login. Localhost keeps
direct asset access for development and fixture mode. The public workers.dev
origin is disabled; only the two configured custom domains serve the app.
Production deployment stops before changing the Worker unless all required
pipes already respond from the production Tinybird workspace. Deploy and verify
Tinybird schema changes before promoting a Worker that reads them.

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
