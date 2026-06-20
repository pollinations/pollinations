---
name: spending-analysis
description: Analyze Pollinations revenue, pack purchases, and balance-bucket spending patterns. Query Polar for payment history and Tinybird for usage data.
---

# Requirements

Before using this skill, ensure you have:
- **curl**: For API requests
- **jq**: `brew install jq` (for parsing JSON)
- **sops**: `brew install sops` (for decrypting secrets)

Must run from the `pollinations` repo root with access to `enter.pollinations.ai/`.

---

# Data Sources

## Polar API

- **Orders**: Payment history for Pollen pack purchases
- **Products**: Pollen pack products
- **Customers**: User payment info linked by `external_id`

## Tinybird

- **generation_event**: Usage data with `user_id`, `total_price`, and `meter_source`
- Use `meter_source` to split spend by active balance bucket:
  - `v1:meter:tier` / `local:tier`
  - `v1:meter:pack` / `local:pack`

> **Workspace**: Two workspaces exist now: `pollinations_enter` (prod) and `pollinations_enter_staging` (staging + dev + local). Revenue queries should use prod read tokens; staging contains no real revenue.

---

# Quick Commands

## Get Polar Access Token

```bash
# From sops-encrypted secrets
export POLAR_ACCESS_TOKEN=$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.POLAR_ACCESS_TOKEN')

# Or from .testingtokens (if available)
export POLAR_ACCESS_TOKEN=$(grep POLAR_ACCESS_TOKEN enter.pollinations.ai/.testingtokens | cut -d= -f2)
```

## Get Tinybird Token

```bash
export TINYBIRD_TOKEN=$(sops -d apps/operation/kpi/secrets/env.json | jq -r '.TINYBIRD_TOKEN')
```

---

# Polar API Queries

## List Products

```bash
curl -sL "https://api.polar.sh/v1/products" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" | jq '[.items[] | {name, id, recurring: .is_recurring}]'
```

## Get Pack Purchases

```bash
# 5 pollen pack product ID
PRODUCT_ID="bcdde7f7-129e-4ec1-abc3-d4e0c852fa68"

curl -sL "https://api.polar.sh/v1/orders?limit=100&product_id=$PRODUCT_ID" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" | \
  jq '[.items[] | {date: .created_at[0:10], amount: (.total_amount / 100), customer: .customer.email}]'
```

## Pollen Pack Product IDs

| Pack | Product ID |
|------|------------|
| 5 pollen + 5 FREE | `bcdde7f7-129e-4ec1-abc3-d4e0c852fa68` |
| 10 pollen + 10 FREE | `cebeb680-4ac3-4f73-9ce7-6bc06a5f21e1` |
| 20 pollen + 20 FREE | `8164c20f-8429-437e-b1a2-616ae89f114e` |
| 50 pollen + 50 FREE | `2cb5ca34-d505-450d-a1d4-94e3bb0c1f68` |
| 10 pollen (pack) | `ca4cc8bc-694d-4710-8451-1dcb4979fbc7` |
| 20 pollen (pack) | `679a9fd3-be30-4552-8b2e-f825103c42b7` |
| 50 pollen (pack) | `bf48ded2-19ca-4d28-bca9-a91fff2dd0a0` |

## Weekly Revenue from All Packs

```bash
.claude/skills/spending-analysis/scripts/weekly-pack-revenue.sh
```

---

# Tinybird Queries

## Weekly Spend by Balance Bucket

```bash
curl -sL "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT toStartOfWeek(start_time) as week, meter_source, sum(total_price) as total_spend, count() as requests FROM generation_event WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' GROUP BY week, meter_source ORDER BY week DESC FORMAT JSON" | jq '.data'
```

## Top Paying Users by Pack Spend

```bash
curl -sL "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT user_id, user_github_username, sum(total_price) as pack_spend, count() as requests FROM generation_event WHERE start_time >= now() - INTERVAL 30 DAY AND environment = 'production' AND meter_source IN ('v1:meter:pack', 'local:pack') GROUP BY user_id, user_github_username ORDER BY pack_spend DESC LIMIT 50 FORMAT JSON" | jq '.data'
```

---

# Analysis Scripts

## Weekly Pack Revenue

```bash
.claude/skills/spending-analysis/scripts/weekly-pack-revenue.sh
```

Shows weekly breakdown of actual pack purchases.

---

# Notes

- **Pack purchases** in Polar are actual paid revenue.
- **Usage spend** in Tinybird is generation consumption and may be paid from either active balance bucket.
- Cross-reference by `external_id` (Polar) = `user_id` (Tinybird).
- Polar API returns 307 redirects: use `curl -sL` to follow.
