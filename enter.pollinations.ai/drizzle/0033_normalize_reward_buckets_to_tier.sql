-- Quest rewards all credit the tier bucket. Rows earned under the old quest
-- definitions (and the community-issue backfill in 0029) were written with
-- balance_bucket = 'pack', which makes the UI show the paid icon and would
-- credit the paid balance on claim. No quest is 'pack' anymore and the quest
-- evaluator is the only writer, so any non-tier reward is stale — normalize.
UPDATE `rewards` SET `balance_bucket` = 'tier' WHERE `balance_bucket` <> 'tier';
