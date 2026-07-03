# Scaleway billing via API/CLI

Validated: 2026-07-03 (live against our account with a BillingReadOnly IAM key).

## Requirements
- REST: `https://api.scaleway.com/billing/v2beta1/...` with `X-Auth-Token: $SCW_SECRET_KEY`
- Or CLI: `scw` (not installed locally as of 2026-07-02)
- Auth: IAM API key whose principal has the **`BillingReadOnly`** permission set (covers consumption, invoices, discounts; `BillingManager` only for edits)
- Organization/project id in spend-audit local secrets.

## Known identifiers (our account)
- Startup grant/discount history exists, but the live API currently shows all discounts fully used/expired.

## Querying grant and consumption

### 1. Grant granted/left — discounts endpoint (live)
```bash
curl -H "X-Auth-Token: $SCW_SECRET_KEY" \
  "https://api.scaleway.com/billing/v2beta1/discounts?organization_id=$ORG_ID"
# or: scw billing discount list organization-id=$ORG_ID -o json
```
Fields (verified in scaleway-sdk-go `billing_sdk.go` Discount struct): `value` (initial grant = granted), `value_used`, `value_remaining` (= left), `mode` (`discount_mode_rate` %-off | `discount_mode_value` | `discount_mode_splittable` fixed sum across bills), `start_date`, `stop_date`, `coupon`, `filters`.

Live 2026-07-03: endpoint returns 3 discounts totaling `$3,659` granted / `$3,659` used / `$0` remaining; latest stop date `2026-01-31`.

### 2. Month-to-date consumption (endpoint known; not currently used by spend-audit)
```bash
curl -H "X-Auth-Token: $SCW_SECRET_KEY" \
  "https://api.scaleway.com/billing/v2beta1/consumptions?organization_id=$ORG_ID"
# omit billing_period for current month; or: scw billing consumption list -o json
```
Per-SKU rows (`value` Money, `product_name`, `category_name`, `project_id`, `billed_quantity`, `unit`) + top-level `total_discount_untaxed_value`, `updated_at`.

### 3. Invoices
`scw billing invoice list/get/download` or `GET /billing/v2beta1/invoices`.

## Credit / discount handling
- A "$3.5k/mo cap" grant likely shows as a *recurring* discount (new object per month) or `rate` mode where `value` is a percentage — inspect `mode` before wiring granted/left into the dashboard.
- Amounts are Money objects with `currency_code`; Scaleway bills EUR while our sheet states USD — normalize.

## Gotchas
- `total_discount_untaxed_value` only present when no category/project filter is applied.
- Consumption is not real-time — trust `updated_at`.

## Question → query cheat sheet
| Question | Endpoint |
|---|---|
| Grant total / remaining | `GET /billing/v2beta1/discounts` → `value` / `value_remaining` |
| MTD spend | `GET /billing/v2beta1/consumptions` |
| Invoices | `GET /billing/v2beta1/invoices` |

## Known unknowns
- Whether a future/new Scaleway startup discount will appear as a new discount row or a recurring monthly object.

Docs: https://www.scaleway.com/en/developers/api/billing/ · https://cli.scaleway.com/billing/ · https://www.scaleway.com/en/docs/iam/reference-content/permission-sets/
