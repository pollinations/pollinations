-- GitHub App Authentication Schema

-- Users table stores GitHub user information and tokens
CREATE TABLE IF NOT EXISTS users (
  github_user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  app_installation_id TEXT,
  installation_token TEXT,
  token_expiry TIMESTAMP,
  domain_allowlist TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auth sessions table for tracking OAuth flow
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  github_user_id TEXT,
  state TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (github_user_id) REFERENCES users(github_user_id)
);
