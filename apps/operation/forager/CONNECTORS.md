# Forager Connector Tracker

Forager's live inventory of every cost/credit signal and how it reaches Tinybird. Three sections: programmatic connectors (auto on each run), blocked connectors (ships but needs operator action), and manual monthly (no API — read the console, enter via `ingest.record`).

---

## Programmatic connectors

Auto-fetched by `python3 -m ingest.run`. Each connector is wrapped in try/except — a single failure does not kill the run; status per connector is logged to `ingest_runs`.

### Balance connectors (BALANCE registry)

| Provider | What it fetches | Endpoint / CLI | Creds keys | Funding class | Verified |
|---|---|---|---|---|---|
| **openrouter** | total_credits (granted), total_usage (spent), derived left | `GET https://openrouter.ai/api/v1/credits` | `OPENROUTER_MANAGEMENT_API_KEY` | grant | 2026-07-03 |
| **deepinfra** | stripe_balance (negated → prepaid_left_usd) | `GET https://api.deepinfra.com/v1/me?checklist=true` | `DEEPINFRA_API_KEY` | prepaid | 2026-07-03 |
| **runpod** | clientBalance (prepaid), currentSpendPerHr (note) | `POST https://api.runpod.io/graphql` (GraphQL) | `RUNPOD_API_KEY` | prepaid | 2026-07-03 |
| **scaleway** | Σvalue (granted), Σvalue_used (spent), Σvalue_remaining (left) | `GET https://api.scaleway.com/billing/v2beta1/discounts?organization_id={org}` | `SCW_SECRET_KEY`, `SCW_ORGANIZATION_ID` | grant | 2026-07-03 |
| **digitalocean** | month_to_date_usage (spent), account_balance<0 → left | `GET https://api.digitalocean.com/v2/customers/my/balance` | `DIGITALOCEAN_TOKEN` | prepaid | see Blocked |
| **daytona** | balanceCents/100 (prepaid_left_usd) | `GET https://app.daytona.io/api/api-keys/current` (validity) + `GET https://billing.app.daytona.io/v2/organization/{org}/wallet` | `DAYTONA_API_KEY`, `DAYTONA_ORGANIZATION_ID` | prepaid | 2026-07-03 |
| **ovhcloud** | STARTUP_PROGRAM balance (EUR×fx→USD), VOUCHER movements → granted, expiry note | `GET https://eu.api.ovh.com/1.0/me/credit/balance/STARTUP_PROGRAM` (HMAC-signed) | `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY` | grant | 2026-07-03 |
| **vast.ai** | credit (prepaid) | `vastai show user --raw` (CLI reads `~/.config/vastai/vast_api_key`) | — (CLI manages auth) | prepaid | 2026-07-03 |
| **fireworks** | per-account balance split into prepaid (FIREWORKS_PREPAID_ACCOUNT_IDS) vs grant (all others) | `firectl account list --api-key … --output json` + `firectl account get --api-key … --account-id …` | `FIREWORKS_API_KEY`, `FIREWORKS_PREPAID_ACCOUNT_IDS` (opt, default "pollinations") | prepaid + grant | 2026-07-03 |
| **openai** | cumulative spend from grant start → derived left (granted is HC, see Settled Questions) | `GET https://api.openai.com/v1/organization/costs` (paginated, 1d buckets) | `OPENAI_ADMIN_KEY`, `OPENAI_GRANT_USD` (opt), `OPENAI_GRANT_START` (opt) | grant | 2026-07-03 |
| **azure** | estimatedBalance (left_usd) via service principal client-credentials flow | `POST https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token` → `GET https://management.azure.com/providers/Microsoft.Billing/billingAccounts/{BA}/billingProfiles/{BP}/providers/Microsoft.Consumption/credits/balanceSummary?api-version=2023-11-01` | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_BILLING_ACCOUNT`, `AZURE_BILLING_PROFILE` | grant | 2026-07-03 |

### Meter connectors (METER registry)

| Provider | What it fetches | Endpoint / CLI | Creds keys | Funding class | Verified |
|---|---|---|---|---|---|
| **deepinfra** | metered cost per month (cents÷100, epoch-second windows) | `GET https://api.deepinfra.com/payment/usage?from={epoch}&to={epoch}` | `DEEPINFRA_API_KEY` | prepaid | 2026-07-03 |
| **vast.ai** | charge-type invoice rows grouped by UTC month | `vastai show invoices --raw` (CLI) | — (CLI manages auth) | prepaid | 2026-07-03 |
| **ovhcloud** | USE-type credit movements per month (EUR×fx→USD) | `GET https://eu.api.ovh.com/1.0/me/credit/balance/STARTUP_PROGRAM/movement` (HMAC-signed, per-movement detail fetches) | `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY` | credit | 2026-07-03 |
| **fireworks** | POSTPAID_BILLING+PAID invoices; invoice date 1st of month → usage month is month−1 | `firectl billing list-invoices --api-key …` (CLI) | `FIREWORKS_API_KEY` | cash | 2026-07-03 |
| **aws** | pass 1: gross usage before credits (excludes Credit+Refund record types) → cash; pass 2: RECORD_TYPE=Credit absolute value → credit burn | `aws ce get-cost-and-usage --granularity MONTHLY` (CLI, ambient Myceli-direct profile) | — (ambient AWS CLI profile) | cash + credit | 2026-07-03 |
| **google** | BQ billing export: gross_eur (cash) + abs(credits_eur) (credit), EUR×fx→USD | `gcloud auth activate-service-account --key-file={sa_json}` + `bq query … FROM billing_export.gcp_billing_export_resource_v1_{BA}` | `GCP_BILLING_SA_JSON` (SA JSON string in SOPS) | cash + credit | 2026-07-03 |
| **openai** | daily cost buckets grouped by month (rides grant → credit) | `GET https://api.openai.com/v1/organization/costs` (paginated, same as balance connector) | `OPENAI_ADMIN_KEY`, `OPENAI_GRANT_START` (opt) | credit | 2026-07-03 |

