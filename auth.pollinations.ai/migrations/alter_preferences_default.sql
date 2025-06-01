-- This migration modifies the default value for the preferences column
-- without recreating the table, preserving foreign key relationships

-- First, let's ensure all existing users have the proper preferences
UPDATE users 
SET preferences = '{"ads": true}'
WHERE preferences = '{}' OR preferences IS NULL;

-- For SQLite, we can't directly alter the default value of a column
-- We need to use a trigger instead to set default values for new users

-- First, drop the trigger if it already exists
DROP TRIGGER IF EXISTS set_default_preferences;

-- Create a trigger that sets the default preferences for new users
CREATE TRIGGER set_default_preferences
AFTER INSERT ON users
WHEN NEW.preferences IS NULL OR NEW.preferences = '{}'
BEGIN
    UPDATE users
    SET preferences = '{"ads": true}'
    WHERE github_user_id = NEW.github_user_id;
END;

-- Add index for ads preference if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_preferences_ads ON users(json_extract(preferences, '$.ads'));
