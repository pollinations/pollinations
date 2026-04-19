# Azure billing via `az` CLI

Validated: **2026-04-11**. Re-validate if a command returns unexpected results — Azure rotates API versions frequently.

Captures the exact CLI and REST calls needed to answer Azure questions like:

- How much did we spend on Azure yesterday / last month / in a date range?
- Which AI models are running on which account and region?
- Which meters are credit-eligible (drawing down sponsorship credits) vs billed?
- How much is left of our sponsorship credits?
- What invoices exist, what was the total, how much was covered by credits?
- How do I deploy an Anthropic / non-OpenAI model on Azure AI Foundry?

Everything here was validated against the Pollinations billing account on 2026-04-11. Don't re-derive the API shapes — they are here.

---

# Requirements

- `az` CLI logged in: `az login` (current default tenant shown in `az account show`)
- Python3 for JSON wrangling
- `curl` for the Retail Prices API (no auth)

## Known identifiers (our account)

```
Tenant (thomasmyceli):     f542dd61-ecf3-4524-8905-30f2e2a2e967
Subscription (prod):       7725a3f5-6483-4079-ba51-a317aa4fc09e
  name:                    Azure subscription 1
  quotaId:                 Sponsored_2016-01-01   ← marks it as sponsored
Billing account (MCA):     d6c5b3e7-63ac-515a-8674-de5afbaec90d:d9f4ee4f-6add-42d1-ad32-b0cf92f726f4_2019-05-31
  agreementType:           MicrosoftCustomerAgreement
  accountType:             Individual
Billing profile:           7E4U-QBXO-BG7-PGB
  currency:                EUR
  invoice day:             9
Invoice section:           BWRU-WTTT-PJA-PGB
Cognitive Services accts:
  myceli-prod-eastus       (AIServices, eastus)         rg-myceli-prod
  myceli-prod-swedencentral (AIServices, swedencentral)  rg-myceli-prod
```

Swap the `--subscription` / subscription ID if you're working on a different one. Use `az account list -o table` to find others.

---

# Querying spend and usage

There are THREE endpoints you'll use, each with different latency and granularity:

| Endpoint | Latency | Granularity | Shows credit application? |
|---|---|---|---|
| `usageDetails` | ~1h | Per meter, per day | Eligibility flag only |
| `transactions` | ~24-48h | Per line item | Credit applied fields |
| `invoices` | monthly (on invoice day) | Rolled-up | Yes, incl. `creditAmount`, `freeAzureCreditApplied` |

## 1. Near-realtime usage — `usageDetails`

**Use this for "yesterday" or "today so far" questions.** Data lands within ~1 hour.

```bash
SUB=7725a3f5-6483-4079-ba51-a317aa4fc09e

# Yesterday's usage, up to 1000 records (paginate with nextLink if more)
az rest --method get \
  --url "https://management.azure.com/subscriptions/${SUB}/providers/Microsoft.Consumption/usageDetails?api-version=2024-08-01&\$filter=properties/usageStart%20ge%20'2026-04-10T00:00:00Z'%20and%20properties/usageEnd%20le%20'2026-04-10T23:59:59Z'&\$top=1000" \
  > /tmp/usage.json
```

**Important fields per record** (inside `properties`):

```
date                      # "2026-04-10T..." — usage date
costInBillingCurrency     # € (or whatever billingCurrencyCode is)
costInUSD                 # $ always
product                   # "Azure Fireworks Models - FW DeepSeek V3.2 Inp DZ - US East"
meterCategory             # "Foundry Models", "Azure OpenAI", "SaaS", ...
meterSubCategory          # "Mistral Small 3.1 (25.03)"
publisherName             # "Microsoft" (first-party) or ISV name (3rd-party)
publisherType             # "Microsoft" vs "Marketplace"
isAzureCreditEligible     # ← KEY: true = draws down sponsorship credits
chargeType                # "Usage" | "Purchase" | ...
resourceGroup             # rg-myceli-prod
instanceName              # full resource path
quantity, unitPrice       # raw metering
```

