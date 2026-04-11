# AWS billing via `aws` CLI

Validated: **2026-04-11**. Re-validate if a command returns unexpected results or if we change organization membership.

Captures the exact CLI calls needed to answer AWS questions like:

- How much did we spend on AWS yesterday / MTD / last month?
- Which Bedrock models are driving cost? What's the Claude share?
- Are any credits being applied? (AWS Activate, Rise, Promotional)
- Which Bedrock models are available/active on the account?
- What budgets and cost alarms exist?
- What organization are we a member of and does it affect billing visibility?

---

## Requirements

- `aws` CLI v1 or v2 (the commands here work on both — v1 shown for output compatibility)
- Credentials: `~/.aws/credentials` set; verify with `aws sts get-caller-identity`
- Default region is `us-east-1` (set in `~/.aws/config`) — **Cost Explorer API only exists in us-east-1** so don't override
- `python3` for JSON wrangling

## Known identifiers (our account)

```
Account ID:        301235909293
Account type:      Linked member account (NOT payer)
Identity:          root user
Organization:      o-m67rvmyvhq
Master account:    813596885972  ← Automat-IT (automat-it.com)
Master email:      aws.ait.org.nsbu@automat-it.com
Default region:    us-east-1
```

**🚨 Critical billing relationship**: This account is a **linked member** of an AWS Organization owned by Automat-IT (a Tel Aviv AWS managed-service partner). This has several consequences:

1. AWS bills Automat-IT, not us directly. We see consumption in Cost Explorer but the invoice and payment flow happen at the master account.
2. Credits (AWS Activate, Rise, Promotional credits) are attached to the master account. Whether they flow down to our account depends on Automat-IT's configuration.
3. `aws ce list-cost-category-definitions` returns `AccessDeniedException: Linked account doesn't have access to cost category` — expected.
4. `aws organizations list-accounts` and similar org APIs return `AccessDenied` from the member account.
5. If AWS spend surprises us, it's likely because our view of discounts/credits is not the same as what Automat-IT sees.

To debug billing questions that the member view can't answer, contact Automat-IT directly or get payer-account access.

---

## Querying spend and usage

### 1. Cost Explorer — `aws ce get-cost-and-usage`

**Latency**: ~24h for final, ~8h for estimated. `Estimated: true` in the response indicates partial day.

**Time windows**: Start is inclusive, End is exclusive. `Start=2026-04-10,End=2026-04-11` returns a single day (Apr 10).

#### Yesterday's total by service

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-10,End=2026-04-11 \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE
```

Parse to a leaderboard:

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-10,End=2026-04-11 \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE | python3 -c "
import sys, json
d = json.load(sys.stdin)
g = d['ResultsByTime'][0]['Groups']
total = sum(float(x['Metrics']['UnblendedCost']['Amount']) for x in g)
print(f'TOTAL: \${total:.2f}  ({len(g)} services)')
for x in sorted(g, key=lambda r: -float(r['Metrics']['UnblendedCost']['Amount']))[:20]:
    amt = float(x['Metrics']['UnblendedCost']['Amount'])
    if amt > 0.01:
        print(f'  \${amt:>10.4f}  {x[\"Keys\"][0]}')
"
```

Example output (2026-04-10):
```
TOTAL: $246.55  (18 services)
  $  122.1243  Claude Opus 4.6 (Amazon Bedrock Edition)
  $   49.3811  Amazon Bedrock
  $   39.2444  Claude Sonnet 4.6 (Amazon Bedrock Edition)
  $   24.0630  Claude Haiku 4.5 (Amazon Bedrock Edition)
  $    6.5592  Claude Opus 4.5 (Amazon Bedrock Edition)
  $    3.2175  Amazon Elastic Compute Cloud - Compute
  $    0.7640  EC2 - Other
  ...
```

**Critical gotcha — Claude models are NOT under "Amazon Bedrock"**: Each Anthropic model appears as its own SERVICE in Cost Explorer:

- `Claude Opus 4.6 (Amazon Bedrock Edition)`
- `Claude Opus 4.5 (Amazon Bedrock Edition)`
- `Claude Sonnet 4.6 (Amazon Bedrock Edition)`
- `Claude Sonnet 4 (Amazon Bedrock Edition)` *(if active)*
- `Claude Haiku 4.5 (Amazon Bedrock Edition)`

