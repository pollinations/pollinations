-- Listings saved before paid-only support have no paidOnly key; they were
-- treated as not paid-only. Store it explicitly so the payload schema can
-- require a boolean.
UPDATE community_endpoint
SET payload = json_set(payload, '$.paidOnly', json('false'))
WHERE type = 'proxy'
  AND COALESCE(json_type(payload, '$.paidOnly'), '') NOT IN ('true', 'false');

UPDATE community_endpoint
SET pending_payload = json_set(pending_payload, '$.paidOnly', json('false'))
WHERE type = 'proxy'
  AND pending_payload IS NOT NULL
  AND COALESCE(json_type(pending_payload, '$.paidOnly'), '') NOT IN ('true', 'false');
