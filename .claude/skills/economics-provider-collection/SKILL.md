---
name: economics-provider-collection
description: Collect and reconcile Pollinations Economics vendor balances, monthly usage, invoices, and provider evidence using the best available API, CLI, MCP, or authenticated dashboard.
---

# Economics provider collection

Use this skill when the user asks to refresh vendor data, inspect provider
accounts, prepare a monthly close, or reconcile provider cost with Pollen.

## Source of truth

Read `operations/economics/provider-registry.json` first.

- The registry owns canonical vendor IDs, aliases, account lifecycles,
  active monthly-review status, balance-tracking decisions, access URLs, and
  workspace domains.
- Active vendors have `monthlyReview: true`. Refresh only those during a normal
  monthly run.
- Inactive vendors remain visible for history. Inspect them only when the user
  asks or when they are deliberately reactivated.
- Never infer aliases, accounts, models, or funding from similar names.

Then read only the requested vendor guide in
`references/providers/<connector>.md`. The registry's `connector` field gives
the filename. Dots in vendor IDs use dashes when the registry says so.

## Collection order

Choose the first source that supplies authoritative, sufficiently granular
data:

1. Supported provider API.
2. Supported CLI.
3. Available MCP or authenticated connector.
4. Provider dashboard.

Do not build a permanent provider integration for a bounded monthly task. Run
the documented command or use the dashboard directly.

For dashboard collection, group registry access targets by `workspace`. Open
all URLs for one workspace together, verify that the matching browser profile
is signed in, finish that group, then move to the next workspace. Never copy
browser cookies, passwords, session tokens, or credential-reveal URLs.

Use only existing authorized credentials. Creating, rotating, synchronizing,
or deploying a credential is outside collection and requires the repository's
separate secret-mutation plan and explicit scoped approval.

## Monthly result

For each active vendor and each active account, collect:

- the current cash/prepaid and promotional-credit balance when
  `balanceTracking` is true;
- the last completed UTC calendar month's usage at the deepest source-backed
  grain available: model, GPU instance/workload, service/SKU, then provider
  total;
- the invoice, statement, receipt, or provider export that proves the billed
  obligation or confirms that no payment was due.

Keep provider usage, provider balance, and bank payment as separate facts. A
top-up is not usage. An invoice date is not automatically the usage month. A
balance snapshot is current state, not historical burn.

If model or GPU detail is unavailable, preserve the exact provider total and
state the missing granularity. Never allocate a total using an internal model
name or an undocumented ratio.

## Evidence and ledgers

- Archive new invoices and raw provider exports in the accounting Google Drive
  before linking them to the ledger.
- `economics_compute_ledger` stores provider balances and usage facts.
- `economics_bank_ledger` stores Wise-backed cash movements and their evidence.
- `economics_pollen_usage` stores internal Paid and Quest consumption. Reconcile
  it at provider-month grain; provider model labels are display detail only.
- Reuse the original deterministic `entry_id` when correcting a fact. Never
  create a second identity for the same fact.
- Treat the current month as partial.

Keep ledger writes task-scoped; do not add permanent ingest code. Before a
write, query the effective datasource, save and verify a complete local backup,
and show the exact proposed rows and totals. Existing `entry_id` corrections
must include the current base version, use a later `recorded_at`, and preserve
immutable identity fields. Append only after explicit approval for the named
batch and environment, then re-query every written ID and save a verified
after-snapshot. Validate staging first; production requires separate approval.

## Completion

A provider-month is complete only when account coverage, provider usage, and
required invoice/statement evidence are all accounted for. Report missing
sources directly; do not hide them with estimates or fallbacks.