The `Amazon Bedrock` service only contains **non-Anthropic models** (Nova, Kimi K2.5, MiniMax, etc.). This is because Anthropic sells through AWS Marketplace with `legalEntity = Anthropic PBC` while other Bedrock models bill as first-party AWS. Critical for any "how much did we spend on Bedrock" question — you MUST include the five Claude service names in the filter.

#### Month-to-date (MTD)

```bash
# Total MTD as of 2026-04-11:
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-11 \
  --granularity MONTHLY \
  --metrics "UnblendedCost"
# → $1,514.35 (10 days)
```

#### Yesterday's Bedrock-only spend by model

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-10,End=2026-04-11 \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}' \
  --group-by Type=DIMENSION,Key=USAGE_TYPE
```

Output is per USAGE_TYPE (not per model — model is encoded in the usage type string):
```
USE1-NovaMicro-output-tokens      $22.34
USE1-NovaReel-T2V-Medfps-HDRes    $12.48
USE1-NovaMicro-input-tokens        $7.74
USE1-moonshotai.kimi-k2.5-input    $4.73
USE1-minimax.minimax-m2.5-output   $0.49
```

Format: `<REGION>-<modelId>-{input|output}-tokens`. `USE1` = us-east-1.

#### ALL Claude + Bedrock combined (one filter)

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-11 \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Claude Opus 4.6 (Amazon Bedrock Edition)","Claude Sonnet 4.6 (Amazon Bedrock Edition)","Claude Haiku 4.5 (Amazon Bedrock Edition)","Claude Opus 4.5 (Amazon Bedrock Edition)","Amazon Bedrock"]}}'
```

Example MTD Apr 1–10 daily trend:
```
2026-04-01:  $5.46
2026-04-02:  $35.79
2026-04-03:  $12.64
2026-04-04:  $12.47
2026-04-05:  $181.99
2026-04-06:  $63.40
2026-04-07:  $144.93
2026-04-08:  $40.87
2026-04-09:  $181.61
2026-04-10:  $241.37
Total:       $920.53  (~61% of total AWS spend)
```

#### Metrics — which one to use

Request all five in one call to detect credit/discount application:

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-11 \
  --granularity MONTHLY \
  --metrics "BlendedCost" "UnblendedCost" "NetUnblendedCost" "AmortizedCost" "NetAmortizedCost"
```

Example April output:
```
UnblendedCost:      $1,514.35   ← list price before any discount
NetUnblendedCost:   $1,514.35   ← after credits + enterprise discounts
BlendedCost:        $1,524.67   ← consolidated org-wide blended rate
AmortizedCost:      $1,608.75   ← upfront RIs spread across usage period
NetAmortizedCost:   $1,608.75   ← amortized after credits
```

**How to detect credit application**: If `NetUnblendedCost < UnblendedCost`, credits were applied. In our April data they are **equal** → **zero credits being applied to this account**. This mirrors the Azure situation.

**If you only request one metric**: use `UnblendedCost` for intuition ("what did we use"), `NetUnblendedCost` for accounting ("what we actually owe after credits").

#### Group-by combinations

You can stack two `--group-by` parameters max:

```bash
# By service and linked account (useful on payer accounts; returns single row for member accounts)
--group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=LINKED_ACCOUNT

# By service and usage type
--group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=USAGE_TYPE

# By service and region
--group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=REGION

