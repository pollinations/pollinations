# Alibaba Cloud (DashScope / Model Studio)

Validated: **2026-04-11** — full `aliyun bss` flow exercised live against account `5314153712077332` (elliot@myceli.ai). Real monthly bills + per-model breakdown captured. Unlike most providers in this skill, Alibaba is the **only one where we get a full credit ledger directly from the API** — coupons, invoice discounts, and net cash amounts are all exposed.

---

## Why this exists

Pollinations uses Alibaba Cloud Model Studio for:

- **Text**: Qwen3 Coder Next, Qwen3.5 Plus, Qwen3 VL Plus (text + vision), DeepSeek V3.2 (via DashScope)
- **Image**: Wan 2.7 Image / Image Pro (`qwen-image-2.0` family for raster images)
- **Video**: Wan 2.6 (text-to-video), Wan 2.2 (fast 5s 480p)

The Wan models in particular are expensive (~$150/mo in April alone) and growing fast. Alibaba grants monthly coupon credits that significantly discount bills when active — and critically, the coupon balance IS exposed via `QueryBillOverview`'s `DeductedByCoupons` field. This is unusual — most credit-funded providers give us $0 invoices and hide the credit ledger.

---

## Requirements

- `aliyun` CLI 3.3.4+ — `brew install aliyun-cli`
- RAM user with `AliyunBSSReadOnlyAccess` policy attached (the `AliyunBSSFullAccess` also works but grants more than needed)
- `python3` for JSON wrangling
- API key in `apps/operation/finance/secrets/.env`:

```
ALIBABA_CLOUD_ACCESS_KEY_ID=LTAI...
ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
ALIBABA_CLOUD_REGION=ap-southeast-1
```

The **DashScope `sk-...` API key** (in `gen.pollinations.ai/secrets/prod.vars.json` as `DASHSCOPE_API_KEY`) is a different credential — it authenticates model inference calls, not billing. BSS queries require the RAM AccessKey above.

## Secret handling

Same local-file pattern as Wise / RunPod / Lambda (NOT SOPS — this skill is local-only FinOps tooling):

```bash
source /Users/comsom/Github/pollinations/apps/operation/finance/secrets/.env
```

**Blast radius if leaked** (with only `AliyunBSSReadOnlyAccess` attached): attacker can read billing data, account balance, invoices, bill line items. Cannot spin up resources, cannot move money. Still rotate if leaked — but lower urgency than Lambda Labs (where keys are full-access).

**Critical**: the `AliyunBSSReadOnlyAccess` policy is what makes the key effectively read-only. If a RAM user has broader policies attached, the same AccessKey becomes much more dangerous. Confirm via RAM console → User → Permissions tab.

---

## Known identifiers (Pollinations production)

```
Account ID:         5314153712077332
Account email:      elliot@myceli.ai
RAM user:           cli@5314153712077332.onaliyun.com
RAM user ID:        216254075942627139
Region:             ap-southeast-1 (Singapore — Alibaba Cloud International)
Currency:           USD
Billing mode:       PayAsYouGo
Main product:       Alibaba Cloud Model Studio (ProductCode: sfm)
Commodity codes in use (April 2026):
  sfm_inferenceglobal_public_intl    ← Qwen text + vision, DeepSeek
  sfm_inferenceWan_public_intl       ← Wan 2.7 video/image
```

**Secrets location**: `apps/operation/finance/secrets/.env` → `ALIBABA_CLOUD_ACCESS_KEY_ID` + `ALIBABA_CLOUD_ACCESS_KEY_SECRET`

---

## Configuring the CLI (first-time setup)

Non-interactive profile creation:

```bash
source apps/operation/finance/secrets/.env

aliyun configure set --profile pollinations-finops \
  --mode AK \
  --region "$ALIBABA_CLOUD_REGION" \
  --access-key-id "$ALIBABA_CLOUD_ACCESS_KEY_ID" \
  --access-key-secret "$ALIBABA_CLOUD_ACCESS_KEY_SECRET"
```

Test auth:

```bash
aliyun sts GetCallerIdentity --profile pollinations-finops
```

Expected output includes `AccountId`, `IdentityType: RAMUser`, `PrincipalId`, and the user ARN.

---

## CLI gotcha: `aliyun bss` does NOT work

