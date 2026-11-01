# Tinybird Connector Guide

Canonical vendor: `tinybird`

## Verified — 2026-08-21

- Status: Tinybird service APIs and the `tb` CLI expose operational usage, but
  provider invoices and Organization Billing remain the accounting authority.
- Management reporting uses the invoice month (operator decision, 2026-10-17).
  Book each full bill once in that month, without proration. Vendor start/end
  identify that booking month; keep the printed service dates and invoice date
  in evidence with `booking_basis=invoice_month`. These dates describe booked
  expense coverage, not a calendar-month usage export.

Primary evidence sources:

- Tinybird Organization Billing: invoice and plan/usage detail.
- Invoice email/PDF: legal source document.
- `tb` CLI/service datasources: operational context only.
- Wise: settled payment.

Collection steps:

1. Download every new invoice PDF from Organization Billing or email.
2. Preserve invoice issue date and exact service-period boundaries in evidence.
3. Match the settled Wise charge. Use the invoice month for the Vendor booking;
   a later payment does not move the expense or create another expense.
4. Use `tb` operational metrics only to explain the bill, not replace it.
5. Save evidence in Google Drive and reference it from the transaction row.

Known traps:

- Tinybird workspaces are data environments, not separate invoices unless the
  provider document says so.
- Do not request calendar usage solely to split a retained Tinybird invoice
  across months; invoice-month booking is the agreed reporting convention.
- Never infer tax treatment from an operational usage endpoint.
