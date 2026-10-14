-- The paid balance below which a user without auto top-up gets the
-- low-balance email: 20% of their last pack, set when a pack is credited.
ALTER TABLE `user` ADD `low_balance_threshold` real;

-- Existing buyers start from their last checkout. Gen emails only on the
-- charge that takes the balance below it, so users already below get no email.
-- created_at holds seconds on old rows and milliseconds on new ones.
UPDATE `user` SET `low_balance_threshold` = ROUND(0.2 * (
    SELECT `pollen_credited` FROM `stripe_checkout_credits` c
    WHERE c.`user_id` = `user`.`id`
    ORDER BY CASE WHEN c.`created_at` < 100000000000 THEN c.`created_at` * 1000 ELSE c.`created_at` END DESC
    LIMIT 1
), 8)
WHERE `id` IN (SELECT `user_id` FROM `stripe_checkout_credits`);
