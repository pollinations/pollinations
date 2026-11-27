-- NULL is eligible for automatic detection; 0 preserves a purchase/manual clear.
-- Existing domain restrictions require a separate one-time operator backfill.
ALTER TABLE user ADD COLUMN quest_pollen_restricted INTEGER CHECK (quest_pollen_restricted IN (0, 1));
-- Restriction sweeps read only accounts made since a sign-up burst began.
CREATE INDEX idx_user_created_at ON user (created_at);
