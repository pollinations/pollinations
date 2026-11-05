-- Who brought this user: the owner of the ?ref= invite link or of the app the
-- user signed up through. Set once, near signup; the Invite friends quest pays
-- the referrer when the user buys Pollen.
ALTER TABLE `user` ADD `referred_by` text REFERENCES `user`(`id`) ON DELETE set null;
CREATE INDEX `idx_user_referred_by` ON `user` (`referred_by`);
