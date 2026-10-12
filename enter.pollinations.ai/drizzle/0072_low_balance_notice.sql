-- When we last emailed a user about their paid balance (running low or auto
-- top-up switched off). Limits those emails to one per 30 days.
ALTER TABLE `user` ADD `low_balance_notified_at` integer;
