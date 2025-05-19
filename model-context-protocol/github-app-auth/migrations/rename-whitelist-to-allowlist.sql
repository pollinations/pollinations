-- Migration script to rename domain_whitelist to domain_allowlist
-- This ensures backward compatibility by creating a new column and copying data

-- Step 1: Add the new column
ALTER TABLE users ADD COLUMN domain_allowlist TEXT;

-- Step 2: Copy data from old column to new column
UPDATE users SET domain_allowlist = domain_whitelist WHERE domain_whitelist IS NOT NULL;

-- We're not dropping the old column immediately to ensure backward compatibility
-- After confirming everything works, you can run:
-- ALTER TABLE users DROP COLUMN domain_whitelist;
