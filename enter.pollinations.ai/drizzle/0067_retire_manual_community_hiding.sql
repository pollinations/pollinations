-- Preserve the latest submitted configuration before making manually hidden
-- listings private. Monitor-hidden rows return to the reliability filter.
UPDATE community_endpoint
SET visibility = 'private',
    payload = COALESCE(pending_payload, payload),
    pending_payload = NULL,
    pending_visibility = NULL,
    pending_at = NULL,
    updated_at = unixepoch()
WHERE hidden_at IS NOT NULL
  AND (hidden_by IS NULL OR hidden_by != 'monitor');