# By service and tag
--group-by Type=DIMENSION,Key=SERVICE Type=TAG,Key=Project
```

Valid dimension keys: `AZ`, `SERVICE`, `USAGE_TYPE`, `USAGE_TYPE_GROUP`, `OPERATION`, `PURCHASE_TYPE`, `RESOURCE_ID` (only with `get-cost-and-usage-with-resources`), `PLATFORM`, `TENANCY`, `RECORD_TYPE`, `LEGAL_ENTITY_NAME`, `DEPLOYMENT_OPTION`, `DATABASE_ENGINE`, `CACHE_ENGINE`, `INSTANCE_TYPE_FAMILY`, `REGION`, `BILLING_ENTITY`, `RESERVATION_ID`, `SAVINGS_PLANS_TYPE`, `SAVINGS_PLAN_ARN`, `PAYMENT_OPTION`, `AGREEMENT_END_DATE_TIME_AFTER`, `AGREEMENT_END_DATE_TIME_BEFORE`, `INVOICING_ENTITY`, `ANOMALY_TOTAL_IMPACT_ABSOLUTE`, `ANOMALY_TOTAL_IMPACT_PERCENTAGE`.

### 2. Discovering valid dimension values

Before filtering, list what's actually present:

```bash
# Which services are active this month?
aws ce get-dimension-values \
  --time-period Start=2026-04-01,End=2026-04-11 \
  --dimension SERVICE

# Which regions?
aws ce get-dimension-values \
  --time-period Start=2026-04-01,End=2026-04-11 \
  --dimension REGION
```

Example output for SERVICE in April 2026:
```
AWS CloudFormation, AWS Cost Explorer, AWS Glue, AWS Key Management Service,
AWS Secrets Manager, AWS Support (Business), Amazon Bedrock, Amazon EC2 Container Registry,
EC2 - Other, Amazon Elastic Compute Cloud - Compute, Amazon Elastic Container Service,
Amazon Elastic Load Balancing, Amazon Registrar, Amazon Route 53, Amazon Simple Storage Service,
Amazon Virtual Private Cloud, AmazonCloudWatch, Claude Haiku 4.5 (Amazon Bedrock Edition),
Claude Opus 4.5 (Amazon Bedrock Edition), Claude Opus 4.6 (Amazon Bedrock Edition),
Claude Sonnet 4.6 (Amazon Bedrock Edition), Tax
```

### 3. Budgets

```bash
aws budgets describe-budgets --account-id 301235909293
```

Check actual vs limit:
```bash
aws budgets describe-budgets --account-id 301235909293 | \
  python3 -c "
import sys, json
d = json.load(sys.stdin)
for b in d['Budgets']:
    name = b['BudgetName']
    limit = float(b['BudgetLimit']['Amount'])
    actual = float(b.get('CalculatedSpend', {}).get('ActualSpend', {}).get('Amount', 0))
    health = b.get('HealthStatus', {}).get('Status', 'UNKNOWN')
    print(f'{name}: \${actual:.2f} / \${limit:.2f} [{health}]')
"
```

Example:
```
My Zero-Spend Budget: $1514.35 / $1.00 [HEALTHY]   ← the "zero spend" template alarm; ignore
```

### 4. Savings Plans / Reserved Instances

```bash
aws savingsplans describe-savings-plans
# Returns {"savingsPlans": []} if none active (our case)

aws ec2 describe-reserved-instances --filters Name=state,Values=active
```

Our account has no savings plans or RIs as of 2026-04-11 — we pay on-demand for everything, which means `AmortizedCost == UnblendedCost` unless the master account spreads something down.

### 5. Available Bedrock models on the account

Not billing per se, but useful when answering "can we use model X":

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query 'modelSummaries[?modelLifecycle.status==`ACTIVE`].{id:modelId, name:modelName}' \
  --output table

# Filter to Anthropic:
aws bedrock list-foundation-models --region us-east-1 \
  --query 'modelSummaries[?contains(modelId, `anthropic`)].{id:modelId, name:modelName, status:modelLifecycle.status}'

# Filter to all non-Anthropic that we might be using:
aws bedrock list-foundation-models --region us-east-1 \
  --query 'modelSummaries[?contains(modelId, `kimi`) || contains(modelId, `minimax`) || contains(modelId, `nova`)]'
```

**Model ID format in Bedrock**: `<publisher>.<model>-<version>` (e.g. `anthropic.claude-opus-4-6`, `moonshotai.kimi-k2.5`). These map to the `USE1-<modelId>-{input,output}-tokens` usage types in Cost Explorer.

### 6. Forecast (budget projection)

```bash
aws ce get-cost-forecast \
  --time-period Start=2026-04-11,End=2026-05-01 \
  --metric UNBLENDED_COST \
  --granularity MONTHLY
```

