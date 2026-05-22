# AWS billing via `aws` CLI

Validated: **2026-04-12**. Re-validate if a command returns unexpected results or if we change organization membership.

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

## Known identifiers (our accounts)

We have THREE AWS contexts to keep straight:

### Context A — Pollinations-via-Automat-IT (the original `301235909293` member)

```
Account ID:        301235909293
Account type:      Linked member account (NOT payer)
Identity:          root user (IAM access keys in ~/.aws/credentials [default])
Organization:      o-m67rvmyvhq
Master account:    813596885972  ← Automat-IT (automat-it.com)
Master email:      aws.ait.org.nsbu@automat-it.com
Default region:    us-east-1
```

### Context B — Myceli-direct (`301235909293` direct billing for NVIDIA Inception credits)

Same account ID as Context A historically — see "Pattern B" in the credits section. Manual seed of credit balance via `apps/operation/finance/secrets/aws-credits.json`.

### Context C — NEW Myceli AWS Organization (multi-account Control Tower, May 2026)

Set up sometime around April 2026, populated by Automat-IT. Resold AGAIN through Automat-IT (same payer model as Context A — confirmed via master account email).

```
Org ID:            o-kh571dk57p
Master account:    202731947268  awsacct+myceli-ai+org@automat-it.com  (= AWS-AIT-ORG-Myceli AI; the org payer = Automat-IT once again)
Default region:    us-east-1
Auth:              AWS SSO via https://ssoins-68049670fff44d25.portal.eu-west-1.app.aws (Identity Center, eu-west-1)
                   Login: `aws sso login --sso-session myceli`  (use `--no-browser` + incognito if Google OAuth gets "It's not you, it's us")
Legal entity:      Amazon Web Services EMEA SARL (no Marketplace charges yet)
```

8 linked accounts (standard AWS Control Tower landing-zone layout):

| Account ID | Profile name | Role | Owner email |
|---|---|---|---|
| 202731947268 | `myceli-management` | Org payer / Control Tower management | awsacct+myceli-ai+org@automat-it.com |
| 283434716067 | `myceli-dev` | Dev | awsacct+dev@myceli.ai |
| 514585225061 | `myceli-prod` | Prod | awsacct+prod@myceli.ai |
| 820905680838 | `myceli-staging` | Staging | awsacct+staging@myceli.ai |
| 934822760778 | `myceli-network` | Shared networking / Transit Gateway | awsacct+network@myceli.ai |
| 562077794032 | `myceli-devops` | DevOps shared services | awsacct+devops@myceli.ai |
| 705942571777 | `myceli-audit` | Security audit (Security Hub, GuardDuty) | awsacct+audit@myceli.ai |
| 529589820257 | `myceli-log-archive` | Central CloudTrail/Config log archive | awsacct+log-archive@myceli.ai |

All 8 profiles use SSO role `AWSAdministratorAccess`. Switch with `--profile myceli-<name>` or `export AWS_PROFILE=myceli-<name>`.

**SSO login gotcha (validated 2026-05-17)**: The Google OAuth handoff at `ssoins-68049670fff44d25.portal.eu-west-1.app.aws` returns "It's not you, it's us" in normal browser sessions due to stale AWS cookies from other tenants. **Workaround**: run `aws sso login --sso-session myceli --no-browser`, copy the device-code URL into an **incognito window**, complete OAuth there. The CLI then completes within ~5 seconds.

**Token cache**: lives at `~/.aws/sso/cache/*.json`. Each profile gets its own cached role token under `~/.aws/cli/cache/`. Tokens last 8h by default; re-run `aws sso login` to refresh.

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

### 6. Model rate limits (Service Quotas)

Query per-model RPM and TPM limits via the Service Quotas API:

```bash
# All Bedrock quotas (1127+ entries):
aws service-quotas list-service-quotas --service-code bedrock --region us-east-1

# Filter to a specific model:
aws service-quotas list-service-quotas --service-code bedrock --region us-east-1 \
  --query "Quotas[?contains(QuotaName, 'Claude Sonnet 4.6')]"
```

**Key rate limits (validated 2026-04-12):**

