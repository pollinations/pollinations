ALTER TABLE `pollen_gift_adjustment` RENAME TO `pollen_gift_payment_loss`;--> statement-breakpoint
DROP INDEX `idx_pollen_gift_adjustment_gift_id`;--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_payment_loss_gift_id` ON `pollen_gift_payment_loss` (`gift_id`);
