-- Migration to add subdomains table
-- Created: 2025-07-03

-- Subdomains table for user subdomain management
CREATE TABLE IF NOT EXISTS subdomains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'github_pages', -- Source type (github_pages, custom, etc.)
  repo TEXT, -- GitHub repository (username/repo)
  custom_domain BOOLEAN DEFAULT 0, -- Whether a custom domain is used
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_published TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subdomain),
  FOREIGN KEY (user_id) REFERENCES users(github_user_id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_subdomains_user_id ON subdomains(user_id);
CREATE INDEX IF NOT EXISTS idx_subdomains_subdomain ON subdomains(subdomain);

-- Log migration
INSERT INTO migrations (name, applied_at)
VALUES ('add_subdomains_table', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;