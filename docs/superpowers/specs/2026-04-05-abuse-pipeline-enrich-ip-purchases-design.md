# Abuse Pipeline: Ledger + Purchase + IP Enrichment

Replace the stateless CSV chain with a persistent ledger, fix the paid-user
check, and add cohort-scoped IP clustering.

## Problem

1. **No memory between runs.** CSVs are overwritten each run. LLM failures,
   previous flags, and review promotions all vanish.
2. **Silent scan failures.** Failed LLM chunks produce `score=0` —
   indistinguishable from "clean."
3. **Broken paid-user protection.** `pack_pollen > 0` means "spent pack
   balance," not "bought a pack." Real purchases are in `stripe_event`.
4. **No IP signal.** `ip_hash` and `ip_subnet` are logged on every request
   but never used for abuse detection.
5. **Doc drift.** README is stale.

## Pipeline

```
scan → enrich → review → apply
```

All steps read/write a single ledger. Same order as today.

## The Ledger (`spore-abuse-ledger.csv`)

One row per user. Latest state only. Not a history database.

Location: `src/tier-progression/spore-abuse-ledger.csv`

Use `csv-parse` / `csv-stringify` instead of the hand-rolled parsers.

### Columns

| Column | Set by | Description |
|--------|--------|-------------|
| `id` | scan | D1 user ID |
| `email` | scan | User email |
| `github_username` | scan | GitHub username |
| `tier` | scan/apply | Current tier (updated by apply on downgrade) |
| `created_at_ts` | scan | Unix epoch seconds (signup time) |
| `scan_run_id` | scan | ISO timestamp of the run that last scanned this user |
| `last_scanned_at` | scan | ISO timestamp of last scan |
| `scan_status` | scan | `scored` or `error` or empty |
| `scan_score` | scan | 0-100 (only when `scan_status = scored`) |
| `scan_signals` | scan | e.g. `cluster; burst` |
| `scan_action` | scan | `block`, `review`, `ok` (only when scored) |
| `enriched_at` | enrich | ISO timestamp of last enrichment |
| `has_paid_purchase` | enrich | 0/1 from `stripe_event` |
| `request_count` | enrich | Total API requests |
| `error_rate_pct` | enrich | Error rate percentage |
| `shared_flagged_ip_hash_users_in_scan` | enrich | Flagged unpaid peers sharing exact IP (same run) |
| `shared_flagged_subnet_users_in_scan` | enrich | Flagged unpaid peers sharing subnet (same run) |
| `review_action` | review | `block`, `review`, `skip`, `ok` |
| `review_reason` | review | e.g. `paid_purchase`, `shared_ip`, `hammering` |
| `last_applied_at` | apply | ISO timestamp of last downgrade |
| `manual_action` | human | Override: `block`, `skip`, or empty. Never touched by pipeline. |
| `manual_note` | human | Free-text. Never touched by pipeline. |

### Behavior

- **Upsert by `id`**: each step reads, updates matching rows, appends new
  users, writes back.
- **One row per user, latest state only.** Columns get overwritten on each
  run. No history tracking.
- **Run scoping**: enrich/review/apply default to the latest `scan_run_id`
  found in the ledger.

## Scan

Upsert current spore users from D1 into the ledger. Run LLM scoring as
today (no changes to chunking, overlapping, thresholds).

Changes:
- Write to ledger instead of `report.csv`
- Generate `scan_run_id` (ISO timestamp of run start)
- On LLM API failure: set `scan_status = error`, leave `scan_score` and
  `scan_action` empty (instead of `score=0`)
- On success: set `scan_status = scored`
- Add `created_at_ts` (unix epoch) alongside the existing human-formatted
  date
- New users from D1 get appended; existing rows get scan columns updated
- Restored users (microbe → spore manually) re-enter naturally since scan
  fetches live spore users from D1

## Enrich

Process users where `scan_run_id` = latest run AND `scan_status = scored`.

### Query 1: Consumption

