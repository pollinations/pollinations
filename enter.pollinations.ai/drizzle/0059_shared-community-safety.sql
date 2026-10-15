ALTER TABLE `community_endpoint` ADD `required_safety_features` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Staging revisions briefly stored this shared policy inside type-specific
-- payloads. Preserve those selections, then return payloads to their declared
-- per-type shapes.
UPDATE `community_endpoint`
   SET `required_safety_features` = json_extract(`payload`, '$.requiredSafetyFeatures')
 WHERE json_type(`payload`, '$.requiredSafetyFeatures') = 'array';--> statement-breakpoint
UPDATE `community_endpoint`
   SET `payload` = json_remove(`payload`, '$.requiredSafetyFeatures')
 WHERE json_type(`payload`, '$.requiredSafetyFeatures') IS NOT NULL;--> statement-breakpoint
UPDATE `community_endpoint`
   SET `pending_payload` = json_remove(`pending_payload`, '$.requiredSafetyFeatures')
 WHERE json_type(`pending_payload`, '$.requiredSafetyFeatures') IS NOT NULL;
