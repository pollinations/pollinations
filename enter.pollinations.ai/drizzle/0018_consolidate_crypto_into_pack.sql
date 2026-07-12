-- Custom SQL migration file, put your code below! --
-- Consolidate crypto_balance into pack_balance.
-- Crypto purchases now credit pack_balance directly via webhooks-crypto.ts.
-- This migrates existing crypto holdings into the pack bucket.
-- The crypto_balance column itself is kept (zeroed) for now; drop happens in a later migration after soak.

UPDATE user
SET pack_balance = COALESCE(pack_balance, 0) + COALESCE(crypto_balance, 0),
    crypto_balance = 0
WHERE COALESCE(crypto_balance, 0) > 0;