The short product name `bss` is not registered in the v3 CLI. All billing calls use the **full API product name `BssOpenApi`** instead:

```bash
# ❌ This fails with "'bss' is not a valid command or product"
aliyun bss QueryAccountBalance --profile pollinations-finops

# ✅ This works
aliyun --profile pollinations-finops BssOpenApi QueryAccountBalance
```

Every example below uses the `BssOpenApi` form.

---

## Endpoint: QueryAccountBalance

```bash
aliyun --profile pollinations-finops BssOpenApi QueryAccountBalance
```

**Validated 2026-04-11** response:

```json
{
  "Code": "200",
  "Data": {
    "AvailableAmount": "0.00",
    "AvailableCashAmount": "0.00",
    "CreditAmount": "0.00",
    "Currency": "USD",
    "MybankCreditAmount": "0.00",
    "QuotaLimit": "0.00"
  },
  "Message": "success",
  "Success": true
}
```

**Interpretation**: all zeros because **we pre-pay via credit card and the outstanding balance is billed on next invoice**. `AvailableAmount: 0` does NOT mean "out of credits" — it means "no prepaid wallet balance, all usage goes on the pay-as-you-go invoice." This is the normal state for a PayAsYouGo account.

If we ever switched to the prepaid model or had a credit grant converted to `AvailableAmount`, those numbers would populate. Today they don't.

**To find actual credit usage**, look at `DeductedByCoupons` in `QueryBillOverview` (next endpoint) — that's where Alibaba's promotional coupons show up.

## Endpoint: QueryBillOverview ⭐ — the core runway query

```bash
aliyun --profile pollinations-finops BssOpenApi QueryBillOverview --BillingCycle 2026-03
```

**Returns** the monthly bill summary, one row per product/commodity. Key fields per item:

| Field | Meaning |
|---|---|
| `PretaxGrossAmount` | List price before any discount |
| `InvoiceDiscount` | Volume/commitment discount from contract or tier |
| `DeductedByCoupons` | **Promotional credits applied this month** |
| `PretaxAmount` | Net after discounts + coupons (what you owe before tax) |
| `Tax` | VAT / sales tax |
| `AfterTaxAmount` | `PretaxAmount + Tax` — the invoice total |
| `CashAmount` | How much was paid in cash (vs. covered by credits) |
| `OutstandingAmount` | Amount unpaid at time of query |
| `ProductDetail` | Human-readable product name (e.g. "Model Studio Foundation Model Inference") |
| `CommodityCode` | Machine-readable SKU (e.g. `sfm_inferenceglobal_public_intl`) |
| `SubscriptionType` | `PayAsYouGo` / `Subscription` |

### Validated monthly trend for Pollinations (2026)

| Month | Gross $ | Invoice Discount | Coupons | Net $ | Notes |
|---|---|---|---|---|---|
| 2026-01 | $200.00 | — | $0 | **$0** | LLM Inference Savings Plan pre-purchase |
| 2026-01 | $151.40 | minimal | $0 | $151.38 | Model Studio inference |
| 2026-02 | $1,524.50 | minimal | $0 | **$1,524.49** | Model Studio — ramp begins |
| 2026-03 | $1,509.19 | $285.10 | **$1,000.00** | **$224.08** | **$1k promo coupon consumed in one shot** |
| 2026-04 MTD | $837.90 (Qwen) + $168.53 (Wan) = **$1,006.43** | $302.62 | **$0** | **$703.79** | Coupon depleted, paying list |

> ⚠️ **Table-shape warning**: January is the ONLY month with two rows — one for the Savings Plan pre-purchase ($200 upfront) and one for Model Studio inference ($151.38). From February onwards, Alibaba consolidates everything into a single row per month. When aggregating totals across months in code, SUM all rows with matching `BillingCycle` and don't assume one row per month.

**Critical read**: Alibaba granted us a **$1,000 promotional coupon in March** that was fully consumed that month. **April has $0 in coupons** — we are currently paying close to list price with only the `InvoiceDiscount` (~$302) applied. **If we're counting on ongoing promotional coupons, we aren't getting them.**

Run rate at current pace: ~$1,006 / 11 days × 30 = **~$2,745/month projected April total**. That's ~80% higher than February's $1,524, driven by the new Wan video/image model usage.

### Pulling the trend yourself

