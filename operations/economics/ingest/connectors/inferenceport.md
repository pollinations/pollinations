# InferencePort Connector Guide

Canonical vendor: `inferenceport`

## Verified — 2026-08-21

- Status: no supported billing or historical-usage API was found.
- OP Pollen contains internal model usage. The provider dashboard is required
  for independent monthly cost or credit evidence.

Collection steps:

1. Select the exact UTC calendar month in the authenticated dashboard.
2. Record total cost, requests, model detail, and funding source when shown.
3. Download an export or save screenshots and preserve them in
   `data/inbox/inferenceport/` and Google Drive.
4. Reconcile the provider total against OP Pollen without forcing equality when
   the provider exposes less granularity.

Known traps:

- Internal Pollen rows are not an independent provider statement.
- Leave provider cost unknown when the dashboard has no trustworthy amount.
