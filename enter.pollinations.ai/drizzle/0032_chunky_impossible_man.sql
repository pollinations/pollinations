-- No-op: superseded by staging migration 0029_gray_eternity.
--
-- This branch and staging independently added the same reward_grants +
-- github_quest_issues feature (with the quest_payout_credits backfill). After
-- the staging merge, staging's 0029_gray_eternity already creates both tables,
-- runs the backfill, and drops quest_payout_credits — so replaying that work
-- here would fail with "table already exists" / "no such table". The downstream
-- migrations (0033_reshape_reward_grants … 0036) reshape the reward_grants that
-- 0029 created into the final `rewards` table and remain necessary.
SELECT 1;
