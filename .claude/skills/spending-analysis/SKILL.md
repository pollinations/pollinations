---
name: spending-analysis
description: Analyze Pollinations Stripe revenue, pack purchases, and balance-bucket spending patterns with Tinybird production data.
---

# Requirements

- Run from the `pollinations` repository root.
- Install `curl`, `jq`, and `sops`.
- Use the production Tinybird read token. The staging workspace has no real revenue.

# Setup

```bash
export TINYBIRD_TOKEN=$(sops -d apps/operation/kpi/secrets/env.json | jq -r '.TINYBIRD_READ_TOKEN')
```

Never print the token. Revenue queries must filter successful Stripe checkout
events so asynchronous payment methods are counted exactly once.

# Weekly pack revenue

```bash
curl -sS "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT toStartOfWeek(timestamp) AS week, round(sum(amount_cents) / 100, 2) AS revenue_usd, count() AS purchases FROM stripe_event WHERE payment_status = 'paid' AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') AND timestamp >= now() - INTERVAL 90 DAY GROUP BY week ORDER BY week DESC FORMAT JSON" \
  | jq '.data'
```

# Recent pack purchases

```bash
curl -sS "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT timestamp, user_id, session_id, amount_cents / 100 AS amount, currency, payment_method FROM stripe_event WHERE payment_status = 'paid' AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') ORDER BY timestamp DESC LIMIT 100 FORMAT JSON" \
  | jq '.data'
```

# Revenue by customer

```bash
curl -sS "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT user_id, round(sum(amount_cents) / 100, 2) AS revenue_usd, count() AS purchases FROM stripe_event WHERE payment_status = 'paid' AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') AND timestamp >= now() - INTERVAL 30 DAY GROUP BY user_id ORDER BY revenue_usd DESC LIMIT 50 FORMAT JSON" \
  | jq '.data'
```

# Weekly spend by balance bucket

```bash
curl -sS "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT toStartOfWeek(start_time) AS week, splitByChar(':', selected_meter_slug)[-1] AS meter_source, sum(total_price) AS total_spend, count() AS requests FROM generation_event WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' GROUP BY week, meter_source ORDER BY week DESC FORMAT JSON" \
  | jq '.data'
```

# Notes

- `stripe_event` is the source of truth for pack-purchase revenue analytics.
- `generation_event` records Pollen consumption, not cash revenue.
- Both datasets use `user_id`, so revenue and usage can be joined directly.
- The dashboard's `daily_stripe_revenue` pipe applies the same paid-event filter.
- For pre-migration revenue history, use the read-only
  [Polar query notes](../provider-billing/providers/polar.md). Do not combine
  historical Polar and Stripe totals without checking the cutoff for overlap.