### Aggregate yesterday's spend grouped by publisher and eligibility

```bash
python3 << 'EOF'
import json
from collections import defaultdict
d = json.load(open('/tmp/usage.json'))
v = d.get('value', [])
total_eur = total_usd = elig_eur = inelig_eur = 0
by_product = defaultdict(lambda: {"eur": 0, "usd": 0, "count": 0, "elig": None})
for t in v:
    p = t.get('properties', {})
    eur = p.get('costInBillingCurrency', 0) or 0
    usd = p.get('costInUSD', 0) or 0
    elig = p.get('isAzureCreditEligible', False)
    total_eur += eur
    total_usd += usd
    if elig: elig_eur += eur
    else: inelig_eur += eur
    k = (p.get('publisherName') or 'Microsoft', p.get('product', '')[:50])
    by_product[k]["eur"] += eur
    by_product[k]["usd"] += usd
    by_product[k]["count"] += 1
    by_product[k]["elig"] = elig

print(f"TOTAL: €{total_eur:.2f} / ${total_usd:.2f}")
print(f"  credit-eligible:     €{elig_eur:.2f}")
print(f"  NOT credit-eligible: €{inelig_eur:.2f}")
print(f"\n{'publisher':<20} {'product':<50} {'€':>10} {'elig':>5}")
for (pub, prod), vals in sorted(by_product.items(), key=lambda x: -x[1]["eur"])[:30]:
    print(f"{pub[:20]:<20} {prod:<50} {vals['eur']:>10.2f} {str(vals['elig']):>5}")
EOF
```

### Date-range gotchas

- **Dates must include `T00:00:00Z` / `T23:59:59Z`** — the OData filter rejects bare dates.
- **Use `properties/usageStart` and `properties/usageEnd`** — these are the correct field names; `properties/date` works for output but not filtering.
- **API version matters** — `2024-08-01` has all fields above. Older versions are missing `isAzureCreditEligible`.
- **The result may include records outside the requested window** — the API returns all records where the billing period overlaps. Post-filter by the `date` field if you need strict day precision.

## 2. Billed transactions — `transactions`

**Use for "last month's spend broken down" questions.** Lags usageDetails by ~24-48h.

```bash
BA="d6c5b3e7-63ac-515a-8674-de5afbaec90d:d9f4ee4f-6add-42d1-ad32-b0cf92f726f4_2019-05-31"
BP="7E4U-QBXO-BG7-PGB"

# Last 30 days, MUST pass periodStartDate/periodEndDate (limit 365d)
az rest --method get \
  --url "https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${BA}/billingProfiles/${BP}/transactions?api-version=2024-04-01&type=Billed&periodStartDate=2026-03-11&periodEndDate=2026-04-11" \
  > /tmp/billed.json
```

**CRITICAL gotchas**:
- Pass `type=Billed` or `type=Unbilled` as query param (NOT `transactionType=...`). Wrong param name returns `InvalidTransactionType` error with the misleading message "Supported types: Billed, Unbilled" — the message is right, the param name is what's wrong.
- Pass `periodStartDate` + `periodEndDate`. Without them you get `InvalidStartDate: Only the latest 365 days...`
- The `$filter` param with ODATA date syntax does NOT work here — use the period params.

**Useful fields per transaction** (`properties`):

```
transactionAmount.value          # billed amount in billingCurrency
azureCreditApplied.value         # how much credit was DEDUCTED from monthly free credit
consumptionCommitmentDecremented.value  # how much was drawn from MACC commitment
discount                         # any additional discount
productDescription               # "Azure OpenAI Media - gpt img 1.5 out txt gl - US East 2"
productFamily                    # "AI + Machine Learning"
productType                      # "Azure OpenAI Media", "Azure Kimi", ...
isThirdParty                     # false = first-party Microsoft
pricingCurrency                  # usually USD
billingCurrency                  # EUR for us
invoice                          # e.g. "G139461646"
servicePeriodStartDate / End
units, unitOfMeasure, effectivePrice
```

### Interpreting credit fields

