-- Apps people build on Pollinations. An app with an approval date is listed in
-- the public catalog; without one it is private.
CREATE TABLE `app` (
    `id` text PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `emoji` text NOT NULL,
    `description` text NOT NULL,
    `category` text NOT NULL,
    `platform` text NOT NULL,
    `language` text,
    `url` text,
    `repository_url` text,
    `screenshot_url` text,
    `github_user_id` integer,
    `github_username` text,
    `discord_username` text,
    `submitted_date` text,
    `issue_url` text,
    `approved_date` text
);
