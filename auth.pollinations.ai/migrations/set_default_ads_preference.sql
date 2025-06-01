-- Migration to set ads: true for all users who don't have it defined yet
-- This ensures all users have ads enabled by default

-- Update users where preferences doesn't have a 'ads' key or it's NULL
UPDATE users 
SET preferences = json_set(
  CASE 
    -- If preferences is NULL or not valid JSON, start with empty object
    WHEN preferences IS NULL OR json_valid(preferences) = 0 THEN '{}'
    ELSE preferences
  END, 
  '$.ads', 
  -- Only set ads:true if it doesn't already exist
  CASE
    WHEN json_extract(preferences, '$.ads') IS NULL THEN 1
    ELSE json_extract(preferences, '$.ads')
  END
);

-- Create index for ads preference if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_preferences_ads ON users(json_extract(preferences, '$.ads'));
