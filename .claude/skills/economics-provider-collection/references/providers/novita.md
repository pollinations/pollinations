# Novita Connector Guide

Canonical vendor: `novita`. This covers direct Novita billing only. Novita
inference purchased through OpenRouter or Vercel remains billed to those vendors.

## Sources

Official documentation reviewed 2026-10-06. Account access, collection and
financial evidence still require live verification; documentation is not
evidence of a balance, account identity or enabled model.

Use an existing authorized `NOVITA_API_KEY` with Bearer authentication. Load it
directly from its secure location into the request process; never print it,
put it in a command argument, or retain authorization headers in evidence.
If access is missing, ask for its secure location. Adding or deploying a key
requires the separate repository secret approval.

Before collecting, confirm the Novita customer/team and register its canonical
account, lifecycle and access target. Do not infer the account from another
provider. For dashboard work enumerate every connected Chrome window and use
the existing tab whose visible account and organization match; ask if ambiguous.
Keep account-specific evidence and raw financial responses outside Git.

| Fact | Supported API and reference |
| --- | --- |
| Model catalog | `GET /openai/v1/models` ([docs](https://docs.novita.ai/api-reference/model-apis-llm-list-models)) |
| Balance | `GET /openapi/v1/billing/balance/detail` ([docs](https://docs.novita.ai/api-reference/basic-get-user-balance)) |
| Model usage | `GET /openapi/v1/billing/bill/list` ([docs](https://docs.novita.ai/api-reference/basic-query-usage-based-billing)) |
| API-key usage | `GET /openapi/v1/billing/apikey/bill/list` ([docs](https://docs.novita.ai/api-reference/basic-query-apikey-bill)) |
| Monthly bills | `GET /openapi/v1/billing/monthly/bill` ([docs](https://docs.novita.ai/api-reference/basic-query-monthly-bill)) |
| Funding/refunds | `GET /openapi/v1/bill/transaction` ([docs](https://docs.novita.ai/api-reference/basic-query-transaction)) |
| Capacity | `GET /openapi/v1/user/quota/list` ([docs](https://docs.novita.ai/api-reference/quota-list)) |

All endpoints above use `https://api.novita.ai`. Prefer these supported APIs;
use the authenticated [console](https://novita.ai/console) for missing evidence.

## Collect and reconcile

1. Save the balance response with its checked time. Monetary balance fields are
   integer strings in 1/10000 USD. `cashBalance` is remaining top-up cash;
   `creditLimit` is borrowing capacity, not a promotional grant. Retain
   `availableBalance`, pending charges and outstanding invoices as distinct
   evidence; do not add these fields together or duplicate them as balance lots.
   Verify voucher balances and expiry separately before recording grants.
2. Query model usage with `cycleType=Day`, `productCategory=llm` and Unix-second
   `startTime`/`endTime`. Query API-key usage with `category=llm` instead.
   Its daily windows are at most 31 days; hourly windows at most seven days.
   Verify boundary semantics from returned intervals, normalize ledger coverage
   to end-exclusive UTC, and retain the original bounds. The current month is
   partial. Keep non-LLM products separate and check all billed categories.
3. Retain product ID/name, key owner ID, request count, every non-zero token or
   cache quantity, discount and funding split. `amount`, `voucherAmount` and
   `payAmount` are in 1/10000 USD; `payAmountDisplay` is already USD. Unit prices
   also use `pricePrecision`; do not apply the amount conversion blindly to
   rates. Reconcile the reported cash/voucher split against total charges.
   Record usage as negative paid/credit under the verified canonical account.
4. Query monthly bills with `startMonth`, `page` and `pageSize`; retain only the
   requested billing month and verify pagination/coverage. Download `invoiceUrl`
   when present. An empty URL is missing invoice evidence, not proof that no
   invoice is required. Archive documents using the parent skill's Drive flow.
5. Query transactions with `pageNo`, `pageSize`, `transactionTimeStart` and
   `transactionTimeEnd`; paginate through `total`. Review successful recharges
   and refunds individually. Recharges are funding, never inference usage.
   Match supplier documents and bank payments without counting the same top-up
   twice. Transaction amounts are in 1/10000 USD.
6. Add reviewed `modelLabels` only from exact billed lines and the Pollen ID used
   in that period. Keep missing mappings visible. Reconcile against Pollen rows
   whose serving provider is `novita`, including local/staging/manual usage
   sharing the account. Never move OpenRouter/Vercel spend to Novita based on
   the physical backend name.
7. Prepare the exact ledger batch, backup and totals under the parent skill's
   approval rules. Validate staging first with the staging Economics read token;
   production writes require separate approval. Verify balances, model usage,
   funding, invoice coverage and provider reconciliation in the dashboard.

Never fabricate zero usage or balances from an empty, unauthorized or partial
response. Missing account coverage prevents a complete provider-month close.
