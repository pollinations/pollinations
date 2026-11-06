-- Cache off (gen's generation-cache.ts): requests by this account, or by this
-- key, never get a shared cached result and never add theirs to the shared
-- cache. Off on the account turns it off for every key.
ALTER TABLE `user` ADD `cache_disabled` integer DEFAULT false NOT NULL;
ALTER TABLE `apikey` ADD `cache_disabled` integer DEFAULT false NOT NULL;
