# DigitalOcean Connector Guide

Canonical vendor: `digitalocean`

## Verified — 2026-08-20

- Status: blocked by the stored token's scope, not by API availability.
- `GET /v2/account` succeeded and reported an active account.
- Both `/v2/customers/my/balance` and `/billing_history` returned HTTP 403.
- The same 403 scope block was reconfirmed on 2026-08-20.
- The final July invoice was recovered from the Myceli mailbox instead. Invoice
  `550856601` records $231.77 of resource usage, fully covered by IaaS credit,
  with $0 cash due. It is stored in Drive and published at resource grain.
- Replace or re-scope `DIGITALOCEAN_TOKEN` with `billing:read`; until then,
  use invoices and dashboard evidence. Do not interpret the 403 as zero.

Collection steps:

1. Query the current balance:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.digitalocean.com/v2/customers/my/balance" \
     -H "Authorization: Bearer $DIGITALOCEAN_TOKEN"
   ```

2. Query billing history and follow `links.pages.next` only as far as needed:

   ```bash
   curl --fail-with-body --silent --show-error \
     "https://api.digitalocean.com/v2/customers/my/billing_history?per_page=100" \
     -H "Authorization: Bearer $DIGITALOCEAN_TOKEN"
   ```

3. Use invoices or Billing Insights when a closed-month or resource breakdown
   is required. Save raw evidence to `data/inbox/`.
4. Use this skill to extract or reconcile it.

Known traps:

- Monetary fields are strings.
- `month_to_date_usage` is partial and gross before credit application.
- Balance is a current snapshot; it does not prove a historical month.
- Billing history can show credit grants and expirations, but a future expiry
  may still require dashboard or grant-document evidence.
- Do not forecast from partial current-month usage.

Official reference:

- https://docs.digitalocean.com/platform/billing/reference/api/
