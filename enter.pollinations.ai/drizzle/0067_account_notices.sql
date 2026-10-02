ALTER TABLE `user` ADD `low_balance_notified_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `payment_required_notified_at` integer;--> statement-breakpoint
-- Buyers already below 20% of their last pack count as notified, so the first
-- cron run warns only on drops that happen after this release.
UPDATE `user` SET `low_balance_notified_at` = cast((julianday('now') - 2440587.5)*86400000 as integer)
WHERE COALESCE(`pack_balance`, 0) < 0.2 * (
	SELECT `pollen_credited` FROM `stripe_checkout_credits` c
	WHERE c.`user_id` = `user`.`id`
	ORDER BY CASE WHEN c.`created_at` < 100000000000 THEN c.`created_at` * 1000 ELSE c.`created_at` END DESC
	LIMIT 1
);