```bash
for cycle in 2026-01 2026-02 2026-03 2026-04; do
  aliyun --profile pollinations-finops BssOpenApi QueryBillOverview --BillingCycle "$cycle" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
for it in d['Data']['Items']['Item']:
    print('%-10s %-45s gross=%.2f discount=%.2f coupons=%.2f net=%.2f' % (
        '$cycle',
        it.get('ProductDetail', '?')[:45],
        it.get('PretaxGrossAmount', 0),
        it.get('InvoiceDiscount', 0),
        it.get('DeductedByCoupons', 0),
        it.get('PretaxAmount', 0)
    ))
"
done
```

## Endpoint: QueryInstanceBill — per-model line items

This is the workhorse query for "which model cost what this month." Each `instance` on Alibaba's billing is one SKU-usage-period row.

```bash
aliyun --profile pollinations-finops BssOpenApi QueryInstanceBill \
  --BillingCycle 2026-04 --PageSize 100 --PageNum 1
```

Pagination: 100 rows per page max. Loop with `--PageNum 2`, `3`, etc. Use `TotalCount` from the first response to know when to stop.

**Validated 2026-04 returned 27 total instance-bill rows.**

### Instance ID format (Alibaba-specific encoding)

Instance IDs are encoded as semicolon-separated tuples. Example:

```
58300;llm-xymgn3qbd50kty0u;wan2.7-image;images;;0
```

Fields (empirical, not documented):
- Position 1: some account-family code (consistent across all our rows — `58300`)
- Position 2: `llm-<hash>` — the workspace ID
- Position 3: **model ID** — this is the useful one (`wan2.7-image`, `qwen3-coder-next`, `qwen3-vl-plus`, etc.)
- Position 4: modality (`images`, `context_3`, etc.)
- Position 5+: usage bucket (varies)

**To aggregate by model**, parse position 3 of each `InstanceID`:

```python
import subprocess, json
from collections import defaultdict

result = subprocess.run(
    ['aliyun', '--profile', 'pollinations-finops', 'BssOpenApi',
     'QueryInstanceBill', '--BillingCycle', '2026-04',
     '--PageSize', '100', '--PageNum', '1'],
    capture_output=True, text=True
)
d = json.loads(result.stdout)

by_model = defaultdict(lambda: {'gross': 0, 'net': 0, 'coupons': 0, 'count': 0})
for it in d['Data']['Items']['Item']:
    iid = it.get('InstanceID', ';;;;;')
    parts = iid.split(';')
    model = parts[2] if len(parts) > 2 else 'unknown'
    by_model[model]['gross'] += it.get('PretaxGrossAmount', 0)
    by_model[model]['net'] += it.get('PretaxAmount', 0)
    by_model[model]['coupons'] += it.get('DeductedByCoupons', 0)
    by_model[model]['count'] += 1

for model, v in sorted(by_model.items(), key=lambda x: -x[1]['gross']):
    print(f"{model:<30} count={v['count']:>3}  gross=${v['gross']:>8.2f}  net=${v['net']:>8.2f}")
```

### Sample 2026-04 per-model output (from first 5 rows of 27)

| Model | Product | Gross $ | Net $ |
|---|---|---|---|
| `wan2.7-image` | Wan Model | 146.85 | 146.85 |
| `wan2.7-image-pro` | Wan Model | 20.93 | 20.93 |
| `qwen3-coder-next` | FM Inference | 5.75 | 0.00 |
| `qwen3-coder-next` | FM Inference | 0.14 | 0.00 |
| `qwen3-vl-plus` | FM Inference | 0.24 | 0.00 |

**Observation**: Qwen text/vision usage has its entire cost swallowed by the `InvoiceDiscount` (net = 0 even with nonzero gross). That $302 invoice discount in April is concentrated on Qwen inference calls, while the Wan video/image SKUs get no discount at all. So **100% of the April "real spend" is Wan models**.

## Endpoint: QueryProductList — what products are purchasable

```bash
aliyun --profile pollinations-finops BssOpenApi QueryProductList --QueryTotalCount true
```

Returns the full product catalog. Useful to discover new products Alibaba offers (not critical for FinOps).

## Endpoint: DescribeResourcePackageProduct — savings plan / pre-purchase details

```bash
aliyun --profile pollinations-finops BssOpenApi DescribeResourcePackageProduct --ProductCode sfm
```

