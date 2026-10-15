-- When we sent the user the running-low email. Crediting a pack clears it,
-- so the email goes out once per pack.
ALTER TABLE `user` ADD `low_balance_notified_at` integer;

-- When the user unsubscribed through the link in our emails. We send them
-- no more emails.
ALTER TABLE `user` ADD `email_unsubscribed_at` integer;
