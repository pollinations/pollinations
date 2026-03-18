ALTER TABLE `user` ADD `trust_score` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `score` real;--> statement-breakpoint
ALTER TABLE `user` ADD `score_checked_at` integer;--> statement-breakpoint
UPDATE `user` SET `trust_score` = 100 WHERE `tier` IN ('spore', 'seed', 'flower', 'nectar', 'router') AND `trust_score` IS NULL;--> statement-breakpoint
UPDATE `user` SET `trust_score` = 0 WHERE `tier` = 'microbe' AND `trust_score` IS NULL;
