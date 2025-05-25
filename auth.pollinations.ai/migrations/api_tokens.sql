-- API tokens for external service access
CREATE TABLE IF NOT EXISTS api_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(github_user_id) ON DELETE CASCADE
);

-- Index for looking up tokens by user
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
