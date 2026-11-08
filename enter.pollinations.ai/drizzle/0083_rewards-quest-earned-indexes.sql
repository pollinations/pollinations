-- Supporter checks (top-up quest ids) and monthly standings (earned this
-- month) scanned every reward on each standings view.
CREATE INDEX `idx_rewards_quest_user` ON `rewards` (`quest_id`, `user_id`);
CREATE INDEX `idx_rewards_earned_at` ON `rewards` (`earned_at`);
