DROP INDEX `idx_event_processing_status`;--> statement-breakpoint
DROP INDEX `idx_event_created_at`;--> statement-breakpoint
DROP INDEX `idx_event_status_created_at`;--> statement-breakpoint
DROP INDEX `idx_event_user_billed_created`;--> statement-breakpoint
CREATE INDEX `idx_event_processing_id` ON `event` (`event_processing_id`);--> statement-breakpoint
CREATE INDEX `idx_event_status_created` ON `event` (`event_status`,`created_at`);