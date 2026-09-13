-- Run only after Enter and Gen support endpoint-agent modality declarations.
-- Keep the existing listing IDs, URLs, aliases, ownership and permissions.
UPDATE community_endpoint
SET payload = json_set(
        payload,
        '$.inputModalities', json('["text","image","audio","video"]'),
        '$.outputModalities', json('["text","image","audio","video"]')
    ),
    updated_at = unixepoch()
WHERE name = 'floret'
  AND type = 'endpoint_agent'
  AND owner_user_id IN (
      SELECT id FROM user WHERE github_username = 'pollinations-router'
  );

-- Replace the proxy contract with delegated agent billing. The gateway mints
-- a run token for each caller instead of using the proxy's saved bearer.
-- Restrict this conversion to the existing Polli target, with no queued edits.
-- Once converted, retries must not undo a later hide or other agent edits.
UPDATE community_endpoint
SET type = 'endpoint_agent',
    payload = json_object(
        'api', 'chat_completions',
        'perUserRpm', json_extract(payload, '$.perUserRpm'),
        'inputModalities', json('["text","image"]'),
        'outputModalities', json('["text"]')
    ),
    hidden_at = NULL,
    hidden_reason = NULL,
    hidden_by = NULL,
    updated_at = unixepoch()
WHERE name = 'polli'
  AND type = 'proxy'
  AND base_url = 'https://polli.pollinations.ai/v1/chat/completions'
  AND upstream_model = 'polli'
  AND pending_payload IS NULL
  AND pending_visibility IS NULL
  AND pending_at IS NULL
  AND owner_user_id IN (
      SELECT id FROM user WHERE github_username = 'pollinations-router'
  );
