# OVHcloud Connector Guide

Canonical vendor: `ovhcloud`

## Verified — 2026-09-04

- Status: signed OVH credit API works end to end.
- Account: `fd415008-ovh` (`Myceli.AI OÜ`), login `elliot@myceli.ai`.
- Billing: <https://manager.eu.ovhcloud.com/#/billing/payment/credits>
- Startup voucher operations: <https://manager.eu.ovhcloud.com/#/billing/payment/credits/STARTUP_PROGRAM>
- Movement amounts use signed values: `USE` is negative and `VOUCHER` is
  positive. Preserve provider dates and use original invoice service periods.

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
- `GET /me/bill/{billId}` and `GET /me/bill/{billId}/details` when the
  consumer key has invoice-detail permission.
- Sign every request with the OVH server time; never log the signature inputs.
- The current consumer key reads balances and movements but receives `403` for
  bill/order details. Use invoice PDFs or the authenticated dashboard for SKU
  classification; movement aggregates prove only exact voucher burn.

## Invoice and credit evidence — verified 2026-11-03

- When the existing API credential lacks bill permission, use the authenticated
  manager's invoice list and original PDF downloads. Do not create credentials.
- Invoice lines carry service periods and distinguish model inference, Public
  Cloud snapshots, and GPU capacity. Voucher application can reduce the total
  due to zero; use the service subtotal before `Use of your Voucher` for cost.
- For month-to-date usage, use the project’s Billing Control → Current usage.
  On 2026-11-16, Estimate of my next invoice omitted the AI Endpoints usage
  visible in Current usage. Retain current usage as evidence until invoiced.
- `GET /me` verifies the account, organization and email. Startup balance
  `expiring[]` and `balanceDetails[].expiring[]` include remaining amount and
  `expirationDate`; normalize the observed timezone to UTC, never invent an
  end-of-day expiry. Do not also add the same lot as an account total.
- Deleted projects can remain in `/cloud/project`. Confirm lifecycle from
  detailed status or the termination notice. Termination can issue a mid-month
  bill, so credit movement dates alone cannot establish the usage month.
- Complete movement sums can differ from the current balance; retain the
  discrepancy without inventing a balancing adjustment.
- Invoice service subtotals and voucher offsets can differ from the API's
  `USE` amount for the same order. Preserve both sources and the residual;
  do not silently allocate the difference or call it rounding without evidence.
- Repeated Public IPv4 descriptions can represent distinct invoice lines.
  Retain the invoice line ordinal and project ID when individual resource IDs
  are absent. Keep zero-charge bandwidth lines in the original source index.
- `/cloud/project/{serviceName}/usage/history` supports `from`/`to` and detail
  `/usage/history/{usageId}`, but the existing key returns `403`; use the
  dashboard fallback and preserve the access limitation.

## Verified — 2026-10-02 (invoice notices)

- OVHcloud may send two invoices for one service month in a single Gmail
  thread. Inspect every message in that thread; a thread search result is not
  one invoice.
- The notification's `www.ovh.ie/cgi-bin/order/bill.pdf?reference=...` link
  can return an HTML sign-in page to an unauthenticated downloader. Check the
  response's content type and PDF structure before archiving it as an invoice.
  Preserve the original RFC822 notice in the issue month's Supporting Evidence
  folder, record the PDF as missing, and download the supplier PDF from the
  matching signed-in manager account.
- In the manager, verify `Myceli.AI OÜ` and the account identifier, then open
  `My bills` → `Invoices`. Each invoice row has an actions menu with `See PDF
  version`; this downloads `Invoice_<reference>.pdf` into Downloads. Verify
  its PDF structure, invoice number, issue date, and service period before
  archiving. An invoice issued on October 1 for September service belongs in
  October's `Invoices` folder by issue date, while its usage belongs to
  September's vendor ledger.

Known traps:

- OVH API requests require signed headers using the application key, application secret, consumer key, method, URL, body, and OVH server timestamp.
- Startup credit burn appears as `USE` movements in the `STARTUP_PROGRAM` credit balance.
- `USE` movement amounts are negative; negate them to get positive credit burn.
- `USE` movements record voucher debit dates, often invoice dates. Attribute
  usage from the original service period, including any mid-month termination bill.
- OVH invoices are issued after the service month. Use each line's service
  period, not the invoice issue month, for `start` and `end`.
- One invoice can mix AI Endpoints, dedicated GPU machines, gateway VMs,
  disks, and snapshots. Preserve that split instead of assigning the whole
  invoice to infrastructure.
- The January and February 2026 `myceligpu` hourly machines backed the legacy
  Pollinations image API. Keep those rows as `gpu`; the separate
  `legacy-gateway`, disk, and snapshot lines remain `infra`.
- Record an exact GPU model only when a provider export or historical fleet
  record proves it. For the January and February 2026 OVH machines, use the
  shared workload label `legacy-image-api`; the individual served model is not
  evidenced.
- Keep native EUR unless the source itself provides another currency.
