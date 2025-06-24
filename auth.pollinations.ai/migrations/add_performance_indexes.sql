-- Performance optimization indexes for token validation
-- GitHub Issue: #2604

-- Add explicit index on api_tokens.token for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);

-- Add index on user_tiers.user_id for faster JOIN operations
CREATE INDEX IF NOT EXISTS idx_user_tiers_user_id ON user_tiers(user_id);

-- Note: users.github_user_id already has implicit index as PRIMARY KEY

-- Additional performance indexes for domains and OAuth
-- Add index on domains.domain for faster referrer validation lookups
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);

-- Add index on domains.user_id for faster user domain lookups
CREATE INDEX IF NOT EXISTS idx_domains_user_id ON domains(user_id);

-- Add index on oauth_state.state for faster OAuth flow performance
CREATE INDEX IF NOT EXISTS idx_oauth_state_state ON oauth_state(state);

-- Additional performance indexes for OAuth cleanup and user lookups
-- Add index on oauth_state.created_at for efficient cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_oauth_state_created_at ON oauth_state(created_at);

-- Add index on users.username for faster username-based lookups (if used)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Optimize query planner with latest statistics
PRAGMA optimize;
