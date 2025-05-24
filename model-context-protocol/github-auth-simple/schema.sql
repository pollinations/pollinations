-- Ultra-simplified schema for GitHub auth (thin proxy design)
CREATE TABLE IF NOT EXISTS users (
  github_user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  -- Note: The following fields exist in the production database but are no longer used by the application
  -- avatar_url TEXT,
  -- email TEXT,
  -- domain_allowlist TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Temporary OAuth flow state
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API tokens for external service access
CREATE TABLE IF NOT EXISTS api_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(github_user_id) ON DELETE CASCADE
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_oauth_state_created ON oauth_state(created_at);
-- Index for looking up tokens by user
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