---

## Blocked connectors

Connectors that ship in the codebase but return errors until an operator action is taken. Failures are soft — the run continues.

| Provider | Error | Operator action required |
|---|---|---|
| **digitalocean** | `GET /v2/customers/my/balance` returns 403 | Ask the team owner to bump Elliot's role to Owner, Biller, or Billing-Viewer on the DigitalOcean team account. The token (`DIGITALOCEAN_TOKEN`) is already in SOPS. |
| **aws (Automat-IT / Umbrella reseller API)** | Tenant-gated — the reseller API requires Elliot's account to be enabled | Elliot is asking Automat-IT (Tiago Falcao / FinOps) to enable `elliot@myceli.ai`. Meanwhile the `aws` meter connector uses the Cost Explorer CLI on the Myceli-direct account (301235909293). |

---

## Manual monthly

Providers with no programmatic API surface. Each month, read the current balance or usage cost from the provider console and enter it with the `ingest.record` CLI.

Run from `apps/operation/forager/`:

```bash
# Balance snapshot
python3 -m ingest.record balance <provider> [--granted N] [--left N] [--prepaid N] [--note TEXT]

# Meter reading (most common for this group)
python3 -m ingest.record meter <provider> <YYYY-MM> <cost_usd> --funding credit
```

Provider must be in `registry.CANONICAL`; month must match `YYYY-MM`. Appends one row with `source="manual"` to `balances` or `meter_monthly`.

### Monthly checklist

