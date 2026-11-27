# InferencePort Connector Guide

Canonical vendor: `inferenceport`

## Verified — 2026-11-03

- Console: <https://console.inferenceport.ai>
- Wallet API: `GET https://api.inferenceport.ai/v1/me`
- Credit history API: `GET https://api.inferenceport.ai/v1/credits/ledger?limit=500`
- Both API calls accept the same bearer key used for generation. `/me` returns
  the live wallet balance, total purchased, total spent, and usage summary.
- OP Pollen contains internal model usage. InferencePort is the independent
  source for provider wallet and cost evidence.

Collection steps:

1. Use the existing live generation credential for two bounded read-only API
   requests:

   ```bash
   sops exec-env gen.pollinations.ai/secrets/prod.vars.json \
     'curl -sS https://api.inferenceport.ai/v1/me -H "Authorization: Bearer $INFERENCEPORT_API_KEY"'
   sops exec-env gen.pollinations.ai/secrets/prod.vars.json \
     'curl -sS https://api.inferenceport.ai/v1/credits/ledger -H "Authorization: Bearer $INFERENCEPORT_API_KEY"'
   ```

2. The credit ledger defaults to only 50 newest rows and accepts `limit` up to
   500. Verify its oldest timestamp precedes the month start before treating
   the month as complete. Preserve the generated JSON in
   `<collection-dir>/evidence/inferenceport/` and the monthly
   accounting evidence folder in Google Drive.
3. Verify `/me.identity.email` and `user_id` against the private journal.
   Record `/me.generated_at` and the request collection time. `wallet.updated_at`
   is the last mutation, not the balance-check time. Do not backdate the snapshot.
4. Use credit-ledger entry types to distinguish purchased wallet funds from
   promotional credits. The live `/me` wallet may also expose `paid_credits`
   and `promotional_credits`; reconcile those fields to `balance_credits`.
   Do not guess the split from the aggregate balance alone. Keep purchases,
   usage, and provider refund adjustments as separate facts, and reconcile
   the opening balance plus movements to the current balance after any
   post-month activity.
   Verify chronological `balance_after` arithmetic. Join positive refund
   adjustments to their original usage through `source_ref`; they are not
   purchased funding. Treat `usage_summary` as an unspecified period unless
   its boundaries are documented.
5. Reconcile provider usage against OP Pollen without forcing equality when the
   provider exposes less model granularity.

Manual fallback:

1. Open <https://console.inferenceport.ai> and sign in.
2. Save the visible wallet balance and check time as a screenshot.
3. Preserve the screenshot in `<collection-dir>/evidence/inferenceport/` and Google Drive.
4. Check original invoice and receipt history. A late-issued accounting invoice
   can document an earlier top-up; retain issue date, funding date and payment
   reference separately.

Known traps:

- Internal Pollen rows are not an independent provider statement.
- `balance_credits` is an aggregate wallet value. It is not proof that the full
  balance is purchased cash or promotional credit.
- Both API requests are read-only. They do not publish or replace Tinybird rows.
- The personal console's **Last purchase** can point to a usage refund. Match
  its timestamp, entry type and `source_ref` to the ledger before recognizing
  purchased funding.
- Personal **Billing** can have wallet and plan information without an invoice
  history or portal control. Verify the account and available organization
  context, capture the missing surface, and reuse genuine originals from the
  mailbox/archive. Absent controls do not prove that no document exists.
- Rewards can be model discounts or unclaimed offers. Count only credited
  wallet funds; do not claim rewards or include unclaimed offers in a forecast.
