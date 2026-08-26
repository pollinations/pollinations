# Tinybird Connector Guide

Canonical vendor: `tinybird`

## Verified — 2026-08-21

- Status: Tinybird service APIs and the `tb` CLI expose operational usage, but
  provider invoices and Organization Billing remain the accounting authority.
- Billing periods can cross calendar months and must be preserved as printed.

Primary evidence sources:

- Tinybird Organization Billing: invoice and plan/usage detail.
- Invoice email/PDF: legal source document.
- `tb` CLI/service datasources: operational context only.
- Wise: settled payment.

Collection steps:

1. Download every new invoice PDF from Organization Billing or email.
2. Preserve invoice issue date and exact service-period boundaries.
3. Match the settled Wise charge without rewriting the invoice period to the
   payment month.
4. Use `tb` operational metrics only to explain the bill, not replace it.
5. Save evidence in Google Drive and reference it from the transaction row.

Known traps:

- Tinybird workspaces are data environments, not separate invoices unless the
  provider document says so.
- A cross-month invoice can legitimately create timing differences.
- Never infer tax treatment from an operational usage endpoint.
