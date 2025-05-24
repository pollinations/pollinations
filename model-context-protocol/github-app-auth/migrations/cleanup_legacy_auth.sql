-- Migration to remove legacy authentication fields

-- Remove access_token from users table as we're using JWT tokens now
-- Keep the table for user tracking but remove token storage
ALTER TABLE users DROP COLUMN access_token;

-- Remove the old auth_sessions table as we're using PKCE sessions now
-- The PKCE data is stored with the new fields added in the previous migration
-- We'll keep the table but only use it for OAuth flow tracking
-- No changes needed as the table is still used for OAuth state tracking
