# Nebius billing via CLI/API

Validated: 2026-07-02 (against official docs + public API proto repo only — ⚠️ NOT yet run against our account; `nebius` CLI not installed locally).

## Requirements
- CLI: `nebius` — auth: `nebius iam get-access-token` (12h, federation/SSO) or service account + authorized key → JWT exchange (`tokens.iam.api.nebius.cloud:443`) for automation
- Billing exports are keyed to a billing **contract ID** — grab once from console.nebius.com/billing

## Known identifiers (our account)
- Startup grant (Myceli), amount not on file; account unused so far (0 traffic) → left = granted until traffic starts

## Querying spend and credits

### 1. Grant / credit balance — DOES NOT EXIST programmatically
The public API (github.com/nebius/api, `nebius/billing/`) has only `billing_report_exporter`, `one_time_export`, `calculator`, `offer_type` — no balance/credits/grants service. Official docs: grants/promocodes are activated and tracked in the **console only**.

### 2. Usage export — FOCUS 1.2 CSV (⚠️ UNVERIFIED against our account)
```bash
nebius billing v1alpha1 one-time-export create \
  --parent-id <contract-id> --start-period 2026-04 --end-period 2026-06 \
  --format EXPORT_FORMAT_FOCUS_1_2_CSV
nebius billing v1alpha1 one-time-export get --id <export-id>   # → presigned download URL
```
Continuous export to an Object Storage bucket also configurable (console Billing → Export). FOCUS 1.2 has a `Credit` charge category → once the grant starts burning, credit application per month should be derivable from exports.

## Question → query cheat sheet
| Question | Command |
|---|---|
| Grant total / remaining | console only (hand-enter; left = granted while unused) |
| Usage / credit burn | `one-time-export` FOCUS CSV → sum `Credit` rows |

## Known unknowns
- Billing contract ID; grant amount + expiry (console, one-time read).
- Whether FOCUS `Credit` rows appear as expected (v1alpha1 API — expect breaking changes).

Docs: https://docs.nebius.com/cli/reference/billing/v1alpha1/one-time-export · https://docs.nebius.com/signup-billing/usage/view · https://github.com/nebius/api/tree/main/nebius/billing/v1alpha1
