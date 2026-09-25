ALTER TABLE `community_endpoint` RENAME COLUMN "disabled_at" TO "hidden_at";--> statement-breakpoint
ALTER TABLE `community_endpoint` RENAME COLUMN "disabled_reason" TO "hidden_reason";--> statement-breakpoint
ALTER TABLE `community_endpoint` RENAME COLUMN "disabled_by" TO "hidden_by";