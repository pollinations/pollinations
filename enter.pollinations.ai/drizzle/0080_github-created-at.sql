-- When the linked GitHub account was created. A GitHub account at least 30
-- days old verifies an account whose onboarding rewards are on hold.
ALTER TABLE `user` ADD `github_created_at` integer;
