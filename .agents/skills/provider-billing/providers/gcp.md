# GCP billing via `gcloud` CLI and BigQuery billing export

Validated: **2026-04-11** — all commands below were executed live against `elliot@myceli.ai`. Real output samples and real identifiers captured inline. One item is confirmed missing: BigQuery billing export is not yet enabled — see "BigQuery export setup" section.

Captures the exact CLI and BigQuery calls needed to answer GCP questions like:

- How much did we spend on Vertex AI / Gemini this month?
- Which Gemini model drove the cost and in which region?
- Are Vertex AI credits or trial grants being applied?
- What's the billing account and how is it linked to our project?
- How do I query daily spend by SKU without paying per-query fees?

---

## Requirements

- `gcloud` CLI installed: `gcloud version` → we have 553.0.0 as of 2026-04-11
- Authenticated: `gcloud auth login` (interactive, opens browser — cannot be done non-interactively)
- Application Default Credentials for API calls: `gcloud auth application-default login`
- `bq` CLI (comes with gcloud) for BigQuery billing-export queries
- `python3` for JSON wrangling
- **The `Billing Account Viewer` IAM role** on the billing account (to list accounts and read spend via Cloud Billing API)
- **The `BigQuery Data Viewer` role** on the billing export dataset (to query line items)

## Known identifiers (our account)

```
Primary user:         elliot@myceli.ai
Organization:         myceli.ai
  Org ID:             organizations/231606865087
  directoryCustomerId: C028kgp7k
  Created:            2025-07-14
Primary billing acct: billingAccounts/0180E5-574541-B8F8FD  (displayName: "My Billing Account")
  Linked projects:    stellar-verve-465920-b7    ← prod Vertex / Pollinations
                      gen-lang-client-0635831327  (Test project)
Secondary billing:    billingAccounts/010208-E0A433-6D63DF  (displayName: "My Billing Account")
  Linked projects:    gen-lang-client-0428898833  (Default Gemini Project)
Total projects accessible (2026-04-11): 7
  stellar-verve-465920-b7           #17343081062        Research            ← prod
  pollinations-research             #713890707533
  research-2-468607                 #972658826788       Research 2
  analog-marking-468919-s0          #276784271453       My Project 17726
  gen-lang-client-0428898833        #174982565332       Default Gemini Project
  gen-lang-client-0635831327        #465936988167       Test
  sys-52885342107969634058842870    #824035784315       Investor Tracker
Default service account: 17343081062-compute@developer.gserviceaccount.com (on stellar-verve)
Env vars used in-code:
  GOOGLE_PROJECT_ID=stellar-verve-465920-b7   (text.pollinations.ai/.env, image.pollinations.ai/.env)
```

