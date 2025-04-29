-- GitHub App Authentication Schema

-- Users table stores GitHub user information and tokens
CREATE TABLE IF NOT EXISTS users (
  github_id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  access_token TEXT NOT NULL,
  app_installation_id TEXT,
  installation_token TEXT,
  token_expiry TIMESTAMP,
  domain_whitelist TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auth sessions table for tracking OAuth flow
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  state TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(github_id)
);
