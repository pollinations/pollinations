-- Migration to add PKCE and JWT support

-- Add PKCE fields to auth_sessions
ALTER TABLE auth_sessions ADD COLUMN code_verifier TEXT;
ALTER TABLE auth_sessions ADD COLUMN code_challenge TEXT;
ALTER TABLE auth_sessions ADD COLUMN code_challenge_method TEXT;
ALTER TABLE auth_sessions ADD COLUMN redirect_uri TEXT;
ALTER TABLE auth_sessions ADD COLUMN client_id TEXT;

-- Add JWT token tracking table
CREATE TABLE IF NOT EXISTS jwt_tokens (
  jti TEXT PRIMARY KEY, -- JWT ID
  github_user_id TEXT NOT NULL,
  token_type TEXT NOT NULL, -- 'access' or 'refresh'
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (github_user_id) REFERENCES users(github_user_id)
);

-- Add index for efficient token lookups
CREATE INDEX idx_jwt_tokens_user_id ON jwt_tokens(github_user_id);
CREATE INDEX idx_jwt_tokens_expires_at ON jwt_tokens(expires_at);

-- Add OAuth client registration table for dynamic client registration
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret TEXT,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL, -- JSON array
  grant_types TEXT NOT NULL, -- JSON array
  response_types TEXT NOT NULL, -- JSON array
  scope TEXT,
  contacts TEXT, -- JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