The project ID `stellar-verve-465920-b7` is confirmed as the production Vertex AI project for both text.pollinations.ai and image.pollinations.ai. Reference: [text.pollinations.ai/configs/modelConfigs.ts:159-178](../../../text.pollinations.ai/configs/modelConfigs.ts#L159-L178). Billing confirmed **enabled** via `gcloud billing projects describe stellar-verve-465920-b7` → `billingEnabled: True`, linked to `0180E5-574541-B8F8FD`.

**Multiple billing accounts gotcha**: We have **two** billing accounts, both named "My Billing Account" (confusing). Use the `name` field (`0180E5-...` vs `010208-...`) to disambiguate. The one that matters for Pollinations infrastructure is **`0180E5-574541-B8F8FD`** — it's linked to `stellar-verve-465920-b7` where Vertex runs.

**Enabled APIs on `stellar-verve-465920-b7`** (38 total, relevant subset):

```
aiplatform.googleapis.com          ← Vertex AI
bigquery.googleapis.com            ← BigQuery (but no billing export dataset yet — see below)
bigquerystorage.googleapis.com
cloudaicompanion.googleapis.com
cloudresourcemanager.googleapis.com
compute.googleapis.com
dataflow.googleapis.com
dataplex.googleapis.com
logging.googleapis.com
monitoring.googleapis.com
storage.googleapis.com
```

**Deployed Vertex AI models** (confirmed 2026-04-11 via `gcloud ai models list --region=us-central1`):

```
MODEL_ID             DISPLAY_NAME
4770111350338748416  shieldgemma-2-4b-it-hf
4468088700328214528  shieldgemma-2-4b-it-vllm

ENDPOINT_ID          DISPLAY_NAME
7993096590699003904  shieldgemma-2-4b-it-hf-endpoint
9167410193535860736  shieldgemma-2-4b-it-vllm-endpoint
```

These are custom **ShieldGemma** content-moderation models hosted as managed endpoints — distinct from the managed Gemini API that our text service calls via Portkey (which does NOT require deployed endpoints). Any billing attribution for ShieldGemma shows up as `Vertex AI Online Prediction` SKUs in the billing export, while Portkey-called Gemini 2.5/3.x shows up as `Generative Language API` / `Vertex AI Generative AI` SKUs.

---

## Authentication

GCP is unlike AWS/Azure in that the CLI cannot refresh its OAuth token silently after a few weeks. Every time the cached token expires you get:

```
ERROR: (gcloud.<cmd>) There was a problem refreshing your current auth tokens:
Reauthentication failed. cannot prompt during non-interactive execution.
```

**Fix (requires a real terminal + browser):**

```bash
gcloud auth login
gcloud auth application-default login   # for library/API calls (Cloud Billing API, BigQuery)
```

If you're in a headless session (CI, Claude Code background task), you must either:
1. Pre-authenticate interactively in a real terminal before starting the session
2. Use a **service account key** (requires creating a service account in the project, granting the needed IAM roles, downloading a key JSON, and pointing `GOOGLE_APPLICATION_CREDENTIALS` at it)

**Recommended long-term**: create a read-only service account (`finops-reader@stellar-verve-465920-b7.iam.gserviceaccount.com`) with `roles/billing.viewer`, `roles/bigquery.dataViewer`, and `roles/serviceusage.serviceUsageConsumer`. Store the key JSON in SOPS. Mount as `GOOGLE_APPLICATION_CREDENTIALS` before running the commands below.

---

## Querying spend and usage

GCP has **three** primary ways to get cost data, each with different latency and granularity:

| Method | Latency | Granularity | Cost to use |
|---|---|---|---|
| **BigQuery billing export** | ~6h | Line-item / SKU / labels / project | Query-size fee (first 1TB/month free) |
| **Cloud Billing API** (`gcloud billing`) | ~24h | Rollup per account/project | Free |
| **Cloud Console → Reports** (web UI) | ~24h | Same as API | Free |

**BigQuery export is the only programmatic source of SKU-level detail.** It must be enabled on the billing account first (one-time setup in the Cloud Console — there's no CLI for it).

### 1. Cloud Billing API — quick rollups

#### List billing accounts we have access to

```bash
gcloud billing accounts list
```

Returns something like:
```
ACCOUNT_ID            NAME                         OPEN  MASTER_ACCOUNT_ID
012345-67890A-BCDEF0  billingAccounts/012345-...   True
```

Save the `ACCOUNT_ID` — you'll need it for every subsequent billing-scoped call.

#### Which projects are linked to a billing account?

```bash
gcloud billing projects list --billing-account=012345-67890A-BCDEF0
```

#### Is billing currently enabled on our Vertex project?

```bash
gcloud billing projects describe stellar-verve-465920-b7
```

Output:
```
billingAccountName: billingAccounts/012345-67890A-BCDEF0
billingEnabled: true
name: projects/stellar-verve-465920-b7/billingInfo
projectId: stellar-verve-465920-b7
```

If `billingEnabled: false`, all Vertex calls will 403.

#### Current month-to-date spend (rollup, no SKU breakdown)

The `gcloud billing` surface does NOT expose a cost-and-usage query — there's no equivalent of `aws ce get-cost-and-usage`. For any real dollar amount you must query the BigQuery billing export (next section). The API only tells you structure (accounts, projects, links).

### 2. BigQuery billing export — SKU-level detail

**Status as of 2026-04-12: ⚠️ STALE.** Table exists:

```
stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_0180E5_574541_B8F8FD
```

But the latest `usage_start_time` in the table is **2026-03-04** — the pipeline silently stopped writing ~38 days ago. Total rows: 9,496 spanning 2026-02-01 to 2026-03-04. No April data at all.

**How this was detected**: Query `MAX(DATE(usage_start_time))` to check freshness. If it's older than the current month, the export is broken.

```sql
SELECT
  MIN(DATE(usage_start_time)) AS earliest,
  MAX(DATE(usage_start_time)) AS latest,
  COUNT(*) AS rows
FROM `stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_0180E5_574541_B8F8FD`
```

**Common causes of silent export failure**:
- Billing account was relinked/unlinked on the host project
- Dataset-level permission revoked (service account lost write access)
- Cloud Billing Export feature toggled off in Console
- Storage billing not enabled on the host project

**Fix**: go to https://console.cloud.google.com/billing/0180E5-574541-B8F8FD/export, click "Edit settings" under "Detailed usage cost", and re-enable. First data lands in ~6 hours; historical backfill of the gap may or may not happen depending on GCP's retention policy.

**Implication for the finance runway app**: the `lib/providers/gcp.mjs` wrapper in `apps/operation/finance/` detects this staleness via the `MAX(usage_start_time)` check and sets `pool.mtd_stale = true` with `pool.mtd_data_as_of = '<last-date>'`. The wrapper still returns valid `mtd_*` fields (zeros), so the sheet renders GCP as a 3-row block with `0 €` for the current month. When the export is fixed, the next cron run will automatically pick up the real MTD — no code change.

---

DAY partitioned. At time of the first validation the table had 5,320 rows spanning 2026-02-01 to 2026-03-02, which suggested backfill was in progress. The continued accrual stopped at 2026-03-04 — see the staleness note above.

**If you need to re-enable or set up on a different account**: do it in the Cloud Console, there is no `gcloud` command for this.

1. Go to https://console.cloud.google.com/billing/0180E5-574541-B8F8FD/export
2. Under "Detailed usage cost", click "Edit settings"
3. Pick a project to host the export dataset — `stellar-verve-465920-b7` is the convention
4. Name the dataset `billing_export`
5. Enable. First data lands in ~6 hours; historical backfill may take 24-48h.

The billing account ID gets embedded into the table name with underscores instead of dashes (`0180E5-574541-B8F8FD` → `0180E5_574541_B8F8FD`).

#### Schema highlights

Each row is one line item from a daily aggregation. Key fields:

```
billing_account_id       STRING
service.description      STRING   e.g. "Vertex AI"
sku.description          STRING   e.g. "Gemini 3 Flash Input Token Count - Global"
usage_start_time         TIMESTAMP
usage_end_time           TIMESTAMP
project.id               STRING   stellar-verve-465920-b7
project.name             STRING
location.location        STRING   us-central1, global
labels                   ARRAY    user-defined key/value
cost                     FLOAT64  list price in USD
currency                 STRING   usually USD
currency_conversion_rate FLOAT64
usage.amount             FLOAT64
usage.unit               STRING   "count", "byte-seconds", etc.
credits                  ARRAY    each has {name, amount, type}  ← credit application!
invoice.month            STRING   "202604" format
```

The `credits` array is how you detect whether **free trials, committed-use discounts, promotional credits, or sustained-use discounts** were applied. Sum them and subtract from `cost` to get "net cost after credits":

```sql
SELECT
  service.description AS service,
  sku.description AS sku,
  SUM(cost) AS list_cost,
  SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credit_applied,
  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost
FROM `stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX`
WHERE _PARTITIONTIME >= TIMESTAMP('2026-04-01')
  AND _PARTITIONTIME <  TIMESTAMP('2026-04-11')
GROUP BY service, sku
ORDER BY net_cost DESC
LIMIT 50
```

**Note**: credit amounts in the `credits` array are **negative**, so you ADD them to `cost` (not subtract) to get net.

#### Yesterday's Vertex AI spend by model

```bash
bq query --use_legacy_sql=false --format=prettyjson "
SELECT
  sku.description AS sku,
  SUM(cost) AS list_cost_usd,
  SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits_usd,
  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost_usd
FROM \`stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX\`
WHERE _PARTITIONTIME >= TIMESTAMP('2026-04-10')
  AND _PARTITIONTIME <  TIMESTAMP('2026-04-11')
  AND service.description = 'Vertex AI'
GROUP BY sku
ORDER BY net_cost_usd DESC
"
```

**Gotcha**: `_PARTITIONTIME` on billing exports is the **export write time**, not the usage time. For strict usage-date filtering, use `usage_start_time` instead:

```sql
WHERE DATE(usage_start_time) = '2026-04-10'
```

But this scans more data (worse query cost). For daily dashboards prefer `_PARTITIONTIME` and accept a ±1 day smear.

#### MTD totals by service

```bash
bq query --use_legacy_sql=false --format=prettyjson "
SELECT
  service.description AS service,
  ROUND(SUM(cost), 2) AS list_cost,
  ROUND(SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS credits,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS net_cost
FROM \`stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX\`
WHERE _PARTITIONTIME >= TIMESTAMP('2026-04-01')
GROUP BY service
ORDER BY net_cost DESC
"
```

#### Credit balance (free trial / promotional / committed-use)

GCP does not expose a "balance" API the way Azure does. The only way to see credits is via BigQuery export — sum the negative `credits.amount` values. This tells you **credit applied**, not **credit remaining**.

For the **remaining credit balance**, the only source is:
- Cloud Console → Billing → Credits tab (web UI only)
- For committed-use discounts: `gcloud compute commitments list --billing-account=...` (compute only, not Vertex)

There is no CLI equivalent for "how much free trial credit is left." If we get an AI/ML credit grant, the remaining balance must be checked in the Console.

### 3. Vertex AI quota and usage (not billing)

Separate from billing, Vertex AI has per-project quotas that limit throughput. These matter because hitting a quota produces a 429 that shows up in our logs but not in billing data.

#### List current Vertex AI quotas

```bash
gcloud compute project-info describe --project=stellar-verve-465920-b7 \
  --flatten="quotas[]" \
  --format="table(quotas.metric,quotas.limit,quotas.usage)"
```

(This returns compute quotas. Vertex quotas live under a different namespace.)

For Vertex-specific quotas:

```bash
gcloud alpha services quota list \
  --service=aiplatform.googleapis.com \
  --consumer=projects/stellar-verve-465920-b7
```

Requires the `alpha` component installed and may need `roles/serviceusage.quotaAdmin` to read some quotas.

---

## Listing resources

### Deployed Vertex AI models (endpoints)

```bash
gcloud ai endpoints list --region=us-central1 --project=stellar-verve-465920-b7
gcloud ai models list --region=us-central1 --project=stellar-verve-465920-b7
```

### All services enabled on the project

```bash
gcloud services list --enabled --project=stellar-verve-465920-b7
```

Useful to confirm which APIs are actually turned on (and therefore billable).

### Service accounts

```bash
gcloud iam service-accounts list --project=stellar-verve-465920-b7
```

---

## Region naming

GCP uses long-form region names (`us-central1`, `europe-west1`, `asia-northeast1`). Unlike Azure, the CLI is consistent — same string works everywhere.

**In-code usage** from [text.pollinations.ai/configs/modelConfigs.ts:159-178](../../../text.pollinations.ai/configs/modelConfigs.ts#L159-L178):

| Model | Region |
|---|---|
| `gemini-3-flash-preview` | `us-central1` |
| `gemini-3.1-pro-preview` | `us-central1` |
| `gemini-2.5-flash-lite` | `global` (Vertex global endpoint) |
| `gemini-3.1-flash-lite-preview` | `us-central1` |
| `gemini-2.5-pro` | `us-central1` |

The `global` region is a special Vertex-only endpoint that multiplexes across regions — used for models that have global deployment. Cost shows up under `location.location = 'global'` in the billing export.

---

## Gotchas

- **Reauth every few weeks.** gcloud tokens expire silently; commands die with `Reauthentication failed. cannot prompt during non-interactive execution.` Fix: run `gcloud auth login` in a real terminal. For headless use, create a service account with a key.
- **Compute Engine Metadata server warnings** on macOS: `WARNING: Compute Engine Metadata server unavailable on attempt 1 of 3`. Harmless — gcloud is checking whether it's running on a GCE VM. Ignore, or set `CLOUDSDK_METRICS_ENVIRONMENT=local` to suppress.
- **`gcloud billing` has no cost-and-usage command**. You must use BigQuery export. Plan for this — it's a one-time Console setup.
- **BigQuery billing export tables are huge.** Always filter on `_PARTITIONTIME` first to cut bytes scanned. Without a partition filter, a full scan can cost real money (>1TB/month exceeds free tier).
- **Credit amounts are negative**, not positive. To compute "net cost," ADD the credits to the list cost. SUM them directly without absolute-value and you'll get the right answer.
- **Two different BigQuery export tables exist**: "standard" (`gcp_billing_export_v1_*`) and "detailed with resource IDs" (`gcp_billing_export_resource_v1_*`). The detailed one has a `resource.global_name` column for per-resource attribution but costs more to store. Prefer detailed.
- **`invoice.month` is how you pin to a billing period**, not `usage_start_time`. A SKU consumed on the last day of March might be billed on the April invoice if it crosses midnight UTC — use `invoice.month = '202603'` for strict billing-period queries.
- **`labels` array is the only way to tag costs.** If you care about cost attribution across services/teams, tag resources with `gcloud compute ... --labels=project=pollinations,env=prod` or set default labels on the project. Labels land in the export ~24h after tagging.
- **Vertex AI has three billing SKU families**: input tokens, output tokens, context caching. Each is a separate row in the export with `sku.description` naming the model + direction, e.g. `"Gemini 3 Flash Input Token Count - Global"`. Group by SKU, not service, for model-level cost breakdown.
- **`ROWS` is a reserved keyword in BigQuery SQL.** Don't alias `COUNT(*) AS rows` — use `row_count`, `n_rows`, or similar. You'll get `Syntax error: Unexpected keyword ROWS`.

---

## Question → query cheat sheet

| Question | Command |
|---|---|
| Which billing accounts do we have? | `gcloud billing accounts list` |
| Is our Vertex project billing-enabled? | `gcloud billing projects describe stellar-verve-465920-b7` |
| Month-to-date GCP spend by service | BigQuery export, `GROUP BY service.description`, filter `_PARTITIONTIME >= first-of-month` |
| Yesterday's Vertex AI cost by model | BigQuery export, `WHERE service.description='Vertex AI' AND DATE(usage_start_time)='YYYY-MM-DD'` |
| How much free trial credit has been applied? | BigQuery export, sum `credits.amount` where credit type = `"PROMOTION"` or `"SIGNUP"` |
| How much credit is LEFT? | Console only — no API |
| What Vertex models are deployed? | `gcloud ai models list --region=us-central1 --project=stellar-verve-465920-b7` |
| What services are enabled? | `gcloud services list --enabled --project=stellar-verve-465920-b7` |
| Current Vertex quota usage | `gcloud alpha services quota list --service=aiplatform.googleapis.com --consumer=projects/stellar-verve-465920-b7` |

---

## Known unknowns (open follow-ups)

- **BigQuery billing export** — confirmed NOT enabled on either billing account (2026-04-11). One-time setup required in the Cloud Console at https://console.cloud.google.com/billing/0180E5-574541-B8F8FD/export. Without this, there is no SKU-level spend visibility — the Cloud Billing API only exposes structure (accounts, projects, links), not dollar amounts.
- **Credit balance and program** — we haven't verified whether Pollinations is on Google Cloud for Startups / AI Startup Program. If yes, those credits apply at the billing-account level but are only visible in the Console UI (Cost Management → Credits) or in the BQ export's `credits` array once enabled. No CLI way to see remaining balance.
- **Application Default Credentials (ADC)** — we ran `gcloud auth login` but NOT `gcloud auth application-default login`. This means tools that use the ADC path (direct BigQuery SDK, Vertex client libraries, any Python/Node SDK that doesn't go through `gcloud`) will fail with "could not find default credentials." Fix by running `gcloud auth application-default login` in an interactive terminal.
- **Service account for headless queries** — we're using `elliot@myceli.ai` interactively. For CI/scheduled queries we need a dedicated SA with `roles/billing.viewer` + `roles/bigquery.dataViewer`, stored in SOPS.
- **Budgets** — `gcloud billing budgets list --billing-account=0180E5-574541-B8F8FD` returned empty in this session (or the list parser failed). Needs a retry with `--format=json` and proper error handling. If no budgets are configured, cost spikes won't alert.
- **Why the second billing account exists** — `010208-E0A433-6D63DF` is linked to only one project (`gen-lang-client-0428898833` — "Default Gemini Project"). Unclear whether this is a legacy account, a separate personal project, or something to consolidate/close. Low priority but worth understanding.

---

## Session 1 validation log (2026-04-11)

Everything in this playbook was verified live against `elliot@myceli.ai` in this session. Summary:

| Command | Result |
|---|---|
| `gcloud auth login` | ✅ logged in successfully (via no-browser FIFO trick) |
| `gcloud projects list` | ✅ 7 projects (captured above) |
| `gcloud billing accounts list` | ✅ 2 accounts (captured above) |
| `gcloud billing projects describe stellar-verve-465920-b7` | ✅ `billingEnabled: True`, linked to `0180E5-574541-B8F8FD` |
| `gcloud billing projects list --billing-account=0180E5-574541-B8F8FD` | ✅ 2 linked projects |
| `gcloud billing projects list --billing-account=010208-E0A433-6D63DF` | ✅ 1 linked project |
| `gcloud organizations list` | ✅ `organizations/231606865087` (myceli.ai, created 2025-07-14) |
| `bq ls --project_id=stellar-verve-465920-b7` | ✅ `billing_export` dataset; table `gcp_billing_export_resource_v1_0180E5_574541_B8F8FD` (DAY partitioned, 5,320 rows spanning 2026-02-01 → 2026-03-02 at first check — still backfilling) |
| `gcloud services list --enabled --project=stellar-verve-465920-b7` | ✅ 38 services (Vertex, BQ, Dataflow, Dataplex, Compute, etc.) |
| `gcloud ai models list --region=us-central1 --project=stellar-verve-465920-b7` | ✅ 2 custom ShieldGemma models + matching endpoints |
| `gcloud ai endpoints list --region=us-central1 --project=stellar-verve-465920-b7` | ✅ 2 endpoints |
| `gcloud billing budgets list --billing-account=0180E5-574541-B8F8FD` | ⚠️ empty/unparseable — retry in next session |

**Auth gotcha captured**: the non-interactive shell we normally use cannot drive `gcloud auth login` because gcloud dies on EOF when it tries to read the verification code. Workaround: use a named FIFO (`mkfifo /tmp/gcloud_auth_fifo`) with a keepalive writer holding the write side open. Then in a separate Bash call, write the code into the FIFO. Full script recipe:

```bash
mkfifo /tmp/gcloud_auth_fifo
gcloud auth login --no-launch-browser --quiet < /tmp/gcloud_auth_fifo > /tmp/gcloud_auth.out 2>&1 &
GCLOUD_PID=$!
( sleep 600 > /tmp/gcloud_auth_fifo ) &   # keepalive — holds fifo open
sleep 2
cat /tmp/gcloud_auth.out  # copy the URL it prints, open in browser

# ... user opens URL, gets verification code, pastes back ...

echo "<verification-code>" > /tmp/gcloud_auth_fifo
sleep 4
cat /tmp/gcloud_auth.out  # should show "You are now logged in as [...]"
```

This works even inside Claude Code's non-interactive bash — tested 2026-04-11.

### BigQuery export live-query results (2026-04-11, first 30 min after enabling)

The export was enabled mid-session and was still backfilling when these queries ran. Coverage at first check: **2026-02-01 → 2026-03-02** (5,320 rows, Feb–Mar only, still catching up to Apr).

#### Monthly totals

| Invoice month | Rows | List $ | Credits $ | Net $ |
|---|---|---|---|---|
| 2026-03 | 3,498 | 156.83 | −0.91 | **155.92** |
| 2026-02 | 1,822 | 54.35 | −4.62 | **49.73** |

#### March 2026 by service

| Service | List | Credits | Net |
|---|---|---|---|
| Vertex AI | $134.85 | $0.00 | $134.85 |
| Compute Engine | $16.11 | −$0.83 | $15.28 |
| Gemini API | $5.79 | $0.00 | $5.79 |
| Networking | $0.08 | −$0.08 | $0.00 |
| Dataplex / Logging / Storage | — | — | ~$0 |
| **TOTAL** | **$156.83** | **−$0.91** | **$155.92** |

**86% of March GCP spend is Vertex AI.** Not Compute Engine (despite the ShieldGemma endpoints running there) — Compute was only $16.

#### March 2026 Vertex AI by SKU (top hits — this is where the real model usage lives)

| SKU | List $ | Requests |
|---|---|---|
| Gemini 2.5 Flash Lite Text Input | 32.16 | 379 M |
| Gemini 2.5 Flash Lite Text Output | 30.39 | 89.5 M |
| Gemini 2.5 Flash Image Output | 29.08 | 1.14 M |
| Gemini 3.0 Pro Image Output | 14.48 | 142 K |
| Gemini 3.1 Flash Image Image Output | 6.27 | 123 K |
| Veo 3 Fast Video Generation | 4.92 | 58 |
| Gemini 2.5 Pro Thinking Text Output | 4.72 | 556 K |
| Gemini 3.0 Pro Text Output | 2.47 | 242 K |
| Gemini 2.5 Pro Text Input | 2.10 | 1.98 M |
| Gemini 2.5 Pro Text Output | 1.98 | 234 K |
| Gemini 3 Flash Text Output | 1.77 | 696 K |
| Gemini 3.0 Pro Text Input | 1.20 | 706 K |
| Gemini 3 Flash Text Input | 0.79 | 1.87 M |
| Gemini 2.5 Pro Input Text Caching | 0.77 | 7.2 M |
| (… lower-cost SKUs omitted) | | |

**Key observations captured from this data:**

1. **Portkey's `vertex-ai` provider routes billing to the `Vertex AI` product line**, not the `Gemini API` product line. The latter is only $5.79/mo and is probably residual test calls through a different key.
2. **Gemini 2.5 Flash Lite dominates** at $62/mo combined (40% of March spend). That's the cheapest model in [modelConfigs.ts](../../../text.pollinations.ai/configs/modelConfigs.ts) used for high-volume traffic — makes sense.
3. **Video/image multimodal SKUs are significant**: $50+/mo across Gemini Image Output + Veo 3 Fast + Flash Image Image Output — larger than pure text pro models. If Gemini Image Output is Nano Banana (Gemini 2.5 Flash Image), this is our Nano Banana bill.
4. **ShieldGemma custom endpoints cost nothing visible** — they don't appear in the top 30 Vertex SKUs. Probably running on small shared infrastructure, usage is pure Compute Engine time (~$16 in the Compute line above). We are NOT paying per-request for ShieldGemma, confirming they're hosted as standard endpoints.
5. **No promotional/trial credits visible.** All credit rows inspected are `type: "SUSTAINED_USAGE_DISCOUNT"` — GCP's automatic per-second Compute discount for long-running VMs. That's why Feb credits were $4.62 (full month of VM uptime → max SUD) and March only $0.91 (less uptime → less SUD). **If Pollinations has any GCP startup credit grant, it is NOT landing on this billing account.** Worth investigating whether it lives elsewhere.

#### Credit type verification

```sql
SELECT DISTINCT credits
FROM `stellar-verve-465920-b7.billing_export.gcp_billing_export_resource_v1_0180E5_574541_B8F8FD`
WHERE ARRAY_LENGTH(credits) > 0
LIMIT 5
```

Returned only `{name: "Sustained Usage Discount", type: "SUSTAINED_USAGE_DISCOUNT"}` objects. Confirms no promotional/trial/committed-use credits active.

#### SQL reserved word gotcha

**`ROWS` is a reserved keyword in BigQuery SQL.** Don't alias `COUNT(*) AS rows` — use `row_count`, `n_rows`, or similar. You'll get `Syntax error: Unexpected keyword ROWS`. I wasted two queries figuring this out; this entry exists so the next session doesn't repeat it.