- **`azureCreditApplied` = 0** AND **`transactionAmount` = full price** → credits not applied at this line item
- **Sponsorship credits do NOT show up here** on MCA-Individual accounts. They are applied via a separate mechanism (at invoice close, or on the billing profile balance). The `isAzureCreditEligible` flag in `usageDetails` is the better signal of "will this be covered".
- **`consumptionCommitmentDecremented`** shows MACC drawdown for Enterprise Agreements — irrelevant for our Individual MCA.

## 3. Invoices — monthly rollup

```bash
BA="d6c5b3e7-63ac-515a-8674-de5afbaec90d:d9f4ee4f-6add-42d1-ad32-b0cf92f726f4_2019-05-31"
BP="7E4U-QBXO-BG7-PGB"

az rest --method get \
  --url "https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${BA}/billingProfiles/${BP}/invoices?api-version=2024-04-01&periodStartDate=2026-01-01&periodEndDate=2026-04-11"
```

**Key invoice fields**:

```
billedAmount              # full invoice pre-credit
creditAmount              # credits applied at invoice level
freeAzureCreditApplied    # free credit deducted
azurePrepaymentApplied    # prepayment deducted
amountDue                 # what you actually paid
invoicePeriodStartDate / End
```

**Example** (Jan 2026 invoice G139461646):
```
billedAmount:            €10,994.45
creditAmount:            €0.00
freeAzureCreditApplied:  €0.00
amountDue:               €0.00  (paid)
```
Zero credit application in January despite the `Sponsored_*` quotaId — meaning the sponsorship credit is either not yet attached, attached to a different subscription/billing profile, or discounted at a layer invisible to this API.

## 4. Balance / credit pool queries — PERMISSION-GATED

These endpoints return `AuthorizationFailed` unless the caller has `Billing Reader` role at the billing account scope:

```bash
# Both of these return 403 for our current user:
az rest --method get --url "https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${BA}/billingProfiles/${BP}/balanceSummary?api-version=2024-04-01"

az rest --method get --url "https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${BA}/billingProfiles/${BP}/availableBalance?api-version=2024-04-01"
# → 400 Bad Request (endpoint exists but doesn't apply to MCA-Individual)
```

**To unlock**: user needs `Billing Reader` role assignment, granted by the Billing Account Owner:

```bash
az role assignment create \
  --assignee <user-object-id-or-email> \
  --role "Billing Reader" \
  --scope "/providers/Microsoft.Billing/billingAccounts/${BA}"
```

Until this role is granted, **balance must be checked in the Azure Portal** → Cost Management + Billing → Credits. The CLI cannot read it.

## 5. Public pricing — Retail Prices API (no auth)

Use this to check published pricing or to verify whether a SKU is even in Microsoft's catalog.

```bash
# All Claude/Anthropic meters in the AI+ML family
curl -sS "https://prices.azure.com/api/retail/prices?\$filter=serviceFamily%20eq%20'AI%20%2B%20Machine%20Learning'" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for i in d.get('Items', []):
    pn = i.get('productName', '')
    if any(k in pn for k in ['Claude', 'Anthropic']):
        print(i.get('productName'), '|', i.get('skuName'), '|', i.get('retailPrice'), i.get('currencyCode'))
"
```

**Learned**: as of 2026-04-11, **no Anthropic / Claude meters exist in the public Retail Prices catalog**. Every other Foundry model (Kimi, Mistral, Grok, DeepSeek, Fireworks, BFL Flux, Cohere, Llama, Phi, Qwen, MAI) has a dedicated `Azure <Name> Models` product entry. Anthropic doesn't. This suggests Claude is still in preview / not fully merchandized.

---

# Foundry models — first-party billing

Per 2026-04-10 observed `usageDetails`, every ISV model deployed via Azure AI Foundry (`myceli-prod-swedencentral`) is billed as first-party:

```
meterCategory:         "Foundry Models"
publisherName:         "Microsoft"
publisherType:         "Microsoft"
isAzureCreditEligible: true
```

