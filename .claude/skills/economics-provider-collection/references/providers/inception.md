# Inception Connector Guide

Canonical vendor: `inception`

## Verified — 2026-08-21

- Status: no supported billing or usage API was found; collect from the
  authenticated provider dashboard.
- Pollinations used Inception directly from 2026-06-23 through 2026-07-27.
  Mercury traffic moved to OpenRouter during 2026-07-27; direct usage is zero
  from 2026-07-28 onward.
- The account uses monthly `Pay As You Go` billing. Keep estimated amounts due,
  completed usage, and settled payments separate in the ledger.

Official references:

- https://docs.inceptionlabs.ai/get-started/get-started
- https://api.inceptionlabs.ai/openapi.json

Collection steps:

1. In the Inception dashboard, collect usage and cost for 2026-06-23 through
   2026-06-30 and 2026-07-01 through 2026-07-27.
2. Save the most granular model/request export or screenshots available.
3. Check 2026-07-28 onward separately and record zero or any unexpected usage.
4. Record whether usage was free-tier, prepaid, or cash-billed; never infer the
   funding source from OP Pollen.
5. Preserve evidence in `data/inbox/inception/` and Google Drive.
6. Reconcile only the direct period against `inception/mercury` OP Pollen rows.
   Reconcile later Mercury traffic under OpenRouter.

Captured evidence:

- https://drive.google.com/file/d/1E4HCmKeHNCbDOLyBKpZyw3sREumhbNIf/view?usp=drivesdk
- https://drive.google.com/file/d/1fMiubBFvBtzLG4pBIGL_i0iQcquChVb_/view?usp=drivesdk
- https://drive.google.com/file/d/1upcqX3kGUNmPWieSNMIttFSace_OW6vN/view?usp=drivesdk

Known traps:

- Do not relabel historical direct Inception traffic as OpenRouter.
- A runtime API key proves inference access, not account billing totals.
