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
export TINYBIRD_TOKEN=$(sops -d operations/kpi/secrets/env.json | jq -r '.TINYBIRD_READ_TOKEN')
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
  --data-urlencode "q=SELECT toStartOfWeek(start_time) AS week, splitByChar(':', selected_meter_slug)[-1] AS meter_source, sum(total_price) AS total_spend, count() AS requests FROM generation_event_v2 WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' GROUP BY week, meter_source ORDER BY week DESC FORMAT JSON" \
  | jq '.data'
```

# Funding provenance vs consumption

`generation_event_v2` spend (including `pack_spend`/`selected_meter_slug`) reports what
a wallet bucket *consumed*, not where the money came from. Community/BYOP contribution
rewards and other earned credits can land in the same payer bucket as purchased packs,
so nonzero bucket spend is not proof of cash funding — and checking checkout-session
credits alone is incomplete too, since a successful auto-top-up never creates a
`checkout.session.*` row. To attribute cash vs. earned funding, reconcile each source
separately and do not sum figures that use different monetary bases:

- Stripe checkout `pollen_credited` (`stripe_event`, `payment_status = 'paid'`)
- Paid auto-top-up `amount_usd` (principal credited — see below for the gross figure)
- Relevant historical Polar credits (pre-Stripe, Nov 2025–Jan 2026)
- Claimed community/BYOP rewards, by bucket

Absence of cash purchases is not itself evidence of non-payment or abuse; positive
wallet consumption is not itself proof of cash payment.

# Auto-top-up reconciliation (principal vs gross payment)

D1's auto-topup `amount_usd` is the *principal credited*, not the customer's total cash
payment — Stripe fees and any exclusive taxes sit on top of it. For a gross-cash figure,
match each completed auto-top-up to its paid Stripe invoice by `stripe_invoice_id` and
use that invoice's `amount_paid` (in its verified currency), not `amount_usd`. Fetch the
known invoice IDs directly with bounded concurrency rather than paginating the full
invoice list — most invoices in a full scan are unrelated checkout invoices. Keep
credited principal, gross payment, taxes, refunds, and net revenue as distinct figures
throughout; do not report principal as "dollars paid".

# Historical pricing interventions

For any investigation of a past price change or promotion, define the intervention from
the exact deployed code snapshot at the time, not from a PR title or an announcement —
those can diverge from what actually shipped (an "X% cheaper" announcement can coexist
with an unrelated same-day multiplier change that offsets it). Confirm actual billed
unit prices from `generation_event_v2` around the change:

```bash
curl -sS "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" \
  --data-urlencode "q=SELECT toDate(start_time) AS day, round(avg(total_price), 6) AS avg_unit_price, count() AS requests FROM generation_event_v2 WHERE model_used = '<model>' AND start_time BETWEEN '<before>' AND '<after>' GROUP BY day ORDER BY day FORMAT JSON" \
  | jq '.data'
```

Reconcile provider base cost, markup (`priceMultiplier`), and any pack-credit promotion
together — they move independently, and a discount on one can be offset by a change to
another. Keep raw cash payments distinct from credited Pollen units throughout; a
credited-unit discount does not by itself change cash buying power. Record which
users/models were exposed before the payment event being explained, note any
simultaneous unrelated changes, and revise the causal hypothesis when event-level
billing evidence contradicts the public narrative.

# Conversion cohort analysis

For "do these users pay more" or "did this cause conversion" claims, define the
comparison before running it:

- **Outcome-independent cohort membership.** Don't select on payment, or on a
  payment-triggered/onboarding/refund reward — that selects on the outcome. Classify
  contribution rewards (e.g. PR/quest merges) separately from rewards that themselves
  depend on having already paid.
- **Freeze an explicit cutoff.** State the exact "as of" date for both cohort
  membership and the payment check.
- **Match observation windows.** A cohort from the last 7 days is provisional — each
  member has had between 0 and 7 days to convert. Compare it only against another
  provisional cohort measured the same way, or let it mature into a fixed per-user
  window (e.g. "first 7 days after signup" for every member, regardless of signup date).
- **Check temporal ordering, not just group size.** For any reward-linked cohort, count
  how many members paid *before* first receiving the reward versus *after* — if most
  paid first, the reward did not drive conversion, whatever the raw payer percentage
  looks like.
- **Deduplicate at user level.** Count each user once regardless of how many qualifying
  events they have.
- **Report group sizes and caveats alongside the number.** A percentage with no
  denominator, cohort age, or selection description is not a comparison.

Cash-funding provenance for the payment side is covered separately above ("Funding
provenance vs consumption").

# Notes

- `stripe_event` is the source of truth for pack-purchase revenue analytics.
- `generation_event_v2` records Pollen consumption, not cash revenue.
- Both datasets use `user_id`, so revenue and usage can be joined directly.
- The dashboard's `daily_stripe_revenue` pipe applies the same paid-event filter.
- For pre-migration revenue history, note that Polar was the pre-Stripe merchant
  of record (Nov 2025–Jan 2026) and is retired. Do not combine historical Polar
  and Stripe totals without checking the cutoff for overlap.
- Request-count metrics (e.g. BYOP/attribution shares) are volatile and dominated by
  free/near-zero-price traffic, and drift fast between snapshots. Always report the
  exact date window (start/end) alongside any count-based claim, and prefer
  revenue-share (% of `total_price`) over raw request counts for strategic claims.