| Model | Type | RPM | TPM |
|---|---|---:|---:|
| Claude Opus 4.6 | Cross-region | 10,000 | 3,000,000 |
| Claude Sonnet 4.6 | Cross-region | 10,000 | 6,000,000 |
| Claude Opus 4.5 | Cross-region | 10,000 | 2,000,000 |
| Claude Sonnet 4.5 | Cross-region | 10,000 | 200,000 |
| Claude Sonnet 4.5 (1M ctx) | Cross-region | 1,000 | 1,000,000 |
| Claude Haiku 4.5 | Cross-region | 10,000 | 5,000,000 |
| Nova Micro | Cross-region | 4,000 | 8,000,000 |
| Nova Lite | Cross-region | 4,000 | 8,000,000 |
| Nova Pro | Cross-region | 500 | 2,000,000 |
| Nova Premier | Cross-region | 500 | 2,000,000 |
| Kimi K2.5 | Single-region | 10,000 | 100,000,000 |
| Kimi K2 Thinking | Single-region | 10,000 | 100,000,000 |
| DeepSeek V3.2 | Single-region | 10,000 | 100,000,000 |
| MiniMax M2.5 | Single-region | 10,000 | 100,000,000 |
| GLM 5 | Single-region | 10,000 | 100,000,000 |

**Key patterns:**
- Claude models use **cross-region** inference profiles (`us.anthropic.*`)
- Third-party models (Kimi, DeepSeek, MiniMax, GLM) use **single-region** only, with very generous limits (100M TPM)
- Older Claude models (3.x) have much lower limits than 4.x generation
- 1M context length variants have separate, lower RPM quotas

### 7. Inference profiles

```bash
# List all cross-region inference profiles:
aws bedrock list-inference-profiles --region us-east-1
```

57 inference profiles available. These enable routing across regions for higher availability and throughput. Claude models use the `us.anthropic.*` prefix for cross-region inference.

### 8. Forecast (budget projection)

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

## Credits and discounts — what we can see, what we cannot, and what to do about it

**TL;DR for our Pollinations-via-Automat-IT account**: we CAN see usage, CAN detect savings-plan coverage effects, and CAN compare list-vs-net cost. We CANNOT see credit balances, credit grants, or credit expiry dates — those live on the payer account (Automat-IT) and are **structurally invisible** to our linked member account. If we want answers about credits themselves, we have to ask Automat-IT.

This section is the operator's manual for every credit-related question on AWS.

### AWS credit taxonomy

Understand the five distinct things people call "credits", because they appear in different APIs:

| # | Name | Mechanism | How it reaches us |
|---|---|---|---|
| 1 | **AWS Promotional Credits** | Flat $ off your bill, stamped with a program code, often time-limited | Usually applied to a specific account; shows up as `RECORD_TYPE=Credit` with negative amount |
| 2 | **AWS Activate** (startup program) | Typically $1k–$100k promotional credits granted to startups | Same mechanism as promotional credits |
| 3 | **AWS Rise** / other partner programs | Same again | Same |
| 4 | **Savings Plans (SPs)** | Pre-purchased hourly commitment, gets a discount vs list | Shows as `SavingsPlanCoveredUsage` + `SavingsPlanNegation` pair (offsetting) |
| 5 | **Enterprise Discount Program (EDP)** | % off negotiated at contract level | Invisible in API; only the *effect* shows up as lower list prices |

Items 1–3 behave identically in the API: a `Credit` record with negative amount, applied at invoice close. Items 4 and 5 are structurally different — SPs show up in real time as coverage, EDP is pre-baked into the prices you see.

### What our member account CAN query (live validated 2026-04-11)

#### 1. `RECORD_TYPE` dimension — the definitive check for "is anything being applied?"

```bash
# Enumerate what record types exist on our account
aws ce get-dimension-values \
  --time-period Start=2026-01-01,End=2026-04-12 \
  --dimension RECORD_TYPE \
  --output json
```

**Our actual result (2026-04-11)**:

```
DiscountedUsage
Other
SavingsPlanCoveredUsage
SavingsPlanNegation
Support
Tax
Usage
```

**No `Credit`. No `Refund`.** These are the canonical record-type values that appear when credits land. Their absence means **our member account receives zero direct credit application** — it's a dimension that has literally never had a value for us. If credits existed for us here, they'd be in this list.

#### 2. Group by `RECORD_TYPE` — see the monthly composition

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-12 \
  --granularity MONTHLY \
  --metrics UnblendedCost NetUnblendedCost \
  --group-by Type=DIMENSION,Key=RECORD_TYPE
