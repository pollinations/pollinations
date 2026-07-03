# Modal billing via CLI

Validated: 2026-07-02 (against official docs only — ⚠️ NOT yet run against our workspace; `modal` CLI not installed locally, no token wired).

## Requirements
- CLI: `modal` (`pip install modal`), auth via `modal token new` (or token-id/secret env vars)
- Programmatic billing APIs are gated to **Team and Enterprise plans** — check which plan the credit-grant workspace is on before wiring
- There is NO documented public REST API; `api.modal.com` is the SDK/CLI gRPC backend

## Known identifiers (our account)
- Credit grant under "Pollinations AI" (startup credits program); amount not on file → read once from dashboard (Settings → Usage & Billing)

## Querying spend and credits

### 1. Workspace spend — `modal billing report` (⚠️ UNVERIFIED against our workspace)
```bash
modal billing report --for "this month" --json
modal billing report --start 2026-06-01 --end 2026-07-01 --csv --show-resources
modal environment billing        # per-environment usage
```
Python: `modal.billing.workspace_billing_report(start=..., end=None, resolution="d", tag_names=None)`.

### 2. Credit balance — DOES NOT EXIST programmatically
No CLI subcommand, no SDK function, no REST endpoint exposes credit balance / remaining credits. Web dashboard only.

## Credit / discount handling
- Billing reports "show a cost breakdown **before** factoring in credits or reservations" (official guide) — so `left ≈ granted − Σ modal billing report` is an approximation (pre-credit pricing, no invoice adjustments). Exact "left" = dashboard.

## Question → query cheat sheet
| Question | Command |
|---|---|
| MTD spend | `modal billing report --for "this month" --json` |
| Credit remaining | dashboard only (derive: granted − cumulative spend) |

## Known unknowns
- Plan tier of our workspace (Team+ required for billing CLI).
- Grant amount (read once from dashboard).

Docs: https://modal.com/docs/reference/cli/billing · https://modal.com/docs/guide/billing · https://modal.com/docs/reference/modal.billing
