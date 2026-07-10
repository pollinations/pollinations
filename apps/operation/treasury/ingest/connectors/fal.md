# fal.ai Connector Guide

Canonical vendor: `fal`

## Empirical status — 2026-07-10

- Status: pricing API and internal usage meter work; account billing is manual.
- The unit-price estimate for Stable Audio 2.5 returned USD 0.20 without
  triggering inference.
- `op_pollen` showed June USD 4.96 paid cost and July partial USD 1.94.
- Use dashboard/invoice evidence for account balance and closed cash charges.

Use when:

- collecting fal model usage and price evidence
- reconciling fal dashboard, invoice, or prepaid cash activity
- checking a model's current unit price

Primary evidence sources:

- Usage: Tinybird `op_pollen` rows where `vendor = 'fal'`.
- Unit price: `POST https://api.fal.ai/v1/models/pricing/estimate`.
- Closed-month/cash: fal billing dashboard, invoice, receipt, Wise, or
  `op_transactions`.

Required credential:

- `FAL_KEY`

Collection steps:

1. Query bounded `op_pollen` usage for the requested period.
2. When price evidence is needed, request an estimate without running a model:

   ```bash
   curl --fail-with-body --silent --show-error \
     -X POST "https://api.fal.ai/v1/models/pricing/estimate" \
     -H "Authorization: Key $FAL_KEY" \
     -H "Content-Type: application/json" \
     --data '{"estimate_type":"unit_price","endpoints":{"<model-id>":{"unit_quantity":1}}}'
   ```

3. Save dashboard/invoice/price evidence to `data/inbox/` and use
   `agent.system.txt` to extract or reconcile it.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `cloud` for invoices/top-ups
- `should_match_op_transaction`: true only for cash evidence
- `should_match_op_cloud`: true for usage/price evidence

Known traps:

- Auth uses `Authorization: Key`, not `Bearer`.
- Historical spend has no confirmed public REST endpoint; use Tinybird plus
  dashboard/invoice evidence.
- Do not run inference as a billing smoke test because it consumes real funds.
- A prepaid top-up is funding, not usage cost.
- Preserve dashboard/Tinybird discrepancies for review.

Official reference:

- https://docs.fal.ai
