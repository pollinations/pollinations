---
name: pollinations-support-profile
description: Triage the Pollinations Express GitHub support queue and prepare private profiles and drafts for issue replies. Use for GitHub support cases and the scheduled Express queue review.
---

# Pollinations GitHub support profiles

For the daily queue scan, read [daily-express-triage.md](../../../operations/scheduled-tasks/daily-express-triage.md).

Whenever you prepare a GitHub support reply for `pollinations/pollinations`, show a compact **Private profile** above the customer-facing draft in the Codex chat. Include the GitHub handle, verified gross Stripe purchases over the last 90 days and since the first recorded payment, and one relevant support or contributor fact when available. Examples include a related open fix, a substantive prior maintainer reply, or merged contributions to Pollinations. Keep the draft short and grounded in current issue and deployment evidence. Keep purchase information and private account context out of the draft and GitHub. Follow the user's authorization when sending a reply.

Use “Pollinations credits” in private summaries and public replies, including when older issues use the retired name.

## Continue to the next case

After posting a comment, closing an issue, or finishing another support action, verify the result and complete any remaining authorized steps for that case. Then immediately pick up the next actionable case in the current queue. Recheck its status, gather the relevant context, and prepare the private profile and reply draft or concrete next action. Carry out actions already authorized for that next case. Bring any new public action or reward that needs approval to the user with the draft ready, and continue independent triage while waiting. Finish when the requested scope is exhausted or all remaining cases need input or access.

## Read-only purchase lookup

Resolve the reply recipient's numeric GitHub ID through GitHub. For an issue reporter, use the issue's `author { login ... on User { databaseId } }` fields. Use the comment author when replying to a specific participant. Map the verified ID to the latest `d1_user` snapshot. Avoid identity matches based on display names or emails.

From the Pollinations checkout, use the existing read-only `enter.pollinations.ai/observability/scripts/tb-prod.sh` helper. Substitute `REPORTER_GITHUB_ID` with the verified positive decimal ID. The payment query returns sums by currency and counts successful Checkout sessions and credited auto-top-up invoices once each. Amounts are gross before refunds and reflect recorded Stripe payments. Keep account identifiers, raw payment records, and credentials out of the report. If the query succeeds with no rows, say "no verified Stripe purchases found." If the query or identity lookup fails, say the purchase history is unavailable.

```sql
WITH
  (SELECT max(synced_at) FROM d1_user) AS snapshot_at,
  (SELECT uniqExact(id) FROM d1_user WHERE synced_at = snapshot_at AND github_id = REPORTER_GITHUB_ID) AS linked_accounts
SELECT
  linked_accounts,
  currency,
  count() AS payment_count,
  countIf(kind = 'checkout') AS checkout_count,
  countIf(kind = 'auto_topup') AS auto_topup_count,
  sum(cents) AS lifetime_paid_cents,
  sumIf(cents, kind = 'checkout') AS checkout_paid_cents,
  sumIf(cents, kind = 'auto_topup') AS auto_topup_paid_cents,
  sumIf(cents, paid_at >= now() - INTERVAL 90 DAY) AS paid_90d_cents,
  max(paid_at) AS last_payment_at
FROM (
  SELECT
    session_id,
    currency,
    if(startsWith(event_type, 'checkout.session.'), 'checkout', 'auto_topup') AS kind,
    max(amount_cents) AS cents,
    min(timestamp) AS paid_at
  FROM stripe_event
  WHERE livemode = 1
    AND notEmpty(session_id)
    AND user_id IN (SELECT id FROM d1_user WHERE synced_at = snapshot_at AND github_id = REPORTER_GITHUB_ID)
    AND (
      (event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') AND payment_status = 'paid')
      OR (event_type IN ('invoice.paid', 'invoice.payment_succeeded') AND payment_status = 'credited')
    )
  GROUP BY session_id, currency, kind
)
GROUP BY currency
FORMAT JSON
```