Returns a single projected amount with lower/upper confidence bounds. Useful for runway math. The API has strict minimum window requirements — must start today or later.

---

## Cost Explorer API pricing gotcha

**Cost Explorer charges $0.01 per API call.** Every `aws ce ...` request costs a penny. Batch aggressively — request all the metrics/dimensions you need in one call rather than making five calls for five metrics.

Yesterday's invoice showed: `AWS Cost Explorer: $0.01 (1 call)`. Not a lot in absolute terms but worth knowing.

---

## Credit / discount handling

AWS has several credit types, all invisible from the member account view on this account:

| Credit type | Shows in `aws ce` | Visible from member? |
|---|---|---|
| AWS Promotional Credits | `NetUnblendedCost` < `UnblendedCost` | Only if applied to this account directly |
| AWS Activate (Startup) | Same as above | Applied at payer level usually |
| Enterprise Discount Program (EDP) | `NetUnblendedCost` reflects discount | Payer-only visibility |
| Savings Plans / RIs | `AmortizedCost` != `UnblendedCost` | Yes, via `savingsplans` + `ec2 describe-ri` |

**For us**: `NetUnblendedCost == UnblendedCost` in April → **no credits are being applied**. If we want credits, they need to be arranged via Automat-IT (master account) and pushed down.

---

## Region naming

AWS uses short region codes everywhere (us-east-1, eu-west-1, etc.). No gotchas here — much simpler than Azure.

In Cost Explorer `USAGE_TYPE` strings, the region is prefixed as a short code:
- `USE1` = us-east-1
- `USE2` = us-east-2
- `USW2` = us-west-2
- `EUW1` = eu-west-1
- `APN1` = ap-northeast-1

---

## Question → query cheat sheet

| Question | Command |
|---|---|
| What did we spend yesterday total? | `aws ce get-cost-and-usage --time-period Start=YYYY-MM-DD,End=YYYY-MM-DD+1 --granularity DAILY --metrics UnblendedCost` |
| What did we spend yesterday by service? | Add `--group-by Type=DIMENSION,Key=SERVICE` |
| What's MTD? | `Start=YYYY-MM-01,End=<today+1>` |
| What did Claude cost yesterday? | Filter by the four `Claude * (Amazon Bedrock Edition)` SERVICE values |
| What did Bedrock non-Claude cost? | Filter by `SERVICE=Amazon Bedrock` |
| Which Bedrock model cost the most? | Filter Bedrock + `--group-by Type=DIMENSION,Key=USAGE_TYPE` |
| Were credits applied? | Compare `UnblendedCost` vs `NetUnblendedCost` in one call |
| What budgets exist? | `aws budgets describe-budgets --account-id 301235909293` |
| What services are active this month? | `aws ce get-dimension-values --dimension SERVICE --time-period ...` |
| Cost forecast to end of month | `aws ce get-cost-forecast --time-period Start=<today>,End=<1st of next>` |
| What Bedrock models are enabled? | `aws bedrock list-foundation-models --region us-east-1` |
| Who is our AWS payer? | `aws organizations describe-organization` → `MasterAccountId` |

---

## Known unknowns

- **Credit balance on the master account**: We cannot see credits applied at the Automat-IT payer level from our member view. To get this, either request billing reports from Automat-IT or ask them for `Billing Reader` or consolidated-billing visibility.
- **Invoice history**: `aws ce get-cost-and-usage` reports consumption but not invoices. Invoices live at the master account level. There's no invoice list API from a member account.
- **Anomaly monitors**: `aws ce get-anomalies` can surface unexpected spikes but requires a configured monitor (`aws ce create-anomaly-monitor`). We haven't set one up.
- **Organization-level metadata**: `aws organizations list-accounts`, `list-policies`, etc. all return `AccessDenied` from this member account. Org-wide cost breakdown is payer-only.
- **Data-transfer and cross-AZ charges**: not visible in the SERVICE breakdown beyond "EC2 - Other". To get fine-grained DT cost, `--group-by Type=DIMENSION,Key=USAGE_TYPE_GROUP` and look for `EC2: Data Transfer - Inter-AZ` / `EC2: Data Transfer - Internet`.