```sql
SELECT user_id as lookup_key,
    COUNT(*) as request_count,
    round(countIf(response_status >= 400) / COUNT(*) * 100, 1) as error_rate_pct
FROM generation_event
WHERE user_id IN (...)
GROUP BY user_id
FORMAT JSON
```

### Query 2: Purchases

```sql
SELECT user_id, count(*) as purchase_count
FROM stripe_event
WHERE user_id IN (...)
  AND event_type IN (
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded')
  AND payment_status = 'paid'
  AND livemode = 1
GROUP BY user_id
FORMAT JSON
```

`has_paid_purchase = purchase_count > 0 ? 1 : 0`

### Query 3: IP data (72h early window)

```sql
SELECT user_id, ip_hash, ip_subnet
FROM generation_event
WHERE user_id IN (...)
  AND environment = 'production'
  AND (ip_hash != 'undefined' OR ip_subnet != 'undefined')
GROUP BY user_id, ip_hash, ip_subnet
FORMAT JSON
```

Scope to first 72h after signup using `created_at_ts`. Batch by similar
registration dates in SQL, filter precisely in TypeScript.

**In-memory IP computation:**

1. Build `ip_hash → Set<user_id>` and `ip_subnet → Set<user_id>` maps
   (current run only).
2. `flagged_set = { user_id | scan_action ∈ {block, review} AND
   has_paid_purchase = 0 }` — frozen at enrich time.
3. For each user, count distinct flagged peers sharing their IPs (union
   count — one peer sharing 3 IPs = 1 peer).
4. Write `shared_flagged_ip_hash_users_in_scan` and
   `shared_flagged_subnet_users_in_scan`.

Set `enriched_at` after success.

## Review

Process users where `scan_run_id` = latest run AND `scan_status = scored`.
Single pass, first match wins:

| # | Condition | Result | Reason |
|---|-----------|--------|--------|
| 0 | `manual_action` is set | use it | `manual` |
| 1 | `has_paid_purchase = 1` | → `skip` | `paid_purchase` |
| 2 | `scan_action = review` + `shared_flagged_ip_hash >= 2` | → `block` | `shared_ip` |
| 3 | `scan_action = review` + `error_rate > 80%` + `requests > 20` | → `block` | `hammering` |
| 4 | `scan_action = ok` + `shared_flagged_ip_hash >= 2` | → `review` | `shared_ip` |
| 5 | `scan_action = ok` + `shared_flagged_subnet >= 3` | → `review` | `shared_subnet` |
| 6 | otherwise | `scan_action` | — |

Non-recursive: flagged set was frozen at enrich time. `ok → review`
promotions don't cascade.

Replaces `pack_pollen > 0 → skip` with `has_paid_purchase = 1 → skip`.

## Apply

Process users where `scan_run_id` = latest run AND
`review_action = block` AND `last_applied_at` is empty.

D1 mutation with tier guard:
```sql
UPDATE user SET tier = 'microbe', tier_balance = 0
WHERE id = ? AND tier = 'spore'
```

If 0 rows affected: log warning, skip. Otherwise: set `last_applied_at`
and `tier = microbe` in ledger.

## README

- Replace `apply-abuse-blocks.ts` with 4-step pipeline
- Add enrich/review descriptions
- Fix `0.1` → `0` pollen
- Document ledger
- Remove stale references

## Risks

- **Ledger size**: ~10k users x 22 columns is < 5MB. D1 migration is the
  next step if it grows.
- **Concurrent runs**: manual and sequential. `scan_run_id` prevents
  cross-run contamination.
- **IP false positives**: cohort-scoped, flagged-peers-only, subnet as
  supporting signal, 72h window, manual override.
- **Restored users**: re-enter scan naturally via D1 spore query.

## Future: D1 migration

Columns and upsert semantics map directly to SQL. Migration:
1. Create `abuse_ledger` table in D1
2. Change steps to query/upsert D1 instead of CSV
3. Import existing ledger as seed data
