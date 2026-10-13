-- When we last emailed a user about their paid balance (running low or auto
-- top-up switched off). Limits those emails to one per 30 days.
ALTER TABLE `user` ADD `low_balance_notified_at` integer;

-- When the user unsubscribed through the link in our emails. We send them
-- no more emails.
ALTER TABLE `user` ADD `email_unsubscribed_at` integer;
