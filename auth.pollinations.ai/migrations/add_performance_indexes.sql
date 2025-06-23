-- Performance optimization indexes for token validation
-- GitHub Issue: #2604

-- Add explicit index on api_tokens.token for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);

-- Add index on user_tiers.user_id for faster JOIN operations
CREATE INDEX IF NOT EXISTS idx_user_tiers_user_id ON user_tiers(user_id);

-- Note: users.github_user_id already has implicit index as PRIMARY KEY

-- Optimize query planner with latest statistics
PRAGMA optimize;
