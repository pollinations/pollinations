# OVHcloud Connector Guide

Canonical vendor: `ovhcloud`

## Verified — 2026-07-10

- Status: signed OVH credit API works end to end.
- Movement amounts use signed values: `USE` is negative and `VOUCHER` is
  positive. Preserve the provider date before shifting a monthly debit.

Use when:

- collecting OVHcloud invoices
- collecting startup credit burn evidence
- reconciling OVHcloud infrastructure usage

Primary evidence sources:

- Invoice/payment: OVHcloud invoice PDFs and Wise/card transactions.
- API: OVH credit balance movements for startup credit burn.
- Dashboard: billing and startup credit pages when API evidence is incomplete.

Required credentials:

- `OVH_APPLICATION_KEY`
- `OVH_APPLICATION_SECRET`
- `OVH_CONSUMER_KEY`
- `OVH_ENDPOINT`

Collection endpoints:

- `GET /me/credit/balance`
- `GET /me/credit/balance/STARTUP_PROGRAM`
- `GET /me/credit/balance/STARTUP_PROGRAM/movement`
- Fetch each movement ID for amount, type, currency, and provider timestamp.
- Sign every request with the OVH server time; never log the signature inputs.

Known traps:

- OVH API requests require signed headers using the application key, application secret, consumer key, method, URL, body, and OVH server timestamp.
- Startup credit burn appears as `USE` movements in the `STARTUP_PROGRAM` credit balance.
- `USE` movement amounts are negative; negate them to get positive credit burn.
- `USE` movements are dated when OVH debits the credit balance, usually on the invoice date. Attribute the usage to the previous calendar month when the movement is the monthly bill debit.
- Keep native EUR unless the source itself provides another currency.

Expected entry:

- `cost_category`: `infrastructure` or `credit`
- `op_cloud_type`: `infra`
- `op_transaction_category`: `cloud` for invoices/payments, `null` for pure credit-burn evidence
- `should_match_op_transaction`: true for invoices/payments, false for pure credit-burn evidence
- `should_match_op_cloud`: true
