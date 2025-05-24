-- Ultra-simplified schema for GitHub auth (thin proxy design)
CREATE TABLE IF NOT EXISTS users (
  github_user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Domain allowlist table
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, domain),
  FOREIGN KEY (user_id) REFERENCES users(github_user_id)
);

-- Create index for faster domain lookups
CREATE INDEX IF NOT EXISTS idx_domains_user_id ON domains(user_id);

-- Temporary OAuth flow state
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_oauth_state_created ON oauth_state(created_at);
