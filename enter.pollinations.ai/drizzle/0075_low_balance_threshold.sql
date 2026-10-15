-- The paid balance below which a user without auto top-up gets the
-- low-balance email: 20% of their last pack, set when a pack is credited.
ALTER TABLE `user` ADD `low_balance_threshold` real;

-- Existing buyers start from their last purchase: a checkout or a paid auto
-- top-up. Gen emails only on the charge that takes the balance below it, so
-- users already below get no email.
-- Checkout created_at holds seconds on old rows and milliseconds on new ones.
-- The + before status keeps SQLite on the user_id index; with the status index
-- the backfill read 11M rows and took 8.6 s on production.
UPDATE `user` SET `low_balance_threshold` = ROUND(0.2 * (
    SELECT `pollen` FROM (
        SELECT `pollen_credited` AS `pollen`,
            CASE WHEN `created_at` < 100000000000 THEN `created_at` * 1000 ELSE `created_at` END AS `at`
        FROM `stripe_checkout_credits`
        WHERE `user_id` = `user`.`id`
        UNION ALL
        SELECT `amount_usd`, `completed_at`
        FROM `stripe_auto_top_up_attempt`
        WHERE `user_id` = `user`.`id` AND +`status` = 'paid'
    )
    ORDER BY `at` DESC
    LIMIT 1
), 8)
WHERE `id` IN (SELECT `user_id` FROM `stripe_checkout_credits`)
    OR `id` IN (SELECT `user_id` FROM `stripe_auto_top_up_attempt` WHERE `status` = 'paid');