- [ ] **io.net** — console [cloud.io.net](https://cloud.io.net) → Billing; then:
  ```
  python3 -m ingest.record meter io.net <YYYY-MM> <usd> --funding credit
  ```

- [ ] **perplexity** — console [perplexity.ai](https://perplexity.ai) → Billing; then:
  ```
  python3 -m ingest.record meter perplexity <YYYY-MM> <usd> --funding credit
  ```

- [ ] **nebius** — console [nebius.ai](https://nebius.ai) → Billing; then:
  ```
  python3 -m ingest.record meter nebius <YYYY-MM> <usd> --funding credit
  ```

- [ ] **lambda** — console [lambda.ai](https://lambda.ai) → Billing; then:
  ```
  python3 -m ingest.record meter lambda <YYYY-MM> <usd> --funding credit
  ```

- [ ] **bytedance** — console [console.volcengine.com](https://console.volcengine.com) → Billing; then:
  ```
  python3 -m ingest.record meter bytedance <YYYY-MM> <usd> --funding credit
  ```

- [ ] **modal** — console [modal.com](https://modal.com) → Billing; then:
  ```
  python3 -m ingest.record meter modal <YYYY-MM> <usd> --funding credit
  ```

- [ ] **elevenlabs** — console [elevenlabs.io](https://elevenlabs.io) → Billing; then:
  ```
  python3 -m ingest.record meter elevenlabs <YYYY-MM> <usd> --funding credit
  ```

- [ ] **daytona** — console [app.daytona.io](https://app.daytona.io) → Billing (fallback when wallet OIDC-gated); then:
  ```
  python3 -m ingest.record meter daytona <YYYY-MM> <usd> --funding credit
  ```
  Note: daytona also has a balance connector (see Programmatic above). Use `ingest.record` only when the wallet endpoint returns an OIDC error.

---

## Settled questions (do not re-litigate)

These were decided during the PoC and are preserved here so they are not re-opened.

**DeepInfra sign convention** — `stripe_balance` is negative when credit is held; the connector negates it to produce a positive `prepaid_left_usd`. A negative value from the API is correct and expected.

**Fireworks postpaid month−1** — Fireworks cuts a POSTPAID_BILLING invoice on the 1st of each month covering the *previous* month's usage (e.g. invoice dated 2026-07-01 = June usage). The `firectl billing list-invoices` table has an INVOICE URL column between TYPE and STATE — the column offsets used to parse amount, state, and date are `t[i-2]`, `t[i+2]`, and `t[i+3]` respectively.

**Cloudflare intentionally not ported** — the PoC's Cloudflare connector was verification-only (returned no balances). Cloudflare cost arrives via PDF invoices captured by the Gmail catcher; there is no balance or meter connector for Cloudflare in forager.

**OpenAI granted is hardcoded (HC)** — the OpenAI Organization Costs API exposes spend totals but not grant amounts. The connector uses `OPENAI_GRANT_USD` (default 1565.58) from SOPS/creds as the hardcoded grant; the balance row carries `note="granted is HC"` to flag this. Update `OPENAI_GRANT_USD` in `apps/operation/forager/secrets/env.json` when the grant is renewed.

**RunPod User-Agent** — RunPod's API endpoint (`api.runpod.io/graphql`) sits behind Cloudflare. The default Python `urllib` User-Agent triggers Cloudflare's bot-detection (error 1010). All HTTP requests in forager carry `User-Agent: Mozilla/5.0 (pollinations-finops-connector)` via `ingest/connectors/common.py:UA` — this is mandatory, not optional. The RunPod API key goes in the `Authorization: Bearer` header, never in the URL query string.

**GCP connector works without gcloud login** — the `google` meter connector activates the service-account key from `GCP_BILLING_SA_JSON` (SOPS) at runtime via `gcloud auth activate-service-account`. No interactive `gcloud auth login` is needed; the SA has BigQuery read access to the billing export table. BQ billing export was fresh through 2026-07-02 as of last verification.

**AWS CE 'cash' meter is gross usage before credits** — the pass-1 filter excludes Credit and Refund RECORD_TYPEs, which means it returns gross usage before any AWS credits are applied (not net-of-credits as was previously labelled). Consumers must derive net cash = max(meter_cash − credit_burn, 0). A parsed invoice always wins over the meter for the cash figure; this distinction caused the phantom-cash incident during the PoC cutover.
