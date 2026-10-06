# OVHcloud Connector Guide

Canonical vendor: `ovhcloud`

## Verified — 2026-09-04

- Status: signed OVH credit API works end to end.
- Account: `fd415008-ovh` (`Myceli.AI OÜ`), login `elliot@myceli.ai`.
- Billing: <https://manager.eu.ovhcloud.com/#/billing/payment/credits>
- Movement amounts use signed values: `USE` is negative and `VOUCHER` is
  positive. Preserve the provider date before shifting a monthly debit.

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

## Verified — 2026-09-06

- Invoice line items without the bill-detail API permission: in the signed-in
  manager tab (`manager.eu.ovhcloud.com`), the manager's own API proxy answers
  with the session:

  ```
  fetch('/engine/apiv6/me/bill/<billId>/details', {credentials: 'include'})
  fetch('/engine/apiv6/me/bill/<billId>/details/<detailId>', {credentials: 'include'})
  ```

  Each detail carries `description`, `periodStart`, `periodEnd`, `quantity`,
  `unitPrice.value` and `totalPrice.value` (EUR). AI Endpoints lines name the
  model (`gpt-oss-20b`, `Qwen3-Coder-30B-A3B-Instruct`, `whisper-large-v3`) and
  are inference; `Public Cloud Snapshots` lines are infra; ignore the
  `Use of your Voucher account` lines (they net each line to zero). Invoices
  issued on the 1st cover the previous month's service period.

## Verified — 2026-09-06 (invoice PDFs)

- List and download bills from the signed-in manager tab without the
  bill-detail API permission:

  ```
  fetch('/engine/apiv6/me/bill?date.from=2026-01-01&date.to=2026-09-06', {credentials: 'include'})
  fetch('/engine/apiv6/me/bill/<billId>', {credentials: 'include'})
  ```

  The bill object carries `date`, `priceWithoutTax`, `priceWithTax`, and a
  signed `pdfUrl` that `curl` downloads without cookies.
- OVH issues one bill per Public Cloud project on the 1st (two per month
  since March 2026), each covering the previous month. Voucher-funded bills
  print `Invoice total ex. VAT €0.00`; the real usage is the `SUB-TOTAL` line
  before `Use of your Voucher`. The ledger's EUR month totals equal those
  subtotals exactly.
- Archive: every 2026 bill (`IE1971296` … `IE2153030`) is in the accounting
  Drive under `2026/<MM Month>/Invoices` as
  `YYYY-MM-DD__OVHcloud__IE<id>.pdf` (invoice date).

Known traps:

- OVH API requests require signed headers using the application key, application secret, consumer key, method, URL, body, and OVH server timestamp.
- Startup credit burn appears as `USE` movements in the `STARTUP_PROGRAM` credit balance.
- `USE` movement amounts are negative; negate them to get positive credit burn.
- `USE` movements are dated when OVH debits the credit balance, usually on the invoice date. Attribute the usage to the previous calendar month when the movement is the monthly bill debit.
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