This is confirmed for: **Kimi K2.5, Mistral Large 3, Grok 4.1/4.2, DeepSeek V3.2, Fireworks FW-DeepSeek, BFL Flux-Kontext**. They all roll up into the "Azure Foundry Models" meter family in Microsoft's billing, not as Marketplace SaaS offers. **Credit-eligible.**

Anthropic/Claude status is **UNCONFIRMED** (cannot deploy — see next section).

---

# Deploying models on AI Foundry

## List available models in a region

```bash
az cognitiveservices account list-models \
  --name myceli-prod-swedencentral \
  --resource-group rg-myceli-prod \
  --query "[?format=='Anthropic'].{name:name, version:version, sku:skus[0].name, capacity:skus[0].capacity}" -o json
```

Filter by `format` to narrow: `OpenAI`, `Anthropic`, `MoonshotAI`, `Mistral AI`, `xAI`, `DeepSeek`, `Black Forest Labs`, `Meta`, `Microsoft`, `Fireworks`, `Cohere`.

Default capacity is 10, max is 1,000,000 — but minimums vary by model and the rate-limit meta exposes `count/renewalPeriod` at SKU level.

## Standard (OpenAI / Microsoft first-party) deployment

```bash
az cognitiveservices account deployment create \
  --name myceli-prod-swedencentral \
  --resource-group rg-myceli-prod \
  --deployment-name <deployment-name> \
  --model-name gpt-5-nano \
  --model-version 2025-09-01 \
  --model-format OpenAI \
  --sku-name GlobalStandard \
  --sku-capacity 10
```

## Anthropic / ISV-gated deployment (CLI won't work, needs REST)

Anthropic models require a `modelProviderData` attestation that the CLI does not expose. Use `az rest` with **api-version `2026-01-15-preview`** (not in any published ARM spec):

```bash
cat > /tmp/claude_deploy.json << 'EOF'
{
  "sku": { "name": "GlobalStandard", "capacity": 10 },
  "properties": {
    "model": { "format": "Anthropic", "name": "claude-haiku-4-5", "version": "20251001" },
    "modelProviderData": {
      "industry": "Technology",
      "organizationName": "Pollinations",
      "countryCode": "EE"
    }
  }
}
EOF

az rest --method put \
  --url "https://management.azure.com/subscriptions/${SUB}/resourceGroups/rg-myceli-prod/providers/Microsoft.CognitiveServices/accounts/myceli-prod-swedencentral/deployments/<name>?api-version=2026-01-15-preview" \
  --body @/tmp/claude_deploy.json
```

**Gotchas**:
- Without `modelProviderData`: `InvalidModelProviderData: ModelProviderData is required for Anthropic model deployments`
- With `modelProviderData` nested inside `properties.model`: `InvalidRequestContent` — it must be at `properties.modelProviderData` (sibling of `model`)
- Stable API versions (≤ `2025-06-01`) reject the field entirely — you NEED the `2026-01-15-preview`
- Deployment creation returns `201 Accepted` immediately but takes 5-10 min to transition from `provisioningState: Creating` → `Succeeded`
- Control-plane state vs. data-plane: `properties.deploymentState: Running` + `currentCapacity: N` can appear while `provisioningState` is still `Creating` — the model is NOT yet reachable until outer state flips to `Succeeded`. Probing the endpoint will return `DeploymentError: The API deployment for the resource is not ready`.

## Known blocker: Anthropic on our billing account (2026-04-11)

**All Anthropic deployments fail** on billing account `d6c5b3e7-...` with:

```json
{
  "status": "Failed",
  "error": {
    "code": "ResourceOperationFailure",
    "details": [{ "code": "AnthropicOrganizationCreationFailed", "message": "Internal Server Error." }]
  }
}
```

Retrieved via:
```bash
az monitor activity-log list \
  --correlation-id <correlation-id-from-activity-log> \
  --max-events 50 \
  --query "[].{op:operationName.localizedValue, status:status.value, msg:properties.statusMessage, time:eventTimestamp}" -o json
```

