ALTER TABLE `community_endpoint` ADD `visibility` text DEFAULT 'private' NOT NULL;
--> statement-breakpoint
-- Rows that predate this column were all public (listed in /models, callable by
-- anyone). The column default makes new rows private; backfill the pre-existing
-- rows to public to preserve their behavior. Public models require positive base
-- text pricing, so replace legacy zero values with $0.0001 per 1M tokens
-- (0.0000000001 per token) while preserving every existing positive price.
UPDATE `community_endpoint`
SET
	`visibility` = 'public',
	`prompt_text_price` = CASE
		WHEN `prompt_text_price` > 0 THEN `prompt_text_price`
		ELSE 0.0000000001
	END,
	`completion_text_price` = CASE
		WHEN `completion_text_price` > 0 THEN `completion_text_price`
		ELSE 0.0000000001
	END;
