# Forager Connector Tracker

Forager's live inventory of every vendor usage signal and how it reaches Tinybird. Programmatic meter connectors run automatically; the remaining vendors are filled manually each month from their dashboards.

---

## Programmatic connectors

Auto-fetched by `python3 -m ingest.run`. A connector failure fails the run, writes the error to `ingest_runs`, and leaves the existing Tinybird tables untouched for that failed refresh.

### Meter connectors (METER registry)

| Vendor | What it fetches | Endpoint / CLI | Creds keys | Funding class | Verified |
|---|---|---|---|---|---|
| **deepinfra** | metered cost per month (cents÷100, epoch-second windows) | `GET https://api.deepinfra.com/payment/usage?from={epoch}&to={epoch}` | `DEEPINFRA_API_KEY` | prepaid | 2026-07-03 |
| **vast.ai** | charge-type invoice rows grouped by UTC month | `vastai show invoices --raw` (CLI) | — (CLI manages auth) | prepaid | 2026-07-03 |
| **ovhcloud** | USE-type credit movements per month, kept in native EUR | `GET https://eu.api.ovh.com/1.0/me/credit/balance/STARTUP_PROGRAM/movement` (HMAC-signed, per-movement detail fetches) | `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY` | credit | 2026-07-03 |
| **fireworks** | POSTPAID_BILLING+PAID invoices; invoice date 1st of month → usage month is month−1 | `firectl billing list-invoices --api-key …` (CLI) | `FIREWORKS_API_KEY` | prepaid | 2026-07-03 |
| **aws** | pass 1: gross usage before credits; pass 2: RECORD_TYPE=Credit absolute value; paid is max(gross − credit, 0) | `aws ce get-cost-and-usage --granularity MONTHLY` (CLI, ambient Myceli-direct profile) | — (ambient AWS CLI profile) | paid + credit | 2026-07-03 |
| **google** | BQ billing export: gross amount + abs(credits), kept in native EUR | `gcloud auth activate-service-account --key-file={sa_json}` + `bq query … FROM billing_export.gcp_billing_export_resource_v1_{BA}` | `GCP_BILLING_SA_JSON` (SA JSON string in SOPS) | paid + credit | 2026-07-03 |
| **openai** | daily cost buckets grouped by month (rides grant → credit) | `GET https://api.openai.com/v1/organization/costs` (paginated) | `OPENAI_ADMIN_KEY`, `OPENAI_GRANT_START` (opt) | credit | 2026-07-03 |

---

## Manual monthly

Vendors with no programmatic API surface. Each month, read the usage cost from the vendor console and enter it with the `ingest.record` CLI.

Run from `apps/operation/forager/`:

```bash
# Monthly vendor usage
python3 -m ingest.record provider <vendor> <YYYY-MM> --currency <USD|EUR|...> --credit <amount> --paid <amount>
```

Vendor must be in `registry.CANONICAL`; month must match `YYYY-MM`. Appends one row with `source="manual"` to `provider_monthly`. Compute Usage is the monthly source of truth.

### Monthly checklist

- [ ] **io.net** — console [cloud.io.net](https://cloud.io.net) → Billing; then:
  ```
  python3 -m ingest.record provider io.net <YYYY-MM> --currency USD --credit <amount>
  ```

- [ ] **perplexity** — console [perplexity.ai](https://perplexity.ai) → Billing; then:
  ```
  python3 -m ingest.record provider perplexity <YYYY-MM> --currency USD --credit <amount>
  ```

- [ ] **nebius** — console [nebius.ai](https://nebius.ai) → Billing; then:
  ```
  python3 -m ingest.record provider nebius <YYYY-MM> --currency USD --credit <amount>
  ```

- [ ] **lambda** — console [lambda.ai](https://lambda.ai) → Billing; then:
  ```
  python3 -m ingest.record provider lambda <YYYY-MM> --currency USD --credit <amount>
  ```

- [ ] **bytedance** — console [console.volcengine.com](https://console.volcengine.com) → Billing; then:
  ```
  python3 -m ingest.record provider bytedance <YYYY-MM> --currency USD --credit <amount>
  ```

- [ ] **modal** — console [modal.com](https://modal.com) → Billing; then:
  ```
  python3 -m ingest.record provider modal <YYYY-MM> --currency USD --credit <amount>
  ```

- [ ] **elevenlabs** — console [elevenlabs.io](https://elevenlabs.io) → Billing; then:
  ```
  python3 -m ingest.record provider elevenlabs <YYYY-MM> --currency USD --credit <amount>
  ```

- [ ] **daytona** — console [app.daytona.io](https://app.daytona.io) → Billing; then:
  ```
  python3 -m ingest.record provider daytona <YYYY-MM> --currency USD --credit <amount>
  ```
---

## Settled questions (do not re-litigate)

These were decided during the PoC and are preserved here so they are not re-opened.

**Fireworks postpaid month−1** — Fireworks cuts a POSTPAID_BILLING invoice on the 1st of each month covering the *previous* month's usage (e.g. invoice dated 2026-07-01 = June usage). The `firectl billing list-invoices` table has an INVOICE URL column between TYPE and STATE — the column offsets used to parse amount, state, and date are `t[i-2]`, `t[i+2]`, and `t[i+3]` respectively.

**Cloudflare intentionally not ported** — the PoC's Cloudflare connector was verification-only. Cloudflare cost arrives via PDF invoices captured by the Gmail catcher; there is no meter connector for Cloudflare in forager.

**RunPod User-Agent** — RunPod's API endpoint (`api.runpod.io/graphql`) sits behind Cloudflare. The default Python `urllib` User-Agent triggers Cloudflare's bot-detection (error 1010). All HTTP requests in forager carry `User-Agent: Mozilla/5.0 (pollinations-finops-connector)` via `ingest/connectors/common.py:UA` — this is mandatory, not optional. The RunPod API key goes in the `Authorization: Bearer` header, never in the URL query string.

**GCP connector works without gcloud login** — the `google` meter connector activates the service-account key from `GCP_BILLING_SA_JSON` (SOPS) at runtime via `gcloud auth activate-service-account`. No interactive `gcloud auth login` is needed; the SA has BigQuery read access to the billing export table. BQ billing export was fresh through 2026-07-02 as of last verification.

**AWS CE paid meter is net of credits** — Cost Explorer returns gross usage and credit rows separately. Forager stores `credit` as the absolute Credit record amount and `paid` as `max(gross usage - credit, 0)`.