```

**Our actual April-to-date result** (values in USD):

```
month      record_type                       unblended            net
--------------------------------------------------------------------
2026-04    Usage                               1098.87        1098.87
2026-04    Other                                279.00         279.00   ← Bedrock/Marketplace (Claude)
2026-04    SavingsPlanCoveredUsage              165.91         165.91
2026-04    SavingsPlanNegation                 -165.91        -165.91   ← offsets above, net zero
2026-04    Support                               98.30          98.30
2026-04    Tax                                  122.70         122.70
```

**Key reads from this output:**

1. **`UnblendedCost == NetUnblendedCost` on every row** → no credits of any kind are modifying our post-discount number. This is the cleanest single signal.
2. **SavingsPlanCoveredUsage + SavingsPlanNegation = 0** → a Savings Plan IS covering $166/month of our usage. **BUT** the pair offsets to zero, meaning the SP is accounted for elsewhere (at the payer account, where the SP was purchased). From our member view it's neutral — we neither pay extra nor save money directly from it.
3. **`Other`** is the RECORD_TYPE bucket where AWS puts third-party Marketplace charges like Claude (Anthropic is the selling entity). This is separate from `Usage` (first-party AWS consumption).
4. **Support** is our Business support plan fee (~$100/month).
5. **Tax** is VAT.

**Total April MTD**: $1,098 (Usage) + $279 (Other/Claude) + $98 (Support) + $123 (Tax) = **$1,599** list price, **$1,599** net (no credits).

#### 3. Metric comparison — the fastest sanity check

One call returns four different cost metrics:

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-12 \
  --granularity MONTHLY \
  --metrics BlendedCost UnblendedCost NetUnblendedCost AmortizedCost NetAmortizedCost
```

**Interpretation rules**:

| Comparison | Meaning |
|---|---|
| `NetUnblendedCost < UnblendedCost` | Credits are being applied. The delta = credit amount. |
| `NetUnblendedCost == UnblendedCost` | **Zero credits applied** — current state for our account. |
| `AmortizedCost != UnblendedCost` | Savings Plans or RIs exist (the SP's upfront fee gets spread over the commitment period). |
| `BlendedCost != UnblendedCost` | Consolidated-billing org-wide blended rate differs from our individual rate. Normal on linked members. |

**For our account right now**: `NetUnblendedCost == UnblendedCost` across every month probed. Hard evidence of zero credit application.

#### 4. `LEGAL_ENTITY_NAME` — who AWS is billing us for

```bash
aws ce get-dimension-values \
  --time-period Start=2026-03-01,End=2026-04-12 \
  --dimension LEGAL_ENTITY_NAME
```

**Our result**:
```
Amazon Web Services EMEA SARL     ← standard AWS services
Anthropic, PBC                    ← Claude on Bedrock (sold through AWS Marketplace)
```

Useful for: confirming which legal entity a charge comes from. Claude being under `Anthropic, PBC` explains why it shows as its own top-level SERVICE (see "Claude models are NOT under 'Amazon Bedrock'" gotcha elsewhere in this file) and why Claude credits (if any existed) would have to come from Anthropic's Marketplace credit system, not AWS's.

#### 5. `aws freetier get-free-tier-usage` — the Free Tier surface

```bash
aws freetier get-free-tier-usage --output json
```

Returns utilization vs the AWS Always-Free quota for each service. **This is NOT "credits left"** — it's "how much of the always-free quota we've used this month" (e.g., 1M Glue catalog requests, 5GB CloudWatch storage, etc.). For a production workload this is a curiosity, not a runway number.

### What our member account CANNOT query

Every one of these APIs either 404s, 403s with `AccessDeniedException`, or returns empty from a linked member. If you need an answer to one of these questions, **stop trying to derive it from the CLI and ask Automat-IT directly**.

| Question | Why blocked |
|---|---|
| **How much credit balance is left on our account?** | There is NO AWS API for "credit balance remaining" on any account. Not member, not payer. AWS exposes this ONLY via the Console UI at Billing → Credits. And for us that tab is blank because credits live on the payer. |
| **Total credits granted to our org** | Same — no API, and only visible to Automat-IT's Console UI. |
| **Credits consumed to date** | Same — only appears in the payer's Billing Console UI, not ours. |
| **Credit expiration dates** | Same. No API. |
| **Does our org have a startup credit grant at all?** | Unknowable from our side. You have to ask Automat-IT or look at the grant paperwork. |
| **What Savings Plans cover our account?** | `aws savingsplans describe-savings-plans` returns `[]` from our member account — the SP is owned by the payer. We only see its *effect* via `RECORD_TYPE=SavingsPlanCoveredUsage`, which tells us how much coverage we got but NOT the term, commitment amount, upfront fee, or expiry date of the plan. |
| **What Reserved Instances cover our account?** | Same as SPs — if RIs exist at the payer level, we only see their effect. `ec2 describe-reserved-instances` returns only RIs we own directly. |
| **What Cost Categories are configured?** | `aws ce list-cost-category-definitions` → `AccessDeniedException: Linked account doesn't have access to cost category`. Payer-only. |
| **Organization structure / other accounts** | `aws organizations list-accounts`, `list-policies`, etc. all 403. Org-level APIs are payer-only. |
| **Billing Groups (BillingConductor)** | `aws billingconductor list-billing-groups` → `AccessDeniedException: Only payer account is authorized`. |
| **Enterprise Discount Program (EDP) terms** | If an EDP exists, it's pre-baked into the prices in our Cost Explorer output. You cannot extract "you are getting X% off" from the API. |

### What we actually know about our account's credit posture

Based on every signal we can query (all validated 2026-04-11):

| Signal | State |
|---|---|
| `RECORD_TYPE=Credit` rows exist | ❌ Never. Not in the dimension values, not in any query. |
| `NetUnblendedCost < UnblendedCost` | ❌ Always equal. Literally zero difference. |
| Savings Plans visible locally | ❌ `savingsplans describe-savings-plans` returns empty. |
| Savings Plan *coverage effect* visible | ✅ $165.91/month of coverage, net effect zero (offset at payer) |
| Reserved Instances owned | ❌ None. |
| Free tier usage | ✅ Tracked, but tiny (irrelevant for our production workload) |
| Our `LEGAL_ENTITY_NAME` list | AWS EMEA SARL + Anthropic PBC |

**Conclusion**: we're paying list price on every dollar of usage, with the only "modification" being the SP-coverage-and-negation pair that nets to zero in our view. Whether Automat-IT is absorbing that SP cost on their side (giving us a hidden discount) or passing it through is **unknowable from our side** — same answer as for the credit question.

### The "what should we do about it" decision matrix

Use this table to decide the next action for any credit/discount question on AWS:

| What you want to know | How to get it | Effort |
|---|---|---|
| "Are credits being applied to our usage right now?" | `aws ce get-cost-and-usage --group-by Type=DIMENSION,Key=RECORD_TYPE` — look for `Credit` rows | 1 call, instant |
| "What's the net discount % we're getting?" | Same call, compare `UnblendedCost` vs `NetUnblendedCost` sums | Instant |
| "Is there a Savings Plan covering our account?" | Same call — if you see `SavingsPlanCoveredUsage` rows, yes | Instant |
| "What are the SP terms (commitment, end date)?" | ⚠️ CANNOT. Ask Automat-IT. | Email, ~1 day |
| "What credit balance do we have at AWS org level?" | ⚠️ CANNOT. Ask Automat-IT. | Email, ~1 day |
| "Should we apply for AWS Activate credits?" | Check https://aws.amazon.com/activate/ — partner referral path. **Credits would go to our org, which means Automat-IT**. Verify with them that credits flow down to us before applying. | 1-4 weeks |
| "Can we move to our own payer account so we see everything?" | Yes but it's a migration — terminate the member relationship and set up a standalone AWS Organization. Non-trivial; talk to Automat-IT about breakage before doing it. | Weeks |
| "Is Automat-IT applying a discount we can't see?" | Compare our `UnblendedCost` (which already reflects list price) vs what the Umbrella Cost reseller dashboard shows. **Umbrella shows the real invoiced number.** ⚠️ Umbrella API is currently blocked at tenant level — see [umbrella-cost.md](umbrella-cost.md) "Session 1 validation results" for unblock path. | Blocked pending Automat-IT API access grant |

### The Umbrella Cost escape hatch

The ONLY way to see our "true" post-reseller-discount cost without leaving the Automat-IT relationship is via the **Umbrella Cost dashboard** (Automat-IT's FinOps platform). When Umbrella API access is unblocked (currently pending — see [umbrella-cost.md](umbrella-cost.md)), we'll be able to compare:

- **Our AWS CLI `UnblendedCost`** = AWS list price = what we pay
- **Umbrella `net_unblended` / actual invoiced amount** = what Automat-IT actually charges us

The difference between those two is **either** (a) a reseller discount Automat-IT is passing through to us, **or** (b) a wash — Automat-IT marks us up to list price. Until Umbrella API access works, this is unresolved.

**If Umbrella shows a lower number**, that's the effective credit/discount we're receiving, even though AWS CLI claims zero credits. It'd be off-invoice reseller margin rather than a true credit, but the effect is the same for runway math.

### Key decisions flowing from this

1. **Runway math must use `UnblendedCost`, not `NetUnblendedCost`**. They're equal on our account, so it doesn't matter numerically — but this makes the intent clear: we're not trying to subtract non-existent credits. Use `UnblendedCost` and don't worry about it.

2. **Don't hunt for ghost credits**. We've confirmed via four independent signals (RECORD_TYPE enum, per-month RECORD_TYPE grouping, metric comparison, savings plan inventory) that zero direct credit application is happening. Stop asking the AWS API about credits for this account — the answer is "the API doesn't know because it's not ours to know."

3. **For runway accuracy, prioritize getting Umbrella unblocked**. The Automat-IT reseller margin (if any) is the one real cost adjustment we can't see from AWS CLI. Every other source of discount has been ruled out via CLI.

4. **If we want real AWS credits in the future**, we need to either:
   - (a) Apply for AWS Activate or another program AND verify with Automat-IT that the credits will be attached to our specific member account (not the org payer), OR
   - (b) Move to a standalone AWS account (break the Automat-IT relationship). Only worth it if credits are substantial enough to offset the cost of losing reseller support.

5. **Track monthly `UnblendedCost` month-over-month** as the authoritative number. This month's April MTD: $1,599. The Savings Plan is invisible to us but not hurting us. Treat this number as the real cost. Anything lower on the actual Automat-IT invoice is a gift.

### Integration with the finance runway app — credit visibility gotcha

`apps/operation/finance` tracks credit pools in `vendors.json._pools`. The Cost Explorer API has a structural blind spot for AWS credits that applies to **both** our accounts:

1. The Pollinations-AIT-resold account (`813596885972`): credits live at the Automat-IT payer level and never surface in our view — `RECORD_TYPE=Credit` returns no rows, `NetUnblendedCost == UnblendedCost`. See the long write-up above for the four independent signals confirming this.

2. The Myceli-direct account (`301235909293`): direct-billed by AWS EMEA SARL (no reseller). The Billing Console clearly shows credits absorbing usage (e.g. $74,999.99 of NVIDIA Inception credits used on a $75k grant), but the API still shows `RECORD_TYPE` groupings of `Usage / Support / Tax / SavingsPlanCoveredUsage / SavingsPlanNegation / Other` with **no `Credit` row**, and `NetUnblendedCost == UnblendedCost`. AWS applies credits at invoice time, not via the public CE API. This is a documented inconsistency — AWS Activate-style credits are notorious for not surfacing in `RECORD_TYPE=Credit` for the recipient account.

So programmatic balance tracking via the API alone isn't possible on either account. The finance app handles this with two different patterns:

**Pattern A — Pollinations account (`813596885972`):** `kind: "payg"`, no balance row. Treat `UnblendedCost` as cash spend; if Automat-IT ever starts flowing credits down, the effect will appear programmatically as `NetUnblendedCost < UnblendedCost` and we can swap to Pattern B.

**Pattern B — Myceli account (`301235909293`):** hybrid manual seed with auto-decrement. The operator copies the "Total amount remaining" number from `https://console.aws.amazon.com/billing/home?region=us-east-1#/credits` into `apps/operation/finance/secrets/aws-credits.json` (gitignored) plus today's date as the anchor. The `aws.mjs` provider then queries CE for daily `UnblendedCost` since the anchor and treats 100% of it as credit burn while the seed is positive. Matches reality on this account because credits absorb essentially all usage. Drift between our model and AWS's actual application is corrected on the next monthly re-anchor.

`secrets/aws-credits.json` shape:
```json
{
  "as_of": "2026-05-06",
  "balance_usd": 32114.88,
  "grants": [
    { "name": "Myceli AI_MAP",                       "remaining": 31195.70, "expires": "2027-03-31" },
    { "name": "AWS Activate - Antler Global PARENT", "remaining":   919.17, "expires": "2027-09-30" },
    { "name": "AWS Activate - NVIDIA Inception",     "remaining":     0.01, "expires": "2026-11-30" }
  ]
}
```

`vendors.json._pools.AWS` shape under Pattern B (no `kind` field — wrapper sets `current_balance_usd` and signals `live_balance: true`, so the orchestrator trusts it):
```json
"AWS": {
  "provider": "aws",
  "as_of": "2026-05-06",
  "vendor_canonical": "AWS",
  "mtd_total_usd": 4.20,
  "mtd_credit_usd": 4.20,
  "mtd_cash_usd": 0
}
```

**Refresh ritual (Pattern B):** once a month, open the Credits Console, copy `Total amount remaining` into `balance_usd`, bump `as_of` to today. That's the entire operator overhead.

**Why not auto-scrape the Credits Console?** It's a private React UI behind cookie auth; no documented API. Manual paste is fragile but observable; scraping would be fragile and silent. Re-anchoring takes 15 seconds and has the side benefit of forcing eyeballs on the runway number monthly.

Credential gotcha for the finance app: `apps/operation/finance` loads shared gen worker model secrets for provider API keys, but it must ignore `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` from those shared secrets. The gen worker AWS keys are Bedrock runtime credentials (`portkey-bedrock-access`) and can fail Cost Explorer with `ce:GetCostAndUsage` `AccessDenied`; finance should use the local/default AWS CLI credential chain configured for billing.

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
| What's our RPM/TPM limit for a model? | `aws service-quotas list-service-quotas --service-code bedrock --query "Quotas[?contains(QuotaName, 'Claude Sonnet 4.6')]"` |
| List all inference profiles | `aws bedrock list-inference-profiles --region us-east-1` |
| Is a model available on our account? | `aws bedrock get-foundation-model-availability --model-id <id> --region us-east-1` |
| Who is our AWS payer? | `aws organizations describe-organization` → `MasterAccountId` |

---

---

## Myceli org (Context C) — May 2026 baseline snapshot

Validated 2026-05-17 from `myceli-management` profile.

### Spend posture

```
April 2026:        $0.02       (org just provisioned)
May 2026 MTD:      $178.89     (May 1–17, estimated)
May 2026 forecast: $404.03     (full month projection from Cost Explorer)
```

By linked account (May MTD):

```
283434716067 (dev)         $50.61
934822760778 (network)     $35.08    ← NAT Gateway / Transit Gateway
514585225061 (prod)        $34.64
562077794032 (devops)      $33.48
202731947268 (management)  $12.66
529589820257 (log-archive)  $7.77    ← CloudTrail S3 storage
705942571777 (audit)        $3.18
820905680838 (staging)      $1.46
```

By service (May MTD):

```
$54.45  Amazon Virtual Private Cloud   ← NAT gateway hours + data
$47.66  EC2 - Other                    ← EBS + cross-AZ data transfer
$27.29  Tax                            ← Luxembourg VAT
$12.84  Amazon RDS                     ← a small RDS instance somewhere
$11.67  AWS Config                     ← Control Tower drift detection (org-wide)
$10.99  AWS CloudTrail                 ← Control Tower trail
$ 6.92  AWS Cost Explorer              ← $0.01 per API call, racks up fast
$ 5.46  AWS KMS                        ← per-key fees for SSE-KMS encryption
```

Reading: this is **landing-zone baseline cost** — Control Tower's Config/CloudTrail trails plus a NAT Gateway in the network account. There are no production workloads burning meaningful cost yet. The forecast of $404/mo is the cost just to keep the lights on with zero workload — typical Control Tower overhead.

### Credits / discounts on Context C — same blackout as Context A

```
RECORD_TYPE values present:    Usage, Tax, Solution Provider Program Discount
RECORD_TYPE values ABSENT:     Credit, Refund, SavingsPlanCoveredUsage, SavingsPlanNegation
UnblendedCost vs NetUnblendedCost (May MTD): $179.82 vs $178.89  → $0.93 SPP discount
```

**Critical for the runway app**: the org pays through Automat-IT, just like the original Pollinations member account. Same structural blackout applies:

- `aws ce` shows **list price**, not what we actually pay
- AWS credits granted to the org (Activate, promotional, anything) live on Automat-IT's payer-side ledger and never surface via the member CLI
- The `Solution Provider Program Discount` row is the **only** credit-like visibility we have — it shows what the reseller is passing through. May MTD pass-through = 0.5% (negligible).
- Wise payments to Automat-IT (e.g. the $4,000 wire on the books) do NOT appear anywhere in `aws ce` — those are Automat-IT's accounts-receivable entries, not AWS-side records. Need to ask Automat-IT for invoice confirmation, or unblock the Umbrella Cost API (see [umbrella-cost.md](umbrella-cost.md)) to see invoice line items.

### Investigating credits on the new myceli org

If Automat-IT has loaded credits onto this org (e.g. a fresh AWS Activate package starting 2026-05-01), here's how to detect application:

```bash
# Run monthly — if NetUnblendedCost ever drops below UnblendedCost, credits started flowing
aws ce get-cost-and-usage \
  --time-period Start=2026-05-01,End=2026-06-01 \
  --granularity MONTHLY \
  --metrics UnblendedCost NetUnblendedCost \
  --profile myceli-management

# Or list RECORD_TYPE values — `Credit` will appear the first month it lands
aws ce get-dimension-values \
  --time-period Start=2026-05-01,End=2026-06-01 \
  --dimension RECORD_TYPE \
  --profile myceli-management
```

If neither signal moves and you know credits *should* be applied, the credits are on the master ledger and not flowing down to our org. Email Automat-IT (the master account holder, `awsacct+myceli-ai+org@automat-it.com`) to confirm grant and ask whether they pass it through.

### No budgets, no anomaly monitors, no SPs

```
aws budgets describe-budgets   → empty on all 8 accounts
aws savingsplans describe-savings-plans → []
aws ce get-anomalies           → no anomaly monitors configured
```

Worth setting up at least one anomaly monitor on the management account to catch landing-zone cost drift before it gets expensive.

---

## Question → query cheat sheet (Myceli org, Context C)

| Question | Command |
|---|---|
| Who am I authenticated as right now? | `aws sts get-caller-identity --profile myceli-management` |
| Refresh expired SSO token | `aws sso login --sso-session myceli` (`--no-browser` + incognito if portal errors) |
| Total MTD spend across org | `aws ce get-cost-and-usage --time-period Start=YYYY-MM-01,End=<today+1> --granularity MONTHLY --metrics UnblendedCost --profile myceli-management` |
| Spend by linked account | Add `--group-by Type=DIMENSION,Key=LINKED_ACCOUNT` |
| Spend by service | Add `--group-by Type=DIMENSION,Key=SERVICE` |
| Are credits flowing yet? | Compare `UnblendedCost` vs `NetUnblendedCost` AND check `--dimension RECORD_TYPE` for "Credit" |
| Forecast end-of-month | `aws ce get-cost-forecast --time-period Start=<today>,End=<1st of next> --metric UNBLENDED_COST --granularity MONTHLY --profile myceli-management` |
| List all 8 accounts | `aws organizations list-accounts --profile myceli-management` |

---

## Known unknowns

- **Credit balance on the master account**: We cannot see credits applied at the Automat-IT payer level from our member view. To get this, either request billing reports from Automat-IT or ask them for `Billing Reader` or consolidated-billing visibility.
- **Invoice history**: `aws ce get-cost-and-usage` reports consumption but not invoices. Invoices live at the master account level. There's no invoice list API from a member account.
- **Anomaly monitors**: `aws ce get-anomalies` can surface unexpected spikes but requires a configured monitor (`aws ce create-anomaly-monitor`). We haven't set one up.
- **Organization-level metadata**: `aws organizations list-accounts`, `list-policies`, etc. all return `AccessDenied` from this member account. Org-wide cost breakdown is payer-only.
- **Data-transfer and cross-AZ charges**: not visible in the SERVICE breakdown beyond "EC2 - Other". To get fine-grained DT cost, `--group-by Type=DIMENSION,Key=USAGE_TYPE_GROUP` and look for `EC2: Data Transfer - Inter-AZ` / `EC2: Data Transfer - Internet`.