Confirmed NOT our mistake: `Kimi K2.5` deploys successfully in seconds on the same resource with the same API version. Issue is Microsoft's Anthropic ISV-org provisioning path for our billing account. **Needs a Microsoft support ticket** to unblock. Correlation ID from first failed attempt: `cc36b8aa-9f39-410e-8531-8c5cdcbb32bb`.

## List existing deployments

```bash
az cognitiveservices account deployment list \
  --name myceli-prod-swedencentral \
  --resource-group rg-myceli-prod \
  --query "[].{name:name, model:properties.model.name, format:properties.model.format, state:properties.provisioningState, capacity:sku.capacity}" -o table
```

## Inspect full deployment (including `modelProviderData` and rate limits)

```bash
az rest --method get \
  --url "https://management.azure.com/subscriptions/${SUB}/resourceGroups/rg-myceli-prod/providers/Microsoft.CognitiveServices/accounts/myceli-prod-swedencentral/deployments/<name>?api-version=2026-01-15-preview"
```

## Delete a deployment

```bash
az rest --method delete \
  --url "https://management.azure.com/subscriptions/${SUB}/resourceGroups/rg-myceli-prod/providers/Microsoft.CognitiveServices/accounts/myceli-prod-swedencentral/deployments/<name>?api-version=2026-01-15-preview"
```

(The CLI also supports `az cognitiveservices account deployment delete` but REST is consistent with the creation path above.)

---

# Region naming gotcha

Many `az` commands use lowercase ARM names while others accept display names. **For Sweden Central**:

| Tool / context | Correct form |
|---|---|
| Resource `location` field | `swedencentral` |
| `az account list-locations` | `swedencentral` (name) / `Sweden Central` (display) |
| `az cognitiveservices usage -l ...` | **BROKEN** — rejects every variant. Use subscription-scoped quota listing instead. |

If a Sweden Central call fails with `misspelled or not recognized`, it's the CLI's fault, not yours. Fall back to `az rest` against the ARM endpoint directly.

---

# Common question → query cheat sheet

| Question | Endpoint | Example |
|---|---|---|
| What did we spend yesterday? | `usageDetails` | filter `usageStart ge '<Y-M-D>T00:00:00Z' and usageEnd le '<Y-M-D>T23:59:59Z'` |
| What did we spend this month by service? | `usageDetails` | group by `meterCategory` / `product` |
| Which meters are credit-eligible? | `usageDetails` | filter or group by `isAzureCreditEligible` |
| What was January's invoice total? | `invoices` | `periodStartDate=2026-01-01&periodEndDate=2026-01-31` |
| How much credit was applied in Jan? | `invoices` → `creditAmount` + `freeAzureCreditApplied` |
| What models are deployed on Foundry? | `az cognitiveservices account deployment list` on each account |
| What models COULD we deploy? | `az cognitiveservices account list-models` |
| How much credit do we have left? | **CANNOT do via CLI without `Billing Reader` role** — use Portal → Cost Management → Credits |
| Is SKU X in the public pricing catalog? | Retail Prices API (`contains(productName, 'X')`) |
| Why did my deployment fail? | `az monitor activity-log list --correlation-id <id> ...` — extract code + message |

---

# Known unknowns (open follow-ups)

- **€250k sponsorship credit location**: not visible via any API call on billing account `d6c5b3e7-...`. Jan 2026 invoice showed `creditAmount: 0`, suggesting credits live on a different billing account/tenant. Verify in Azure Portal under Cost Management → Credits, then update the identifiers at the top of this skill if they differ.
- **Anthropic/Claude credit eligibility**: unconfirmed. Retail Prices API has no Anthropic entries, and we cannot deploy to test the `isAzureCreditEligible` flag until the `AnthropicOrganizationCreationFailed` blocker is resolved. Open a Microsoft support ticket to unblock provisioning AND to get written confirmation of credit eligibility.
- **`Billing Reader` role**: not granted to `elliot@thomasmyceli.onmicrosoft.com` → `balanceSummary` returns 403. Granting this unlocks credit balance reads.
