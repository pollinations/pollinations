# OVHcloud Connector Guide

Canonical vendor: `ovhcloud`

## Verified — 2026-07-10

- Status: signed OVH credit API works end to end.
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
