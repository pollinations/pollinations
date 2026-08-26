# Scaleway Connector Guide

Canonical vendor: `scaleway`

## Verified — 2026-08-22

- Status: billing API authentication works.
- Preserve each discount's currency when extracting.
- Keep the connector for historical invoices and grants; zero consumption is
  a valid API result, not a credential failure.
- Dashboard login: `elliot@pollinations.ai`.
- The login contains two organizations: `Pollinations.AI` (organization ID
  `fad8c43c-762a-4cde-9043-641d6ff37586`) and `Pollinations GmbH`
  (`b399fe9d-4976-4162-a471-9920aaeda163`). Audit both before recording the
  aggregate Scaleway balance.
- Its Cost optimization page reports zero active vouchers and three expired
  vouchers. The separate `Pollinations GmbH` organization has no vouchers,
  payment method, invoices, or 2026 consumption.

Primary evidence sources:

- Current credit balance: the active-vouchers table at
  `https://console.scaleway.com/billing/optimization`, after selecting the
  `Pollinations.AI` organization.
- Current and monthly usage: Cost Manager at
  `https://console.scaleway.com/billing/consumption` or the consumption API.
- Closed obligations: invoice API and Payment and billing dashboard.

Required credentials:

- `SCW_SECRET_KEY`
- `SCW_ORGANIZATION_ID`

Collection steps:

1. Query current or bounded monthly consumption:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.scaleway.com/billing/v2alpha1/consumption?organization_id=$SCW_ORGANIZATION_ID" \
     -H "X-Auth-Token: $SCW_SECRET_KEY"
   ```

2. List discounts for grant amount, use, remaining value, and active dates:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.scaleway.com/billing/v2alpha1/discounts?organization_id=$SCW_ORGANIZATION_ID" \
     -H "X-Auth-Token: $SCW_SECRET_KEY"
   ```

3. Use the invoice endpoints for closed-month obligations and downloads.
4. Save bounded evidence to `data/inbox/` and use this skill to
   extract or reconcile it.
5. Preserve positive consumption rows by project and SKU. Map managed AI to
   `inference`, L4 compute to `gpu`, and CPU/network/storage to `infra`.
6. If an invoice applies a discount only at invoice level, allocate that
   discount pro rata across its exact consumption rows and document the
   allocation. Keep VAT in a separate `infra` row so it reconciles the amount
   due without inflating model/provider usage.

Known traps:

- Consumption is not real time; preserve the response's update timestamp.
- Discount `mode` determines whether `value` is a fixed amount or a rate.
- Money objects carry currency; do not assume USD.
- Expired discounts with zero remaining are historical facts, not active runway.
- An issued or failed-payment invoice is still provider-payable. Do not record
  it as a waiver; Wise/card evidence is required before calling it cash paid.
- Do not forecast from partial current-month consumption.

Official reference:

- https://www.scaleway.com/en/developers/api/billing
