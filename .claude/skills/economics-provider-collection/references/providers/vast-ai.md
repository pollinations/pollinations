# Vast.ai Connector Guide

Canonical vendor: `vast` (historical alias: `vast.ai`)

## Verified — 2026-07-10

- Status: `vastai` billing API path works with the Economics key.
- Do not recursively sum every nested `amount`; invoice items and metadata can
  repeat monetary values. Use the top-level charge amount once.

Primary evidence sources:

- Invoice/payment: Vast.ai invoice PDF or billing receipt, often a transfer/top-up.
- Dashboard/usage: Vast.ai console billing and instance usage views.
- CLI: `vastai show invoices-v1 --charges --raw -s <YYYY-MM-DD> -e <YYYY-MM-DD> -l 100` for usage; repeat with `--invoices` for funding.
- Transaction context: `economics_bank_ledger` vendor `vast` (historically `vast.ai`), usually Wise EUR card charge.

Required credential: `VAST_API_KEY`.

Collection steps:

1. For invoice evidence, place the PDF or receipt in `<collection-dir>/evidence/`.
2. For usage evidence, prefer the paginated CLI raw export:

   ```bash
   vastai --api-key "$VAST_API_KEY" show invoices-v1 --charges --raw -s <period-start> -e <period-end> -l 100
   ```

   Save stdout to `<collection-dir>/evidence/vast-ai-<period>-charges-page-1.json`.
   Follow `next_token` with `--next-token` and the same date/type filters until
   it is empty. Query `--invoices` separately for balance funding or top-ups.
   `vastai show invoices --raw` still returns legacy detailed rows in CLI
   1.7.26, but it now warns that the command is deprecated. Retain it only
   when the v1 charge `items` need a cross-check.

   Query the exact UTC month (`-s YYYY-MM-01 -e <next-month>-01`) and verify
   every returned charge `start`/`end` lies within it. The v1 endpoint clips
   instance charges and their item amounts to the requested window; do not
   prorate those amounts again. Sum each top-level `amount` once to check the
   provider total, and check that its item amounts sum to that top-level amount
   before writing rows by charge kind.

   Preserve one reviewed row per billed instance and charge kind. When replacing
   legacy instance rows, compare against a current effective
   `economics_vendor_ledger` snapshot so every old entry ID is neutralized and
   require the detailed rows to equal the provider month total before publication.
   Verified instance-to-workload mappings come from
   `vast-ai-workloads.json`; update that registry when the GPU fleet changes.

3. If using dashboard screenshots, save them under `<collection-dir>/evidence/`.
4. For the current balance, run `vastai show user --raw` with the existing
   authorized account and verify the team ID and Myceli email alias. `credit`
   is the team prepaid balance; keep `balance_referrals` separate. The raw user
   response also contains unrelated account details, so archive a focused
   extract with the checked time, account identity, balance fields, and a hash
   of the private raw response. Keep expiry blank until its terms are verified.
   Historical team ID `396700` is the registry's `myceli` account (verified
   through `show user` on 2026-10-15). Preserve source account IDs and resolve
   only explicitly verified aliases; do not request the same usage again
   because an export uses the numeric team ID.
5. Use this skill for saved raw evidence.

Known traps:

- The invoice may be a balance transfer or charged top-up, not exact usage.
- Wise charges may be EUR while the invoice or Vast usage is USD.
- Vast.ai CLI invoice rows can be posting-time rollups. A charge may cover usage before its posting date.
- The legacy `show invoices` rows use posting timestamps and can include hours
  outside the queried month. Use v1's clipped charges for calendar-month
  attribution; retain legacy rows only as a cross-check.
- For a v1 instance described as `Charges - 1 day`, the provider can report
  identical midnight `start` and `end` values despite positive billed hours.
  Represent its reviewed item rows as that UTC day bucket with an exclusive
  next-midnight end; retain the raw equal timestamps and billed hours in the
  archived source. This bucket does not assert an exact instance lifetime.
- Upload/download quantities are network units, not hours. Use their v1 item
  amounts within the same exact month query.
- Always pass explicit `-s` and `-e`; the CLI can otherwise default to too narrow a window.
