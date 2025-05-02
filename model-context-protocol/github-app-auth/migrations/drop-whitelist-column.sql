-- Migration script to drop the old domain_whitelist column
-- This should only be run after confirming the domain_allowlist column is working correctly

-- Drop the old column
ALTER TABLE users DROP COLUMN domain_whitelist;
