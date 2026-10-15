-- When we last sent a user the running-low email. Limits it to one per 30
-- days.
ALTER TABLE `user` ADD `low_balance_notified_at` integer;

-- When the user unsubscribed through the link in our emails. We send them
-- no more emails.
ALTER TABLE `user` ADD `email_unsubscribed_at` integer;