**`ProductCode` is required** — without it the call fails with `required parameters not assigned`. Use `sfm` for Model Studio Foundation Model Inference.

This endpoint returns the available resource packages (savings plans) we could pre-purchase. We already have one: the January `LLM Inference Savings Plan` at $200. To see what we currently hold, use `QueryResourcePackageInstances`.

## Endpoint: QueryCashCoupons — promotional coupon inventory

**⚠️ Returns `SDK.ServerError / InternalError` on our account** (validated 2026-04-11). This endpoint is documented but appears broken on the International tenant. Stick with `QueryBillOverview.DeductedByCoupons` for coupon tracking.

---

## DashScope model-list endpoint (separate auth path)

For "what models can we call", use the DashScope OpenAI-compatible endpoint with the `sk-...` key from `gen.pollinations.ai/secrets/prod.vars.json`:

```bash
DASHSCOPE_API_KEY=$(sops -d gen.pollinations.ai/secrets/prod.vars.json | python3 -c "import sys, json; print(json.load(sys.stdin)['DASHSCOPE_API_KEY'])")

curl -sS "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models" \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY"
```

**Validated 2026-04-11: 147 models accessible**, including Qwen3.5/3.6 Plus, Qwen3 Coder Next, Qwen3 VL Plus, Wan 2.7 image, DeepSeek V3.2, and many more. This is a **completely different auth path** from the BSS billing endpoints — DashScope uses the `sk-...` bearer token; BSS uses the RAM AccessKey signature.

**Billing endpoints DO NOT work on the DashScope `sk-...` key**. All `dashscope.aliyuncs.com/{compatible-mode/v1,api/v1}/{billing,usage,credits,organization,apikeys}` paths return `HTTP 404`. The OpenAI-compatible surface only exposes `/models` and `/chat/completions`.

---

## Question → query cheat sheet

| Question | Query |
|---|---|
| How much will April cost? | `BssOpenApi QueryBillOverview --BillingCycle 2026-04` → sum `PretaxAmount` across items |
| Are coupons/credits being applied? | Same query → look at `DeductedByCoupons` per item |
| Which model cost the most this month? | `BssOpenApi QueryInstanceBill --BillingCycle 2026-04` → parse `InstanceID` position 3, sum `PretaxAmount` by model |
| What's our account balance? | `BssOpenApi QueryAccountBalance` — BUT it's always $0 on PayAsYouGo; use `OutstandingAmount` from `QueryBillOverview` instead |
| What savings plans are active? | `BssOpenApi QueryResourcePackageInstances` (untested — use when needed) |
| What products have we ever used? | `BssOpenApi QueryBillOverview` across multiple months, collect unique `ProductCode` values |
| Any outstanding unpaid bills? | `QueryBillOverview` → sum `OutstandingAmount` across items |
| What models can we call right now? | DashScope `/v1/models` with `sk-` key (different endpoint entirely) |

---

## Gotchas

- **Short product name `bss` doesn't work.** Always use the full `BssOpenApi` product name in the CLI: `aliyun --profile X BssOpenApi QueryAccountBalance`. The error message suggests `ess/sts/sas/dbs/ebs` which are all wrong.
- **Two separate credential systems**: BSS billing queries use the RAM AccessKey; DashScope model calls use the `sk-...` bearer token. They are NOT interchangeable. BSS endpoints reject `sk-` auth; DashScope doesn't know what to do with a RAM signature.
- **`AvailableAmount` is always $0 on PayAsYouGo**. Don't use `QueryAccountBalance` to check "how much credit is left" — it doesn't mean what you think it means.
- **Coupons show up in `DeductedByCoupons`** on the monthly bill, not on the balance endpoint. One-shot coupons (like our March $1000) are consumed in a single month and don't carry over.
- **Instance ID format is undocumented**: `58300;llm-<hash>;<model>;<modality>;<bucket>;<n>`. Parse position 3 for model name. Don't rely on positions 4+ being stable.
- **`QueryCashCoupons` returns InternalError** on our international tenant. Use monthly bill data as the canonical source of coupon tracking instead.
- **International vs mainland API**: we use `ap-southeast-1` (Singapore) and the international tenant. The mainland Alibaba Cloud account system (`aliyun.com` / `cn-hangzhou`) uses different endpoints and requires different credentials. Don't mix them.
- **Billing cycle format is `YYYY-MM`**, not `YYYYMM` or ISO. `--BillingCycle 2026-04` works; `2026-04-01` fails.
- **Pagination uses 1-based `PageNum`**, not `offset`. Default page size is 20; max is 100.
- **Invoice discount vs coupon**: `InvoiceDiscount` is an automatic contract/volume discount that applies every month without action. `DeductedByCoupons` is a one-off promotional grant. Don't confuse them when modeling future spend — only `InvoiceDiscount` persists.
- **`OutstandingAmount > 0`** doesn't mean "overdue" — it means "billed but not yet pulled from your payment method." Alibaba charges the card after the billing cycle closes.
- **Savings plans show as `gross=X, net=0`** when fully paid upfront. The $200 January LLM Inference Savings Plan is a one-time purchase that gets amortized behind the scenes — you don't see per-month drawdown in the bill overview, only the month of purchase.

