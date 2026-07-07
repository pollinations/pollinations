ALTER TABLE `community_endpoint` ADD `visibility` text DEFAULT 'private' NOT NULL;
--> statement-breakpoint
-- Rows that predate this column were all public (listed in /models, callable by
-- anyone). The column default makes new rows private; backfill the pre-existing
-- rows to public to preserve their behavior. Runs once, when the column is added.
UPDATE `community_endpoint` SET `visibility` = 'public';
