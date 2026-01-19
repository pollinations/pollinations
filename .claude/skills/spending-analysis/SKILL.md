---
name: spending-analysis
description: Analyze Pollinations revenue, pack purchases, and tier spending patterns. Query Polar for payment history and Tinybird for usage data.
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
- **Orders**: Payment history for pack purchases
- **Products**: Tier subscriptions and pollen packs
- **Customers**: User payment info linked by `external_id`

## Tinybird
- **generation_event**: Usage data with `user_tier`, `total_price`, `user_id`
- Tracks all API requests with pricing and tier info

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
export TINYBIRD_TOKEN=$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.TINYBIRD_ACCESS_TOKEN')
```

---

# Polar API Queries

## List Products (Tiers & Packs)

```bash
curl -sL "https://api.polar.sh/v1/products" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" | jq '[.items[] | {name, id, recurring: .is_recurring}]'
```

## Get Pack Purchases (Last 100)

```bash
# 5 pollen pack product ID
PRODUCT_ID="bcdde7f7-129e-4ec1-abc3-d4e0c852fa68"

curl -sL "https://api.polar.sh/v1/orders?limit=100&product_id=$PRODUCT_ID" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" | \
  jq '[.items[] | {date: .created_at[0:10], amount: (.total_amount / 100), customer: .customer.email}]'
```

## All Pack Product IDs

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

## User Count by Tier

```bash
curl -sL "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT argMax(user_tier, start_time) as tier, count() as users FROM generation_event WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' AND user_id != 'undefined' GROUP BY user_id FORMAT JSON" | \
  jq '.data | group_by(.tier) | map({tier: .[0].tier, users: length})'
```

## Weekly Spending by Tier

```bash
curl -sL "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT toStartOfWeek(start_time) as week, user_tier, sum(total_price) as total_spend, count() as requests FROM generation_event WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' GROUP BY week, user_tier ORDER BY week DESC FORMAT JSON" | jq '.data'
```

---

# Analysis Scripts

## Weekly Pack Revenue

```bash
.claude/skills/spending-analysis/scripts/weekly-pack-revenue.sh
```

Shows weekly breakdown of actual pack purchases (real revenue, not free tier usage).

## Pack Purchases by Tier

```bash
.claude/skills/spending-analysis/scripts/pack-purchases-by-tier.sh
```

Cross-references Polar pack purchasers with Tinybird tier data to show which tiers buy most pollen proportionally.

---

# Key Findings (Jan 2026 Analysis)

## Pack Purchases by Tier (Weighted by User Count)

| Tier | Revenue | Purchasers | Total Users | % Who Buy | $/User |
|------|---------|------------|-------------|-----------|--------|
| nectar | $146 | 10 | 23 | **43.5%** | **$6.37** |
| flower | $564 | 18 | 218 | **8.3%** | **$2.59** |
| seed | $1,173 | 38 | 575 | **6.6%** | **$2.04** |
| spore | $1,657 | 106 | 6,757 | **1.6%** | **$0.25** |

**Key Insight**: Higher tiers buy MORE pollen proportionally, not less.

## Revenue Trend (9 Weeks)

| Week | Orders | Revenue |
|------|--------|---------|
| Jan 13-19 | 51 | $573 |
| Jan 6-12 | 83 | $928 |
| Dec 30-Jan 5 | 59 | $928 |
| Dec 23-29 | 21 | $432 |
| Dec 16-22 | 22 | $276 |
| Dec 9-15 | 16 | $141 |
| Dec 2-8 | 17 | $293 |
| Nov 25-Dec 1 | 10 | $293 |
| Nov 18-24 | 1 | $10 |

---

# Notes

- **Free tier spending** in Tinybird includes daily pollen allocation - not real revenue
- **Pack purchases** in Polar are actual paid revenue
- Cross-reference by `external_id` (Polar) = `user_id` (Tinybird)
- Polar API returns 307 redirects - use `curl -sL` to follow
