-- When we sent the user the running-low email. Crediting a pack clears it,
-- so the email goes out once per pack.
ALTER TABLE `user` ADD `low_balance_notified_at` integer;

-- When the user unsubscribed through the link in our emails. We send them
-- no more emails.
ALTER TABLE `user` ADD `email_unsubscribed_at` integer;

-- The Pollen of the user's last pack: a checkout or a paid auto top-up, set
-- each time a pack is credited. The running-low email fires below a share of
-- it, and the wallet preselects it.
ALTER TABLE `user` ADD `last_pack_pollen` real;

-- Existing buyers start from their last purchase. Gen emails only on the
-- charge that takes the balance below the share, so users already below get
-- no email.
-- The + before status keeps SQLite on the user_id index; with the status index
-- the backfill read 11M rows and took 8.6 s on production.
UPDATE `user` SET `last_pack_pollen` = (
    SELECT `pollen` FROM (
        SELECT `pollen_credited` AS `pollen`, `created_at` AS `at`
        FROM `stripe_checkout_credits`
        WHERE `user_id` = `user`.`id`
        UNION ALL
        SELECT `amount_usd`, `completed_at`
        FROM `stripe_auto_top_up_attempt`
        WHERE `user_id` = `user`.`id` AND +`status` = 'paid'
    )
    ORDER BY `at` DESC
    LIMIT 1
)
WHERE `id` IN (SELECT `user_id` FROM `stripe_checkout_credits`)
    OR `id` IN (SELECT `user_id` FROM `stripe_auto_top_up_attempt` WHERE `status` = 'paid');
