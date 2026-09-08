-- Polli accepts delegated ag_ tokens, but its production listing is a proxy.
-- That sends the saved upstream bearer instead and results in a 401/502.
-- Convert this exact listing to an endpoint agent: Gen supplies a run token,
-- and callers pay downstream usage without the old wrapper token prices.
--
-- Manual repair, deliberately outside automatic database migrations.
-- Before applying:
-- 1. Obtain approval for the billing change and removal of the stored
--    payload.bearerTokenCiphertext from this production registration.
-- 2. Securely back up the original row for rollback; never print its payload
--    or commit the backup. The payload contains an encrypted credential.
-- 3. Execute against production D1 using an explicit environment and this file.
--    Require changes() = 1; if zero, inspect current state before proceeding.
-- 4. Probe the exact model ID through Gen with authenticated non-streaming and
--    streaming requests; verify terminal usage and downstream billing.
-- 5. Relist only after the probes pass. This repair preserves the hidden state;
--    hidden models remain callable by exact ID for verification.
-- Rollback: restore type, payload and updated_at from the protected backup.
-- If the listing was relisted, restore its original hidden fields as well.

UPDATE community_endpoint
SET type = 'endpoint_agent',
    payload = json_object(
        'api', json_extract(payload, '$.api'),
        'perUserRpm', json_extract(payload, '$.perUserRpm')
    ),
    updated_at = unixepoch()
WHERE id = '3ba66897-e040-41b5-8cf5-7c561ee5c52f'
  AND name = 'polli'
  AND owner_user_id IN (
      SELECT id FROM user WHERE github_username = 'pollinations-router'
  )
  AND type = 'proxy'
  AND base_url = 'https://polli.pollinations.ai/v1/chat/completions'
  AND upstream_model = 'polli'
  AND json_extract(payload, '$.modality') = 'text'
  AND json_extract(payload, '$.api') = 'chat_completions'
  AND pending_at IS NULL
  AND pending_payload IS NULL
  AND pending_visibility IS NULL;

-- Report only non-secret fields, including the affected-row count.
SELECT changes() AS changed_rows, id, type, base_url, upstream_model,
       visibility, hidden_at,
       json_extract(payload, '$.api') AS api,
       json_extract(payload, '$.perUserRpm') AS per_user_rpm
FROM community_endpoint
WHERE id = '3ba66897-e040-41b5-8cf5-7c561ee5c52f';
