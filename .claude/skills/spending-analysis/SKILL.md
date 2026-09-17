---
name: spending-analysis
description: Analyze Pollinations Stripe revenue, pack purchases, and balance-bucket spending patterns with Tinybird production data.
---

# Requirements

- Run from the `pollinations` repository root.
- Install `jq` and `sops`.
- Query with `enter.pollinations.ai/observability/scripts/tb-prod.sh "<sql>"` (below written
  as `tb-prod.sh`). It uses the production read token from SOPS; the staging workspace has
  no real revenue.

Revenue queries must filter successful Stripe checkout events so asynchronous payment
methods are counted exactly once.

# Weekly pack revenue

```bash
tb-prod.sh "SELECT toStartOfWeek(timestamp) AS week, round(sum(amount_cents) / 100, 2) AS revenue_usd, count() AS purchases FROM stripe_event WHERE payment_status = 'paid' AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') AND timestamp >= now() - INTERVAL 90 DAY GROUP BY week ORDER BY week DESC FORMAT JSON" | jq '.data'
```

# Recent pack purchases

```bash
tb-prod.sh "SELECT timestamp, user_id, session_id, amount_cents / 100 AS amount, currency, payment_method FROM stripe_event WHERE payment_status = 'paid' AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') ORDER BY timestamp DESC LIMIT 100 FORMAT JSON" | jq '.data'
```

# Revenue by customer

```bash
tb-prod.sh "SELECT user_id, round(sum(amount_cents) / 100, 2) AS revenue_usd, count() AS purchases FROM stripe_event WHERE payment_status = 'paid' AND event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') AND timestamp >= now() - INTERVAL 30 DAY GROUP BY user_id ORDER BY revenue_usd DESC LIMIT 50 FORMAT JSON" | jq '.data'
```

# Weekly spend by balance bucket

```bash
tb-prod.sh "SELECT toStartOfWeek(start_time) AS week, splitByChar(':', selected_meter_slug)[-1] AS meter_source, sum(total_price) AS total_spend, count() AS requests FROM generation_event_v2 WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' GROUP BY week, meter_source ORDER BY week DESC FORMAT JSON" | jq '.data'
```

# Where the money came from vs what was spent

`generation_event_v2` spend (`pack_spend`, `selected_meter_slug`) says which bucket was
*consumed*, not how it was funded. `pack_balance` is credited by Stripe purchases and
auto-top-ups, but also by BYOP markup and community-model rewards (paid into the payer's
bucket, `shared/billing/track-helpers.ts`) and some quest rewards. So pack spend ≠ cash.
And Stripe checkout rows alone miss auto-top-ups, which never create a `checkout.session.*`
event. To separate cash from earned funding, reconcile each source on its own and don't
add figures with different monetary bases:

- Stripe checkout `pollen_credited` (`stripe_event`, `payment_status = 'paid'`)
- Auto-top-up `amount_usd` (principal credited — see below)
- Historical Polar credits (Nov 2025–Jan 2026)
- Claimed community/BYOP rewards, by bucket

No cash purchase ≠ non-payment or abuse; pack spend ≠ proof of cash.

# Auto-top-up: principal vs gross payment

Auto-top-up `amount_usd` in D1 is the Pollen principal credited; Stripe fees and taxes sit
on top. Gross cash is in Tinybird `stripe_event` as `payment_intent.succeeded` rows with an
empty `user_id` (auto top-ups are not attributed there); per user, fetch the invoice by
`stripe_invoice_id` and use `amount_paid`. Keep principal, gross payment, tax, refunds and
net revenue as separate numbers.

# Historical pricing changes

Define a past price change from the code deployed at the time, not the PR title or
announcement — an "X% cheaper" announcement can coexist with a same-day multiplier change
that cancels it. Confirm billed unit prices in `generation_event_v2`:

```bash
tb-prod.sh "SELECT toDate(start_time) AS day, round(avg(total_price), 6) AS avg_unit_price, count() AS requests FROM generation_event_v2 WHERE model_used = '<model>' AND start_time BETWEEN '<before>' AND '<after>' GROUP BY day ORDER BY day FORMAT JSON" | jq '.data'
```

Provider cost, `priceMultiplier` markup and pack-credit promotions move independently;
check all three. Keep cash paid separate from Pollen credited — a Pollen discount doesn't
change cash buying power. Note who was exposed before the payment event you're explaining
and any simultaneous changes.

# Conversion cohort analysis

For "these users pay more" or "X caused conversion" claims, define the comparison first:

- **Pick the cohort without looking at the outcome.** Don't select on payment or on
  rewards that require a payment. Contribution rewards (PR/quest merges) are fine;
  payment-triggered rewards are not.
- **Freeze a cutoff date** for both membership and the payment check.
- **Match observation windows.** A last-7-days cohort has had 0–7 days to convert;
  compare it only with another cohort measured the same way, or use a fixed per-user
  window ("first 7 days after signup").
- **Check ordering.** For a reward-linked cohort, count who paid *before* the reward vs
  *after*. If most paid first, the reward didn't drive conversion.
- **Count each user once.**
- **Report group sizes and caveats** with the percentage.

# Notes

- `stripe_event` is the source of truth for pack-purchase revenue analytics.
- `generation_event_v2` records Pollen consumption, not cash revenue.
- Both datasets use `user_id`, so revenue and usage can be joined directly.
- The dashboard's `daily_stripe_revenue` pipe applies the same paid-event filter.
- For pre-migration revenue history, note that Polar was the pre-Stripe merchant
  of record (Nov 2025–Jan 2026) and is retired. Do not combine historical Polar
  and Stripe totals without checking the cutoff for overlap.
- Request-count shares (e.g. BYOP share) are dominated by free traffic and drift fast.
  Always state the date window, and prefer revenue share (% of `total_price`) for
  strategic claims.
