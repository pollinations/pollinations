-- User tiers table for premium features
CREATE TABLE IF NOT EXISTS user_tiers (
  user_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'seed', -- 'seed', 'flower', 'nectar'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(github_user_id) ON DELETE CASCADE
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_tiers_tier ON user_tiers(tier);
