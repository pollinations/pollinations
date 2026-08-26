# InferencePort Connector Guide

Canonical vendor: `inferenceport`

## Verified — 2026-08-25

- Console: <https://console.inferenceport.ai>
- Wallet API: `GET https://api.inferenceport.ai/v1/me`
- Credit history API: `GET https://api.inferenceport.ai/v1/credits/ledger`
- Both API calls accept the same bearer key used for generation. `/me` returns
  the live wallet balance, total purchased, total spent, and usage summary.
- OP Pollen contains internal model usage. InferencePort is the independent
  source for provider wallet and cost evidence.

Collection steps:

1. From the repository root, run the read-only collector with the existing live
   generation credential:

   ```bash
   sops exec-env gen.pollinations.ai/secrets/prod.vars.json \
     'node operations/economics/ingest/scripts/collect-inferenceport-balance.mjs'
   ```

2. Preserve the generated JSON in `data/inbox/inferenceport/` and the monthly
   accounting evidence folder in Google Drive.
3. Record the API `collected_at` timestamp as the balance check time. Do not
   backdate the balance to month-end.
4. Use credit-ledger entry types to distinguish purchased wallet funds from
   promotional credits. Do not guess the paid/credit split from the aggregate
   balance alone.
5. Reconcile provider usage against OP Pollen without forcing equality when the
   provider exposes less model granularity.

Manual fallback:

1. Open <https://console.inferenceport.ai> and sign in.
2. Save the visible wallet balance and check time as a screenshot.
3. Preserve the screenshot in `data/inbox/inferenceport/` and Google Drive.

Known traps:

- Internal Pollen rows are not an independent provider statement.
- `balance_credits` is an aggregate wallet value. It is not proof that the full
  balance is purchased cash or promotional credit.
- The collector is read-only. It does not publish or replace Tinybird rows.