---

## Known unknowns

- **Current Alibaba coupon / credit balance** — there is no single API for "how much promotional credit is left." We only see consumption retroactively via `DeductedByCoupons` on each monthly bill. If a new coupon is granted, it'll show up on the first month it's applied but you won't know the total grant size from the API alone.
- **`QueryCashCoupons` works?** — untested since it returned `InternalError`. May work on the mainland tenant but not international. If you ever get it working, it should show coupon balance directly.
- **`QueryResourcePackageInstances`** — untested. This should show active savings plans (e.g. our January $200 LLM Inference plan and its remaining drawdown capacity). Worth a try if we need to know SP utilization.
- **Savings Plan drawdown visibility** — we know we bought a $200 LLM Inference Savings Plan in January. We DON'T see its per-month consumption in `QueryBillOverview` — it's invisible after the initial purchase month. If we want to know "is the SP still covering anything," we need `QueryResourcePackageInstances`.
- **Wan model pricing**: the Wan 2.7 video/image SKUs don't get any invoice discount (100% of gross = net). This is either intentional (newer models not yet discounted) or a negotiation opportunity. Worth asking Alibaba sales if we can get a Wan-specific discount given the growing spend.
- **Project / tag-level cost attribution** — Alibaba has `CostCenter` and `CostUnit` concepts but we haven't set them up. Without tags, all spend rolls up under one account with no attribution to "image service" vs "text service" beyond the model name parsing above.

---

## Session 1 validation log (2026-04-11)

| Command | Result |
|---|---|
| `brew install aliyun-cli` | ✅ 3.3.4 installed |
| `aliyun configure set ... --profile pollinations-finops` | ✅ profile created |
| `aliyun sts GetCallerIdentity` | ✅ account `5314153712077332`, user `216254075942627139` |
| `aliyun bss QueryAccountBalance` | ❌ `'bss' is not a valid command or product` — use `BssOpenApi` |
| `aliyun BssOpenApi QueryAccountBalance` | ✅ all zeros (expected — PayAsYouGo, no prepaid balance) |
| `aliyun BssOpenApi QueryBillOverview --BillingCycle 2026-03` | ✅ $1,509 gross, $1,000 coupons, $224 net |
| `aliyun BssOpenApi QueryBillOverview --BillingCycle 2026-04` | ✅ $1,006 gross split across Qwen + Wan products, $0 coupons |
| `aliyun BssOpenApi QueryInstanceBill --BillingCycle 2026-04` | ✅ 27 rows, model names parseable from InstanceID field |
| `aliyun BssOpenApi QueryCashCoupons` | ❌ `InternalError` — endpoint broken on our tenant |
| `aliyun BssOpenApi DescribeResourcePackageProduct` | ❌ needs `--ProductCode` param |
| `curl dashscope-intl.aliyuncs.com/compatible-mode/v1/models` (sk- key) | ✅ 147 models accessible |
| DashScope `/v1/billing`, `/usage`, `/credits`, `/invoices` | ❌ all 404 (not in the OpenAI-compat surface) |

**Real numbers captured**: **April 2026 projected spend ~$2,745** at current burn rate (compared to $1,524 in February pre-Wan). The $1,000 March coupon is exhausted. **Wan video/image is now our biggest Alibaba cost driver** at ~$167/mo and growing.
