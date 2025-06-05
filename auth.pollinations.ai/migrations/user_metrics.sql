-- Add metrics column to users table for storing backend-only analytics data
-- Metrics are stored as JSON text and can only be updated by backend/admin
-- This is separate from preferences to prevent users from modifying their own analytics
ALTER TABLE users ADD COLUMN metrics TEXT DEFAULT '{}';

-- Create index on metrics for efficient queries
-- This helps with queries like WHERE json_extract(metrics, '$.ad_clicks') > 10
CREATE INDEX IF NOT EXISTS idx_users_metrics ON users(json_extract(metrics, '$.ad_clicks'));

-- Create a trigger to ensure metrics always defaults to '{}' for new users
DROP TRIGGER IF EXISTS set_default_metrics;

CREATE TRIGGER set_default_metrics
AFTER INSERT ON users
WHEN NEW.metrics IS NULL OR NEW.metrics = ''
BEGIN
    UPDATE users
    SET metrics = '{}'
    WHERE github_user_id = NEW.github_user_id;
END;
