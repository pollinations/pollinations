# io.net Connector Guide

Canonical vendor: `io.net`

## Verified — 2026-07-10

- Status: manual balance plus historical internal meter; no supported billing API.
- Repository model registries no longer show an active io.net provider route.
- Keep this guide for historical facts, invoices, and grant audits. A zero
  recent meter is not a live balance and should not overwrite old facts.

Use when:

- collecting io.net grant, balance, invoice, or usage evidence
- auditing historical io.net `op_cloud` rows
- reconciling io.net inference usage with cash or credits

Primary evidence sources:

- Usage: Tinybird `op_pollen` rows where `vendor = 'io.net'`.
- Balance/grants: io.net Usage & Billing dashboard screenshot or export.
- Closed-month/cash: invoice, receipt, Wise, or `op_transactions`.

Collection steps:

1. Query bounded `op_pollen` rows for the requested period.
2. Ask the operator for dashboard evidence when balance or grant status matters.
3. Save the raw screenshot, export, invoice, or receipt to `data/inbox/`.
4. Use `agent.system.txt` to extract or reconcile the evidence.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for invoices/payments
- `should_match_op_transaction`: true only for invoice/payment evidence
- `should_match_op_cloud`: true for usage evidence

Known traps:

- The documented public API is an inference surface, not a supported billing
  or balance API.
- Do not automate private dashboard endpoints or browser-session tokens.
- Separate prepaid cash, promotional grants, and metered usage.
- A current dashboard balance is not historical burn.
