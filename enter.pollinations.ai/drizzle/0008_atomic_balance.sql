-- Add balance column to user table (INTEGER for micro-pollen precision)
-- Default: 10 pollen = 10,000,000 micro-pollen
ALTER TABLE `user` ADD `balance` integer DEFAULT 10000000 NOT NULL;
