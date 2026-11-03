-- Static sites at <name>.pollinations.app. The name is the script's name in
-- the sites dispatch namespace; the row records its owner.
CREATE TABLE `site` (
    `name` text PRIMARY KEY NOT NULL,
    `user_id` text REFERENCES `user`(`id`) ON DELETE set null,
    `created_at` integer NOT NULL,
    `published_at` integer,
    `blocked_at` integer
);
CREATE INDEX `site_user_id_idx` ON `site` (`user_id`);
