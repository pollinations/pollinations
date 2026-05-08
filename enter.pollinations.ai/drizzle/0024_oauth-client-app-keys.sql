CREATE TABLE `oauthClient` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer DEFAULT false,
	`enable_end_session` integer DEFAULT false,
	`subject_type` text,
	`scopes` text,
	`user_id` text,
	`reference_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`token_endpoint_auth_method` text DEFAULT 'none',
	`grant_types` text,
	`response_types` text,
	`public` integer DEFAULT true,
	`type` text,
	`require_pkce` integer DEFAULT true,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClient_client_id_unique` ON `oauthClient` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_oauth_client_user_id` ON `oauthClient` (`user_id`);--> statement-breakpoint
ALTER TABLE `apikey` ADD `oauth_client_id` text;--> statement-breakpoint
CREATE INDEX `idx_apikey_oauth_client_id` ON `apikey` (`oauth_client_id`);--> statement-breakpoint
INSERT INTO `oauthClient` (
	`id`,
	`client_id`,
	`client_secret`,
	`disabled`,
	`skip_consent`,
	`enable_end_session`,
	`scopes`,
	`user_id`,
	`created_at`,
	`updated_at`,
	`name`,
	`redirect_uris`,
	`token_endpoint_auth_method`,
	`grant_types`,
	`response_types`,
	`public`,
	`type`,
	`require_pkce`,
	`metadata`
)
SELECT
	'oauth_' || `id`,
	json_extract(`metadata`, '$.plaintextKey'),
	NULL,
	COALESCE(`enabled`, 1) = 0,
	false,
	false,
	'["profile","usage"]',
	`user_id`,
	`created_at`,
	`updated_at`,
	`name`,
	CASE
		WHEN json_type(`metadata`, '$.redirectUris') = 'array'
			THEN json_extract(`metadata`, '$.redirectUris')
		ELSE '[]'
	END,
	'none',
	'["authorization_code"]',
	'["code"]',
	true,
	'web',
	true,
	json_object(
		'earningsEnabled', CASE
			WHEN json_extract(`metadata`, '$.earningsEnabled') = 1 THEN json('true')
			ELSE json('false')
		END,
		'description', json_extract(`metadata`, '$.description'),
		'migratedFromApiKeyId', `id`,
		'legacyClientId', json_extract(`metadata`, '$.plaintextKey')
	)
FROM `apikey`
WHERE `prefix` = 'pk'
  AND json_valid(`metadata`)
  AND json_extract(`metadata`, '$.plaintextKey') IS NOT NULL
  AND (
	json_extract(`metadata`, '$.earningsEnabled') = 1
	OR (
		json_type(`metadata`, '$.redirectUris') = 'array'
		AND json_array_length(`metadata`, '$.redirectUris') > 0
	)
  );
--> statement-breakpoint
UPDATE `apikey`
SET `oauth_client_id` = 'oauth_' || `byop_client_key_id`
WHERE `byop_client_key_id` IS NOT NULL
  AND EXISTS (
	SELECT 1
	FROM `oauthClient`
	WHERE `oauthClient`.`id` = 'oauth_' || `apikey`.`byop_client_key_id`
  );
--> statement-breakpoint
DELETE FROM `apikey`
WHERE `prefix` = 'pk'
  AND json_valid(`metadata`)
  AND json_extract(`metadata`, '$.plaintextKey') IS NOT NULL
  AND EXISTS (
	SELECT 1
	FROM `oauthClient`
	WHERE `oauthClient`.`id` = 'oauth_' || `apikey`.`id`
  );
