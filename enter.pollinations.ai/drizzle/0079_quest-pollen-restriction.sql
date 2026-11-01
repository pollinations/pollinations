-- NULL is eligible for automatic detection; 0 preserves a purchase/manual clear.
-- Existing domain restrictions are applied by scripts/backfill-quest-restrictions.ts.
ALTER TABLE user ADD COLUMN quest_pollen_restricted INTEGER CHECK (quest_pollen_restricted IN (0, 1));
