-- Performance optimization: Add missing index on api_tokens.token
-- GitHub Issue: #3258 - Performance Investigation: Authentication Method Impact on Request Processing Time
-- 
-- This index is critical for token validation performance. Without it, the validateApiTokenComplete
-- query performs a full table scan on api_tokens, causing 6-8 second query times under load.
-- 
-- Expected performance improvement: 6-8 seconds → <100ms for token validation queries

-- Add explicit index on api_tokens.token for faster lookups in validateApiTokenComplete
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);

-- Verify the index was created successfully
-- This will help with debugging if the migration fails
SELECT name FROM sqlite_master WHERE type='index' AND name='idx_api_tokens_token';
