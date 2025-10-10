-- Migration: Add tier column to user table
-- Date: 2025-10-07
-- Description: Add tier field with default 'seed' value and create index for performance

ALTER TABLE user ADD COLUMN tier TEXT DEFAULT 'seed' NOT NULL;

CREATE INDEX idx_user_tier ON user(tier);
