-- Add preferences column to users table for storing arbitrary user preferences
-- Preferences are stored as JSON text
ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}';

-- Create index on preferences for JSON queries (SQLite 3.38.0+)
-- This helps with queries like WHERE json_extract(preferences, '$.show_ads') = false
CREATE INDEX IF NOT EXISTS idx_users_preferences_show_ads ON users(json_extract(preferences, '$.show_ads'));
