# Deferred Migrations

This folder contains migrations that have been intentionally deferred from automatic deployment.

## 0015_parallel_iceman.sql - DROP TABLE event

**Deferred on:** 2025-01-13
**Reason:** Keep the event table around as a safety net while transitioning to direct Tinybird sends.

**To apply this migration later:**
1. Move `0015_parallel_iceman.sql` back to `drizzle/`
2. Move `0015_snapshot.json` back to `drizzle/meta/`
3. Add the entry back to `drizzle/meta/_journal.json`:
```json
{
  "idx": 15,
  "version": "6",
  "when": 1768340210423,
  "tag": "0015_parallel_iceman",
  "breakpoints": true
}
```
4. Run `npm run migrate:production`
