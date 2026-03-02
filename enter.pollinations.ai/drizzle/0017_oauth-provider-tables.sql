-- OAuth 2.1 Provider tables for @better-auth/oauth-provider + JWT plugins

CREATE TABLE IF NOT EXISTS `oauth_client` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL UNIQUE,
  `client_secret` text,
  `name` text,
  `icon` text,
  `uri` text,
  `contacts` text,
  `tos` text,
  `policy` text,
  `software_id` text,
  `software_version` text,
  `software_statement` text,
  `redirect_uris` text NOT NULL,
  `token_endpoint_auth_method` text,
  `grant_types` text,
  `response_types` text,
  `scopes` text,
  `type` text,
  `disabled` integer DEFAULT false,
  `skip_consent` integer DEFAULT false,
  `enable_end_session` integer DEFAULT false,
  `user_id` text REFERENCES `user`(`id`) ON DELETE CASCADE,
  `reference_id` text,
  `metadata` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_oauth_client_client_id` ON `oauth_client` (`client_id`);

CREATE TABLE IF NOT EXISTS `oauth_access_token` (
  `id` text PRIMARY KEY NOT NULL,
  `token` text NOT NULL,
  `client_id` text NOT NULL REFERENCES `oauth_client`(`id`) ON DELETE CASCADE,
  `user_id` text REFERENCES `user`(`id`) ON DELETE CASCADE,
  `session_id` text REFERENCES `session`(`id`) ON DELETE CASCADE,
  `refresh_id` text,
  `reference_id` text,
  `scopes` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_oauth_access_token_token` ON `oauth_access_token` (`token`);

CREATE TABLE IF NOT EXISTS `oauth_refresh_token` (
  `id` text PRIMARY KEY NOT NULL,
  `token` text NOT NULL,
  `client_id` text NOT NULL REFERENCES `oauth_client`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `session_id` text REFERENCES `session`(`id`) ON DELETE CASCADE,
  `reference_id` text,
  `scopes` text,
  `revoked` integer,
  `auth_time` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_oauth_refresh_token_token` ON `oauth_refresh_token` (`token`);

CREATE TABLE IF NOT EXISTS `oauth_consent` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `client_id` text NOT NULL REFERENCES `oauth_client`(`id`) ON DELETE CASCADE,
  `reference_id` text,
  `scopes` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_oauth_consent_user_client` ON `oauth_consent` (`user_id`, `client_id`);

CREATE TABLE IF NOT EXISTS `jwks` (
  `id` text PRIMARY KEY NOT NULL,
  `public_key` text NOT NULL,
  `private_key` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `expires_at` integer
);
