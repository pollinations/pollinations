-- Simple schema for GitHub auth
CREATE TABLE IF NOT EXISTS users (
  github_user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar_url TEXT,
  email TEXT,
  domain_allowlist TEXT, -- JSON array of allowed domains
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Temporary OAuth flow state
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_oauth_state_created ON oauth_state(created_at);
