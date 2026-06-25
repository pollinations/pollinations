-- Data-only fix: normalize reward timestamps to Unix SECONDS.
--
-- `mode:"timestamp"` columns store seconds across the whole schema. Two rows of
-- bad data ended up in milliseconds:
--   1. earned_at on every reward — recordRewards() never set earnedAt, so it
--      fell through to the column's default expression, which emits ms.
--   2. claimed_at on the 5 backfilled community-issue rewards — migration 0029
--      copied a millisecond created_at straight into a seconds column.
--
-- A value > 1e11 (~year 5138 in seconds) is unambiguously milliseconds, so the
-- guard makes this migration safe to re-run and skips already-correct rows.
UPDATE rewards SET earned_at = earned_at / 1000 WHERE earned_at > 100000000000;
--> statement-breakpoint
UPDATE rewards SET claimed_at = claimed_at / 1000 WHERE claimed_at > 100000000000;
