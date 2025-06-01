-- Migration to update all empty preferences objects to have ads: true
-- This ensures all users with empty preferences have ads enabled

-- Update users where preferences is exactly '{}'
UPDATE users 
SET preferences = '{"ads": true}'
WHERE preferences = '{}';

-- Also update any NULL preferences to be {"ads": true}
UPDATE users
SET preferences = '{"ads": true}'
WHERE preferences IS NULL;

-- Add index for ads preference if it doesn't exist already
CREATE INDEX IF NOT EXISTS idx_users_preferences_ads ON users(json_extract(preferences, '$.ads'));
